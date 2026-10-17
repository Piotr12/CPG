import { describe, expect, it } from "vitest";
import { createOrmConfig } from "./config";
import { entities } from "./entities";
import { migrations } from "./migrations";

describe("createOrmConfig", () => {
  it("lists entities and migrations explicitly and never snapshots at runtime", () => {
    const config = createOrmConfig({ databasePath: "/data/cpg.sqlite" });

    expect(config.dbName).toBe("/data/cpg.sqlite");
    expect(config.entities).toBe(entities);
    expect(config.debug).toBe(false);
    expect(config.migrations).toEqual({ migrationsList: migrations, snapshotOnMigrate: false });
  });

  it("passes the debug flag through", () => {
    expect(createOrmConfig({ databasePath: "/db", debug: true }).debug).toBe(true);
  });

  it("applies overrides, merging migration options", () => {
    const config = createOrmConfig(
      { databasePath: "/db" },
      { dbName: "/other", migrations: { path: "/migrations", snapshotOnMigrate: true } },
    );

    expect(config.dbName).toBe("/other");
    expect(config.migrations).toEqual({ migrationsList: migrations, path: "/migrations", snapshotOnMigrate: true });
  });
});
