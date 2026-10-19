import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, Session, User } from "@cpg/db";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { migrateDatabase, revokeBuiltInAdminSessions, toDbOptions } from "./database";

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
      "Migration20261019110425_api_tokens",
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
