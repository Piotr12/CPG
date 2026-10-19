import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GlobalAuditEvent, initOrm, Session, User, type Orm } from "@cpg/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { ConflictError, NotFoundError } from "../../http/errors";
import { verifyPassword } from "../auth/password-hash";
import { USER_NOT_FOUND, USERNAME_TAKEN, UserService } from "./user.service";
import type { AuditActor } from "../audit/actor";

const PASSWORD = "initial password 1";
/** Who the tests act as: the admin, on the UI. */
const ACTOR: AuditActor = { userId: "admin-id", username: "admin", sessionId: "admin-session", channel: "ui", token: null };
const MISSING_ID = "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f";

describe("UserService", () => {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-user-service-")) });
  let orm: Orm;

  const service = () => new UserService({ em: orm.em.fork() });
  const stored = (username: string) => orm.em.fork().findOneOrFail(User, { username });
  const sessionCount = (username: string) => orm.em.fork().count(Session, { user: { username } });
  /** The Global audit entries about one account, oldest first (the audit is never cleared). */
  const auditOf = (userId: string) =>
    orm.em.fork().find(GlobalAuditEvent, { subjectId: userId }, { orderBy: { occurredAt: "asc", id: "asc" } });
  /** Opens `count` sessions for the user, as sign-ins would. */
  async function openSessions(username: string, count: number): Promise<void> {
    const em = orm.em.fork();
    const user = await em.findOneOrFail(User, { username });
    for (let i = 0; i < count; i++) {
      em.create(Session, {
        tokenHash: `${username}-${i}`.padEnd(64, "0"),
        user,
        expiresAt: new Date(Date.now() + 60_000),
      });
    }
    await em.flush();
  }

  beforeAll(async () => {
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
  });
  afterAll(() => orm.close());
  beforeEach(async () => {
    await orm.em.fork().nativeDelete(Session, {});
    await orm.em.fork().nativeDelete(User, {});
  });
  afterEach(() => vi.restoreAllMocks());

  describe("create", () => {
    it("stores an active normal user with a lowercased name and an argon2id hash, never the password", async () => {
      const created = await service().create({ username: "  Alice ", password: PASSWORD }, ACTOR);

      expect(created).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        username: "alice",
        role: "user",
        active: true,
        createdAt: expect.any(Date),
      });
      const row = await stored("alice");
      expect(row.passwordHash).toMatch(/^\$argon2id\$/);
      expect(row.passwordHash).not.toContain(PASSWORD);
      expect(await verifyPassword(PASSWORD, row.passwordHash!)).toBe(true);
    });

    it("refuses a taken username", async () => {
      await service().create({ username: "alice", password: PASSWORD }, ACTOR);

      await expect(service().create({ username: "ALICE", password: PASSWORD }, ACTOR)).rejects.toEqual(
        new ConflictError(USERNAME_TAKEN),
      );
    });

    it("reserves admin even before the built-in admin's row exists", async () => {
      await expect(service().create({ username: "Admin", password: PASSWORD }, ACTOR)).rejects.toEqual(
        new ConflictError(USERNAME_TAKEN),
      );
      expect(await orm.em.fork().count(User, {})).toBe(0);
    });

    it("lets other database errors through", async () => {
      const users = service();
      vi.spyOn(Object.getPrototypeOf(orm.em), "flush").mockRejectedValueOnce(new Error("disk full"));

      await expect(users.create({ username: "alice", password: PASSWORD }, ACTOR)).rejects.toThrow("disk full");
    });
  });

  describe("list", () => {
    it("shows the admin first, then usernames A–Z, without password hashes", async () => {
      await service().create({ username: "zed", password: PASSWORD }, ACTOR);
      await service().create({ username: "bob", password: PASSWORD }, ACTOR);
      const em = orm.em.fork();
      em.create(User, { username: "admin", role: "admin" });
      await em.flush();

      const users = await service().list();

      expect(users.map((user) => [user.username, user.role])).toEqual([
        ["admin", "admin"],
        ["bob", "user"],
        ["zed", "user"],
      ]);
      expect(users.every((user) => !("passwordHash" in user))).toBe(true);
    });
  });

  describe("resetPassword", () => {
    it("replaces the hash and ends all of that user's sessions, nobody else's", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      await service().create({ username: "bob", password: PASSWORD }, ACTOR);
      await openSessions("alice", 2);
      await openSessions("bob", 1);

      await service().resetPassword(alice.id, "brand new password", ACTOR);

      const row = await stored("alice");
      expect(await verifyPassword("brand new password", row.passwordHash!)).toBe(true);
      expect(await verifyPassword(PASSWORD, row.passwordHash!)).toBe(false);
      expect(await sessionCount("alice")).toBe(0);
      expect(await sessionCount("bob")).toBe(1);
    });

    it("can't touch the built-in admin or an unknown id", async () => {
      const em = orm.em.fork();
      const admin = em.create(User, { username: "admin", role: "admin" });
      await em.flush();

      await expect(service().resetPassword(admin.id, "brand new password", ACTOR)).rejects.toEqual(
        new NotFoundError("NOT_FOUND", USER_NOT_FOUND),
      );
      await expect(service().resetPassword(MISSING_ID, "brand new password", ACTOR)).rejects.toBeInstanceOf(NotFoundError);
      expect((await stored("admin")).passwordHash).toBeNull();
    });

    it("changes nothing when the transaction fails", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      await openSessions("alice", 2);
      const before = (await stored("alice")).passwordHash;
      const users = service();
      vi.spyOn(Object.getPrototypeOf(orm.em), "flush").mockRejectedValueOnce(new Error("disk full"));

      await expect(users.resetPassword(alice.id, "brand new password", ACTOR)).rejects.toThrow("disk full");

      expect((await stored("alice")).passwordHash).toBe(before);
      expect(await sessionCount("alice")).toBe(2);
      expect((await auditOf(alice.id)).map(({ action }) => action)).toEqual(["users.user.created"]);
    });
  });

  describe("setActive", () => {
    it("deactivates, ending every session, and reactivates with the same password", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      await openSessions("alice", 2);

      expect(await service().setActive(alice.id, false, ACTOR)).toMatchObject({ username: "alice", active: false });
      expect(await sessionCount("alice")).toBe(0);
      expect((await stored("alice")).active).toBe(false);

      expect(await service().setActive(alice.id, true, ACTOR)).toMatchObject({ active: true });
      const row = await stored("alice");
      expect(row.active).toBe(true);
      expect(await verifyPassword(PASSWORD, row.passwordHash!)).toBe(true);
    });

    it("is idempotent", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);

      await service().setActive(alice.id, false, ACTOR);
      await expect(service().setActive(alice.id, false, ACTOR)).resolves.toMatchObject({ active: false });
      await service().setActive(alice.id, true, ACTOR);
      await expect(service().setActive(alice.id, true, ACTOR)).resolves.toMatchObject({ active: true });
    });

    it("keeps sessions when reactivating", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      await openSessions("alice", 1);

      await service().setActive(alice.id, true, ACTOR);

      expect(await sessionCount("alice")).toBe(1);
    });

    it("can't deactivate the built-in admin", async () => {
      const em = orm.em.fork();
      const admin = em.create(User, { username: "admin", role: "admin" });
      await em.flush();

      await expect(service().setActive(admin.id, false, ACTOR)).rejects.toBeInstanceOf(NotFoundError);
      expect((await stored("admin")).active).toBe(true);
    });
  });

  describe("audit", () => {
    // A controlled clock: entries made in one millisecond would otherwise be ordered by their ids.
    let now = Date.parse("2026-10-19T11:00:00Z");
    const later = () => vi.setSystemTime((now += 1000));
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"], now });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("records each change once, with before/after, actor, session and channel (AUD-001, AUD-003, AUD-015)", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      later();
      await service().resetPassword(alice.id, "brand new password", ACTOR);
      later();
      await service().setActive(alice.id, false, ACTOR);
      later();
      await service().setActive(alice.id, true, ACTOR);

      const entries = await auditOf(alice.id);
      expect(entries.map(({ action, before, after }) => ({ action, before, after }))).toEqual([
        { action: "users.user.created", before: null, after: { username: "alice", role: "user", active: true } },
        { action: "users.user.password-reset", before: null, after: null },
        { action: "users.user.deactivated", before: { active: true }, after: { active: false } },
        { action: "users.user.reactivated", before: { active: false }, after: { active: true } },
      ]);
      for (const entry of entries) {
        expect(entry).toMatchObject({
          subjectType: "User",
          subjectLabel: "alice",
          actorUserId: "admin-id",
          actorUsername: "admin",
          sessionId: "admin-session",
          channel: "ui",
        });
      }
    });

    it("never stores the password or its hash anywhere in an entry (AUD-028)", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      await service().resetPassword(alice.id, "brand new password", ACTOR);
      const { passwordHash } = await stored("alice");

      const raw = JSON.stringify(await auditOf(alice.id));
      expect(raw).not.toContain(PASSWORD);
      expect(raw).not.toContain("brand new password");
      expect(raw).not.toContain(passwordHash!);
      expect(raw).not.toContain("argon2");
    });

    it("records nothing for a change that changes nothing", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      later();
      await service().setActive(alice.id, true, ACTOR);
      await service().setActive(alice.id, false, ACTOR);
      await service().setActive(alice.id, false, ACTOR);

      expect((await auditOf(alice.id)).map(({ action }) => action)).toEqual(["users.user.created", "users.user.deactivated"]);
    });

    it("records nothing when the write fails", async () => {
      await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      const before = await orm.em.fork().count(GlobalAuditEvent, {});

      await expect(service().create({ username: "alice", password: PASSWORD }, ACTOR)).rejects.toBeInstanceOf(ConflictError);

      expect(await orm.em.fork().count(GlobalAuditEvent, {})).toBe(before);
    });

    it("keeps two sessions of one account apart (AUD-008)", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      later();
      await service().setActive(alice.id, false, { ...ACTOR, sessionId: "first-tab" });
      later();
      await service().setActive(alice.id, true, { ...ACTOR, sessionId: "second-tab" });

      const entries = await auditOf(alice.id);
      expect(entries.slice(1).map(({ actorUserId, sessionId }) => [actorUserId, sessionId])).toEqual([
        ["admin-id", "first-tab"],
        ["admin-id", "second-tab"],
      ]);
    });
  });
});
