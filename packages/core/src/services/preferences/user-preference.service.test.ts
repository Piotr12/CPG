import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GlobalAuditEvent, initOrm, User, UserPreference, type Orm } from "@cpg/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import type { AuditActor } from "../audit/actor";
import { DEFAULT_PREFERENCES, UserPreferenceService } from "./user-preference.service";

/** The account changes its own preferences, on the UI. */
const ACTOR: AuditActor = { userId: "alice-id", username: "alice", sessionId: "alice-session", channel: "ui", token: null };

describe("UserPreferenceService", () => {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-preference-service-")) });
  let orm: Orm;
  let alice: string;
  let bob: string;

  const service = () => new UserPreferenceService({ em: orm.em.fork() });
  const rows = () => orm.em.fork().count(UserPreference, {});
  /** The account's preference entries in the Global audit, oldest first, as [before, after]. */
  const audit = async (userId: string) =>
    (await orm.em.fork().find(GlobalAuditEvent, { subjectId: userId }, { orderBy: { occurredAt: "asc", id: "asc" } })).map(
      ({ action, before, after }) => [action, before, after],
    );

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
    expect(await service().update(alice, { locale: "pl" }, ACTOR)).toEqual({ locale: "pl", theme: "light" });
    expect(await service().get(alice)).toEqual({ locale: "pl", theme: "light" });
  });

  it("changes the theme without touching the stored language", async () => {
    await service().update(alice, { locale: "pl" }, ACTOR);

    expect(await service().update(alice, { theme: "dark", locale: undefined }, ACTOR)).toEqual({ locale: "pl", theme: "dark" });
    expect(await service().get(alice)).toEqual({ locale: "pl", theme: "dark" });
  });

  it("keeps each account's choice to itself (UX-003)", async () => {
    await service().update(alice, { locale: "pl", theme: "dark" }, ACTOR);

    expect(await service().get(bob)).toEqual({ locale: "en", theme: "light" });
    expect(await service().get(alice)).toEqual({ locale: "pl", theme: "dark" });
  });

  it("keeps one row per account however often it changes", async () => {
    await Promise.all([service().update(alice, { theme: "dark" }, ACTOR), service().update(alice, { theme: "dark" }, ACTOR)]);
    await service().update(alice, { locale: "pl" }, ACTOR);

    expect(await rows()).toBe(1);
  });

  it("never loses one of two changes made at the same moment", async () => {
    await Promise.all([service().update(alice, { locale: "pl" }, ACTOR), service().update(alice, { theme: "dark" }, ACTOR)]);

    expect(await service().get(alice)).toEqual({ locale: "pl", theme: "dark" });
  });

  it("stamps every change, not only the first", async () => {
    const updatedAt = async () => (await orm.em.fork().findOneOrFail(UserPreference, { user: alice })).updatedAt;
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T09:00:00Z") });
    try {
      await service().update(alice, { locale: "pl" }, ACTOR);
      expect(await updatedAt()).toEqual(new Date("2026-10-19T09:00:00Z"));

      vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
      await service().update(alice, { theme: "dark" }, ACTOR);
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

  describe("audit", () => {
    it("records a first choice against the defaults it replaces, with its actor", async () => {
      await service().update(alice, { theme: "dark" }, ACTOR);

      expect(await audit(alice)).toEqual([
        ["preferences.user-preference.updated", { locale: "en", theme: "light" }, { locale: "en", theme: "dark" }],
      ]);
      expect(await orm.em.fork().findOneOrFail(GlobalAuditEvent, { subjectId: alice })).toMatchObject({
        subjectType: "User",
        subjectLabel: "alice",
        actorUsername: "alice",
        sessionId: "alice-session",
        channel: "ui",
      });
    });

    it("chains before/after across changes, and records nothing when nothing changes", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T09:00:00Z") });
      try {
        await service().update(alice, { locale: "pl" }, ACTOR);
        vi.setSystemTime(new Date("2026-10-19T09:01:00Z"));
        await service().update(alice, { theme: "dark" }, ACTOR);
        await service().update(alice, { theme: "dark", locale: "pl" }, ACTOR);
      } finally {
        vi.useRealTimers();
      }

      expect(await audit(alice)).toEqual([
        ["preferences.user-preference.updated", { locale: "en", theme: "light" }, { locale: "pl", theme: "light" }],
        ["preferences.user-preference.updated", { locale: "pl", theme: "light" }, { locale: "pl", theme: "dark" }],
      ]);
      expect(await service().get(alice)).toEqual({ locale: "pl", theme: "dark" });
    });

    it("records both of two changes made at the same moment", async () => {
      await Promise.all([service().update(alice, { locale: "pl" }, ACTOR), service().update(alice, { theme: "dark" }, ACTOR)]);

      const entries = await audit(alice);
      expect(entries).toHaveLength(2);
      expect(entries.map(([, , after]) => after)).toContainEqual({ locale: "pl", theme: "dark" });
    });

    it("refuses an account that doesn't exist, storing nothing", async () => {
      await expect(service().update("no-such-account", { theme: "dark" }, ACTOR)).rejects.toThrow();

      expect(await rows()).toBe(0);
      expect(await audit("no-such-account")).toEqual([]);
    });
  });
});
