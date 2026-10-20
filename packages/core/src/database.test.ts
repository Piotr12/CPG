import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ApiToken, initOrm, Session, Setting, User } from "@cpg/db";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { migrateDatabase, revokeAdminTokensIfPasswordChanged, revokeBuiltInAdminSessions, toDbOptions } from "./database";
import { ADMIN_PASSWORD_SETTING } from "./services/auth/admin-password-stamp";
import { verifyPassword } from "./services/auth/password-hash";

describe("toDbOptions", () => {
  it("passes on the database path and the SQL debug flag", () => {
    const config = loadConfig({ DATA_DIR: "/data", DEBUG_SQL: "1" });

    expect(toDbOptions(config)).toEqual({ databasePath: "/data/cpg.sqlite", debug: true });
  });
});

describe("migrateDatabase", () => {
  it("applies pending migrations once", async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-core-")) });

    expect(await migrateDatabase(config)).toEqual([
      "Migration20261017091007_initial",
      "Migration20261019080354_auth_users_sessions",
      "Migration20261019090456_user_preferences",
      "Migration20261019092708_tenants",
      "Migration20261019103355_users_password_active",
      "Migration20261019110502_audit_events",
      "Migration20261019115945_api_tokens",
      "Migration20261019155802_api_idempotency",
      "Migration20261019191302_materials",
      "Migration20261019202843_locations_customers_suppliers",
      "Migration20261019211303_tenant_read_only",
      "Migration20261020054509_planning_parameters_safety_stock",
      "Migration20261020080940_boms",
      "Migration20261020164229_stock_ledger",
    ]);
    expect(await migrateDatabase(config)).toEqual([]);
  });
});

describe("revokeBuiltInAdminSessions", () => {
  it("deletes only the built-in admin's sessions and closes its connection", async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-revoke-")) });
    await migrateDatabase(config);
    const orm = await initOrm(toDbOptions(config));
    try {
      const em = orm.em.fork();
      const admin = em.create(User, { username: "admin", role: "admin" });
      const user = em.create(User, { username: "grok", role: "user" });
      const expiresAt = new Date(Date.now() + 60_000);
      em.create(Session, { tokenHash: "a".repeat(64), user: admin, expiresAt });
      em.create(Session, { tokenHash: "b".repeat(64), user: admin, expiresAt });
      em.create(Session, { tokenHash: "c".repeat(64), user, expiresAt });
      await em.flush();

      expect(await revokeBuiltInAdminSessions(config)).toBe(2);

      const left = await orm.em.fork().find(Session, {}, { populate: ["user"] });
      expect(left.map((session) => session.user.username)).toEqual(["grok"]);
    } finally {
      await orm.close();
    }
  });

  it("does nothing on a database without an admin yet", async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-revoke-empty-")) });
    await migrateDatabase(config);

    expect(await revokeBuiltInAdminSessions(config)).toBe(0);
  });
});

describe("revokeAdminTokensIfPasswordChanged", () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "cpg-admin-tokens-"));
  const configWith = (password: string | undefined) =>
    loadConfig({ DATA_DIR: dataDir, ...(password ? { CPG_ADMIN_PASSWORD: password } : {}) });

  /** The admin and a normal user, each holding one token. */
  async function seedTokens(): Promise<void> {
    const orm = await initOrm(toDbOptions(configWith(undefined)));
    try {
      const em = orm.em.fork();
      const admin = (await em.findOne(User, { username: "admin" })) ?? em.create(User, { username: "admin", role: "admin" });
      const grok = (await em.findOne(User, { username: "grok" })) ?? em.create(User, { username: "grok", role: "user" });
      await em.nativeDelete(ApiToken, {});
      em.create(ApiToken, { user: admin, name: "ops", tokenHash: "a".repeat(64) });
      em.create(ApiToken, { user: grok, name: "build", tokenHash: "b".repeat(64) });
      await em.flush();
    } finally {
      await orm.close();
    }
  }

  async function state(): Promise<{ owners: string[]; stamp: string | undefined }> {
    const orm = await initOrm(toDbOptions(configWith(undefined)));
    try {
      const em = orm.em.fork();
      const tokens = await em.find(ApiToken, {}, { populate: ["user"], orderBy: { name: "asc" } });
      const stamp = await em.findOne(Setting, { key: ADMIN_PASSWORD_SETTING });
      return { owners: tokens.map((token) => token.user.username), stamp: stamp?.value };
    } finally {
      await orm.close();
    }
  }

  it("on the first start, stamps the password and revokes whatever admin token exists (fail closed)", async () => {
    await migrateDatabase(configWith(undefined));
    await seedTokens();

    expect(await revokeAdminTokensIfPasswordChanged(configWith("first admin password"))).toBe(1);

    const { owners, stamp } = await state();
    expect(owners).toEqual(["grok"]);
    expect(await verifyPassword("first admin password", stamp!)).toBe(true);
  });

  it("keeps the admin's tokens on a restart with the same password (API-009)", async () => {
    await seedTokens();
    const before = (await state()).stamp;

    expect(await revokeAdminTokensIfPasswordChanged(configWith("first admin password"))).toBe(0);

    expect(await state()).toEqual({ owners: ["grok", "admin"], stamp: before });
  });

  it("deletes only the admin's tokens and re-stamps when the password changed (R06)", async () => {
    await seedTokens();

    expect(await revokeAdminTokensIfPasswordChanged(configWith("second admin password"))).toBe(1);

    const { owners, stamp } = await state();
    expect(owners).toEqual(["grok"]);
    expect(await verifyPassword("second admin password", stamp!)).toBe(true);
    expect(await verifyPassword("first admin password", stamp!)).toBe(false);
  });

  it("does nothing without a configured password", async () => {
    await seedTokens();

    expect(await revokeAdminTokensIfPasswordChanged(configWith(undefined))).toBe(0);

    expect((await state()).owners).toHaveLength(2);
  });
});
