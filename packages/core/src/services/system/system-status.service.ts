import { getMigrationStatus, pingDatabase, Setting, type EntityManager, type Orm } from "@cpg/db";
import type { AppConfig } from "../../config";

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

  /**
   * Throws if the database can't be queried. It answers while a realistic Test reset holds the
   * connection in its transaction, so `/up` stays up meanwhile (#185).
   */
  async ping(): Promise<void> {
    await pingDatabase(this.orm);
  }

  async getStatus(): Promise<SystemStatus> {
    const [migrations, settings] = await Promise.all([getMigrationStatus(this.orm), this.em.count(Setting)]);

    return {
      databasePath: this.config.databasePath,
      appliedMigrations: migrations.applied,
      pendingMigrations: migrations.pending,
      settings,
    };
  }
}
