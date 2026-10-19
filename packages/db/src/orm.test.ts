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
      "Migration20261019103355_users_password_active",
      "Migration20261019110502_audit_events",
      "Migration20261019115945_api_tokens",
      "Migration20261019155802_api_idempotency",
    ]);
    expect(await migrate({ databasePath })).toEqual([]);
  });
});

describe("getMigrationStatus", () => {
  it("counts applied and pending migrations, including on a never-migrated database", async () => {
    const databasePath = tempDatabase();
    const orm = await initOrm({ databasePath });

    try {
      expect(await getMigrationStatus(orm)).toEqual({ applied: 0, pending: 8 });
      await orm.migrator.up();
      expect(await getMigrationStatus(orm)).toEqual({ applied: 8, pending: 0 });
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
            "select name from sqlite_master where name in ('setting', 'user', 'session', 'user_preference', 'tenant', 'api_token', 'global_audit_event', 'tenant_audit_event', 'global_idempotency_key', 'tenant_idempotency_key')",
          )
      )
        .map(({ name }) => name)
        .sort();

    const userColumns = async () =>
      (await orm.em.getConnection().execute<{ name: string }[]>("select name from pragma_table_info('user')"))
        .map(({ name }) => name)
        .sort();

    const triggers = async () =>
      (await orm.em.getConnection().execute<{ name: string }[]>("select name from sqlite_master where type = 'trigger'"))
        .map(({ name }) => name)
        .sort();

    try {
      expect(await tables()).toEqual([
        "api_token",
        "global_audit_event",
        "global_idempotency_key",
        "session",
        "setting",
        "tenant",
        "tenant_audit_event",
        "tenant_idempotency_key",
        "user",
        "user_preference",
      ]);
      expect(await userColumns()).toEqual(["active", "created_at", "id", "password_hash", "role", "username", "version"]);
      await orm.migrator.down();
      expect(await userColumns()).toEqual(["active", "created_at", "id", "password_hash", "role", "username"]);
      expect(await tables()).toEqual([
        "api_token",
        "global_audit_event",
        "session",
        "setting",
        "tenant",
        "tenant_audit_event",
        "user",
        "user_preference",
      ]);
      await orm.migrator.down();
      expect(await tables()).toEqual([
        "global_audit_event",
        "session",
        "setting",
        "tenant",
        "tenant_audit_event",
        "user",
        "user_preference",
      ]);
      expect(await triggers()).toEqual([
        "global_audit_event_no_delete",
        "global_audit_event_no_update",
        "tenant_audit_event_no_delete",
        "tenant_audit_event_no_update",
      ]);
      await orm.migrator.down();
      expect(await triggers()).toEqual([]);
      expect(await tables()).toEqual(["session", "setting", "tenant", "user", "user_preference"]);
      expect(await userColumns()).toEqual(["active", "created_at", "id", "password_hash", "role", "username"]);
      await orm.migrator.down();
      expect(await userColumns()).toEqual(["created_at", "id", "role", "username"]);
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

describe("users-password-active migration", () => {
  it("keeps the existing admin row active, with no password hash", async () => {
    const databasePath = tempDatabase();
    const orm = await initOrm({ databasePath });

    try {
      await orm.migrator.up({ to: "Migration20261019092708_tenants" });
      await orm.em
        .getConnection()
        .execute("insert into user (id, username, role, created_at) values ('a1', 'admin', 'admin', 0)");
      await orm.migrator.up();

      expect(
        await orm.em.getConnection().execute("select username, active, password_hash from user"),
      ).toEqual([{ username: "admin", active: 1, password_hash: null }]);
    } finally {
      await orm.close();
    }
  });
});
