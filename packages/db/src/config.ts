import { Migrator } from "@mikro-orm/migrations";
import { defineConfig, type Options } from "@mikro-orm/sqlite";
import { entities } from "./entities";
import { migrations } from "./migrations";
import { TenantEntityManager } from "./tenants/tenant-entity-manager";
import { TenantGuard } from "./tenants/tenant-guard";
import { WriteGate } from "./write-gate";
import type { DbOptions } from "./orm";

/**
 * MikroORM configuration. Entities and migrations are passed explicitly (no folder globbing),
 * because the Next.js build bundles this code and the original files are gone at runtime.
 */
export function createOrmConfig(options: DbOptions, overrides: Partial<Options> = {}): Options {
  return defineConfig({
    dbName: options.databasePath,
    entities,
    // Tenant isolation (R05): bulk write paths refused for tenant-owned entities, flushes checked.
    entityManager: TenantEntityManager,
    // The write gate: a transaction another ORM copy begins during a long write waits for its commit (#185).
    subscribers: [new TenantGuard(), new WriteGate()],
    extensions: [Migrator],
    debug: options.debug ?? false,
    ...overrides,
    migrations: {
      migrationsList: migrations,
      // The schema snapshot is updated only by `npm run db:migration:create`, never at runtime.
      snapshotOnMigrate: false,
      ...overrides.migrations,
    },
  });
}
