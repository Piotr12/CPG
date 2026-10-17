import type { AppConfig } from "@cpg/core";
import { Migrator } from "@mikro-orm/migrations";
import { defineConfig, type Options } from "@mikro-orm/sqlite";
import { entities } from "./entities";
import { migrations } from "./migrations";

/**
 * MikroORM configuration. Entities and migrations are passed explicitly (no folder globbing),
 * because the Next.js build bundles this code and the original files are gone at runtime.
 */
export function createOrmConfig(config: AppConfig, overrides: Partial<Options> = {}): Options {
  return defineConfig({
    dbName: config.databasePath,
    entities,
    extensions: [Migrator],
    debug: config.env === "development" && process.env.DEBUG_SQL === "1",
    ...overrides,
    migrations: {
      migrationsList: migrations,
      // The schema snapshot is updated only by `npm run db:migration:create`, never at runtime.
      snapshotOnMigrate: false,
      ...overrides.migrations,
    },
  });
}
