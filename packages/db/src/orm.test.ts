import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getMigrationStatus, initOrm, migrate } from "./orm";

const tempDatabase = () => path.join(mkdtempSync(path.join(tmpdir(), "cpg-db-")), "nested", "cpg.sqlite");

describe("initOrm", () => {
  it("creates the database directory and switches to WAL mode", async () => {
    const databasePath = tempDatabase();
    const orm = await initOrm({ databasePath });

    try {
      expect(existsSync(path.dirname(databasePath))).toBe(true);
      const [{ journal_mode }] = await orm.em.getConnection().execute("pragma journal_mode");
      expect(journal_mode).toBe("wal");
    } finally {
      await orm.close();
    }
  });

  it("applies config overrides", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() }, { debug: true, logger: () => {} });

    try {
      expect(orm.config.get("debug")).toBe(true);
    } finally {
      await orm.close();
    }
  });
});

describe("migrate", () => {
  it("applies pending migrations once and closes its connection", async () => {
    const databasePath = tempDatabase();

    expect(await migrate({ databasePath })).toEqual([
      "Migration20261017091007_initial",
      "Migration20261019080354_auth_users_sessions",
      "Migration20261019090456_user_preferences",
      "Migration20261019092708_tenants",
    ]);
    expect(await migrate({ databasePath })).toEqual([]);
  });
});

describe("getMigrationStatus", () => {
  it("counts applied and pending migrations, including on a never-migrated database", async () => {
    const databasePath = tempDatabase();
    const orm = await initOrm({ databasePath });

    try {
      expect(await getMigrationStatus(orm)).toEqual({ applied: 0, pending: 4 });
      await orm.migrator.up();
      expect(await getMigrationStatus(orm)).toEqual({ applied: 4, pending: 0 });
    } finally {
      await orm.close();
    }
  });
});

describe("migrations", () => {
  it("can be rolled back, one at a time", async () => {
    const databasePath = tempDatabase();
    await migrate({ databasePath });
    const orm = await initOrm({ databasePath });
    const tables = async () =>
      (
        await orm.em
          .getConnection()
          .execute<{ name: string }[]>(
            "select name from sqlite_master where name in ('setting', 'user', 'session', 'user_preference', 'tenant')",
          )
      )
        .map(({ name }) => name)
        .sort();

    try {
      expect(await tables()).toEqual(["session", "setting", "tenant", "user", "user_preference"]);
      await orm.migrator.down();
      expect(await tables()).toEqual(["session", "setting", "user", "user_preference"]);
      await orm.migrator.down();
      expect(await tables()).toEqual(["session", "setting", "user"]);
      await orm.migrator.down();
      expect(await tables()).toEqual(["setting"]);
      await orm.migrator.down();
      expect(await tables()).toEqual([]);
    } finally {
      await orm.close();
    }
  });
});
