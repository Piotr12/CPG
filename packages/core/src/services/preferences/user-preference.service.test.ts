import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, User, UserPreference, type Orm } from "@cpg/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { DEFAULT_PREFERENCES, UserPreferenceService } from "./user-preference.service";

describe("UserPreferenceService", () => {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-preference-service-")) });
  let orm: Orm;
  let alice: string;
  let bob: string;

  const service = () => new UserPreferenceService({ em: orm.em.fork() });
  const rows = () => orm.em.fork().count(UserPreference, {});

  beforeAll(async () => {
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
  });
  afterAll(() => orm.close());
  beforeEach(async () => {
    await orm.em.fork().nativeDelete(User, {});
    const em = orm.em.fork();
    alice = em.create(User, { username: "alice", role: "user" }).id;
    bob = em.create(User, { username: "bob", role: "user" }).id;
    await em.flush();
  });

  it("gives an account that never chose English and light (UX-001)", async () => {
    expect(DEFAULT_PREFERENCES).toEqual({ locale: "en", theme: "light" });
    expect(await service().get(alice)).toEqual({ locale: "en", theme: "light" });
    expect(await rows()).toBe(0);
  });

  it("stores a language change and keeps the default theme", async () => {
    expect(await service().update(alice, { locale: "pl" })).toEqual({ locale: "pl", theme: "light" });
    expect(await service().get(alice)).toEqual({ locale: "pl", theme: "light" });
  });

  it("changes the theme without touching the stored language", async () => {
    await service().update(alice, { locale: "pl" });

    expect(await service().update(alice, { theme: "dark", locale: undefined })).toEqual({ locale: "pl", theme: "dark" });
    expect(await service().get(alice)).toEqual({ locale: "pl", theme: "dark" });
  });

  it("keeps each account's choice to itself (UX-003)", async () => {
    await service().update(alice, { locale: "pl", theme: "dark" });

    expect(await service().get(bob)).toEqual({ locale: "en", theme: "light" });
    expect(await service().get(alice)).toEqual({ locale: "pl", theme: "dark" });
  });

  it("keeps one row per account however often it changes", async () => {
    await Promise.all([service().update(alice, { theme: "dark" }), service().update(alice, { theme: "dark" })]);
    await service().update(alice, { locale: "pl" });

    expect(await rows()).toBe(1);
  });

  it("never loses one of two changes made at the same moment", async () => {
    await Promise.all([service().update(alice, { locale: "pl" }), service().update(alice, { theme: "dark" })]);

    expect(await service().get(alice)).toEqual({ locale: "pl", theme: "dark" });
  });

  it("stamps every change, not only the first", async () => {
    const updatedAt = async () => (await orm.em.fork().findOneOrFail(UserPreference, { user: alice })).updatedAt;
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T09:00:00Z") });
    try {
      await service().update(alice, { locale: "pl" });
      expect(await updatedAt()).toEqual(new Date("2026-10-19T09:00:00Z"));

      vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
      await service().update(alice, { theme: "dark" });
      expect(await updatedAt()).toEqual(new Date("2026-10-19T10:00:00Z"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not hand out the shared defaults object", async () => {
    const preferences = await service().get(alice);
    preferences.locale = "pl";

    expect(DEFAULT_PREFERENCES.locale).toBe("en");
  });
});
