import type { AppConfig } from "@cpg/core";
import type { EntityManager } from "@mikro-orm/sqlite";
import { Setting } from "../../entities";
import type { Orm } from "../../orm";

export interface SystemStatus {
  databasePath: string;
  appliedMigrations: number;
  pendingMigrations: number;
  settings: number;
}

/** Database health and migration state, for the `/up` health check and the admin dashboard. */
export class SystemStatusService {
  private readonly config: AppConfig;
  private readonly orm: Orm;
  private readonly em: EntityManager;

  constructor({ config, orm, em }: { config: AppConfig; orm: Orm; em: EntityManager }) {
    this.config = config;
    this.orm = orm;
    this.em = em;
  }

  /** Throws if the database can't be queried. */
  async ping(): Promise<void> {
    await this.em.getConnection().execute("select 1");
  }

  async getStatus(): Promise<SystemStatus> {
    const [executed, pending, settings] = await Promise.all([
      this.orm.migrator.getExecuted(),
      this.orm.migrator.getPending(),
      this.em.count(Setting),
    ]);

    return {
      databasePath: this.config.databasePath,
      appliedMigrations: executed.length,
      pendingMigrations: pending.length,
      settings,
    };
  }
}
