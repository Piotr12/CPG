import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initOrm, migrate, type Orm } from "../../orm";
import { User } from "../auth/user.entity";
import { LOCALES, THEMES, UserPreference } from "./user-preference.entity";

describe("UserPreference", () => {
  const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-preferences-")), "cpg.sqlite");
  let orm: Orm;

  beforeAll(async () => {
    await migrate({ databasePath });
    orm = await initOrm({ databasePath });
  });
  afterAll(() => orm.close());

  it("offers English and Polish, light and dark", () => {
    expect(LOCALES).toEqual(["en", "pl"]);
    expect(THEMES).toEqual(["light", "dark"]);
  });

  it("generates a UUID and stamps every write", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T09:00:00Z") });
    try {
      const em = orm.em.fork();
      const user = em.create(User, { username: "grok", role: "user" });
      const preference = em.create(UserPreference, { user, locale: "pl", theme: "light" });
      await em.flush();

      expect(preference.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(preference.updatedAt).toEqual(new Date("2026-10-19T09:00:00Z"));

      vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
      preference.theme = "dark";
      await em.flush();
      expect(preference.updatedAt).toEqual(new Date("2026-10-19T10:00:00Z"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps one row per account", async () => {
    const em = orm.em.fork();
    const user = await em.findOneOrFail(User, { username: "grok" });
    em.create(UserPreference, { user, locale: "en", theme: "light" });

    await expect(em.flush()).rejects.toThrow(/UNIQUE constraint failed: user_preference.user_id/);
  });

  it("rejects a locale or theme outside the lists", async () => {
    const insert = (locale: string, theme: string) =>
      orm.em
        .getConnection()
        .execute(
          "insert into user_preference (id, user_id, locale, theme, updated_at) select 'x', id, ?, ?, 0 from user limit 1",
          [locale, theme],
        );

    await expect(insert("de", "light")).rejects.toThrow(/CHECK constraint failed/);
    await expect(insert("en", "sepia")).rejects.toThrow(/CHECK constraint failed/);
  });

  it("is deleted with its account", async () => {
    await orm.em.getConnection().execute("delete from user where username = 'grok'");

    expect(await orm.em.fork().count(UserPreference, {})).toBe(0);
  });
});
