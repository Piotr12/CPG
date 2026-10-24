import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ApiToken, GlobalAuditEvent, initOrm, OptimisticLockError, Session, User, type Orm } from "@cpg/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { ConflictError, NotFoundError, VERSION_CONFLICT } from "../../http/errors";
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
  /** The user's version as stored now: what a freshly loaded screen would send back. */
  const versionOf = async (id: string) => (await orm.em.fork().findOneOrFail(User, { id })).version;
  const sessionCount = (username: string) => orm.em.fork().count(Session, { user: { username } });
  const tokenCount = (username: string) => orm.em.fork().count(ApiToken, { user: { username } });
  /** Gives the user `count` API tokens. */
  async function createTokens(username: string, count: number): Promise<void> {
    const em = orm.em.fork();
    const user = await em.findOneOrFail(User, { username });
    for (let i = 0; i < count; i++) {
      em.create(ApiToken, { user, name: `token-${i}`, tokenHash: `${username}-token-${i}`.padEnd(64, "0") });
    }
    await em.flush();
  }
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
        version: 1,
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

    describe("sorted and searched (#217)", () => {
      beforeEach(async () => {
        const em = orm.em.fork();
        // Inserted out of username order, so only the sort can put them in order.
        em.create(User, { username: "zed", role: "user", active: false, createdAt: new Date("2026-10-02T00:00:00Z") });
        em.create(User, { username: "admin", role: "admin", createdAt: new Date("2026-10-01T00:00:00Z") });
        em.create(User, { username: "anna", role: "user", createdAt: new Date("2026-10-03T00:00:00Z") });
        em.create(User, { username: "bob", role: "user", active: false, createdAt: new Date("2026-10-03T00:00:00Z") });
        await em.flush();
      });

      const names = (users: { username: string }[]) => users.map(({ username }) => username);

      it("sorts by role, username, status and creation, both ways, by username within equal values", async () => {
        expect(names(await service().list({ sort: "role", dir: "desc" }))).toEqual(["anna", "bob", "zed", "admin"]);
        expect(names(await service().list({ sort: "username" }))).toEqual(["admin", "anna", "bob", "zed"]);
        expect(names(await service().list({ sort: "username", dir: "desc" }))).toEqual(["zed", "bob", "anna", "admin"]);
        expect(names(await service().list({ sort: "status" }))).toEqual(["bob", "zed", "admin", "anna"]);
        expect(names(await service().list({ sort: "created", dir: "desc" }))).toEqual(["anna", "bob", "zed", "admin"]);
        expect(names(await service().list({ sort: "created" }))).toEqual(["admin", "zed", "anna", "bob"]);
      });

      it("keeps the accounts whose username holds every word, ignoring ASCII case", async () => {
        expect(names(await service().list({ q: "AN" }))).toEqual(["anna"]);
        expect(names(await service().list({ q: "a" }))).toEqual(["admin", "anna"]);
        expect(names(await service().list({ q: "a nn" }))).toEqual(["anna"]);
        expect(names(await service().list({ q: "b", sort: "username", dir: "desc" }))).toEqual(["bob"]);
        expect(names(await service().list({ q: "carol" }))).toEqual([]);
      });
    });
  });

  describe("resetPassword", () => {
    it("replaces the hash and ends all of that user's sessions and tokens, nobody else's (API-012)", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      await service().create({ username: "bob", password: PASSWORD }, ACTOR);
      await openSessions("alice", 2);
      await openSessions("bob", 1);
      await createTokens("alice", 2);
      await createTokens("bob", 1);

      await service().resetPassword(alice.id, "brand new password", await versionOf(alice.id), ACTOR);

      const row = await stored("alice");
      expect(await verifyPassword("brand new password", row.passwordHash!)).toBe(true);
      expect(await verifyPassword(PASSWORD, row.passwordHash!)).toBe(false);
      expect(await sessionCount("alice")).toBe(0);
      expect(await sessionCount("bob")).toBe(1);
      expect(await tokenCount("alice")).toBe(0);
      expect(await tokenCount("bob")).toBe(1);
    });

    it("can't touch the built-in admin or an unknown id", async () => {
      const em = orm.em.fork();
      const admin = em.create(User, { username: "admin", role: "admin" });
      await em.flush();

      await expect(service().resetPassword(admin.id, "brand new password", await versionOf(admin.id), ACTOR)).rejects.toEqual(
        new NotFoundError("NOT_FOUND", USER_NOT_FOUND),
      );
      await expect(service().resetPassword(MISSING_ID, "brand new password", 1, ACTOR)).rejects.toBeInstanceOf(NotFoundError);
      expect((await stored("admin")).passwordHash).toBeNull();
    });

    it("changes nothing when the transaction fails", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      await openSessions("alice", 2);
      await createTokens("alice", 2);
      const before = (await stored("alice")).passwordHash;
      const users = service();
      vi.spyOn(Object.getPrototypeOf(orm.em), "flush").mockRejectedValueOnce(new Error("disk full"));

      await expect(users.resetPassword(alice.id, "brand new password", await versionOf(alice.id), ACTOR)).rejects.toThrow("disk full");

      expect((await stored("alice")).passwordHash).toBe(before);
      expect(await sessionCount("alice")).toBe(2);
      expect(await tokenCount("alice")).toBe(2);
      expect((await auditOf(alice.id)).map(({ action }) => action)).toEqual(["users.user.created"]);
    });
  });

  describe("setActive", () => {
    it("deactivates, ending every session and token, and reactivates with the same password and no token", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      await service().create({ username: "bob", password: PASSWORD }, ACTOR);
      await openSessions("alice", 2);
      await createTokens("alice", 2);
      await createTokens("bob", 1);

      expect(await service().setActive(alice.id, false, await versionOf(alice.id), ACTOR)).toMatchObject({ username: "alice", active: false });
      expect(await sessionCount("alice")).toBe(0);
      expect(await tokenCount("alice")).toBe(0);
      expect(await tokenCount("bob")).toBe(1);
      expect((await stored("alice")).active).toBe(false);

      expect(await service().setActive(alice.id, true, await versionOf(alice.id), ACTOR)).toMatchObject({ active: true });
      const row = await stored("alice");
      expect(row.active).toBe(true);
      expect(await verifyPassword(PASSWORD, row.passwordHash!)).toBe(true);
      expect(await tokenCount("alice")).toBe(0); // API-011: deleted tokens don't come back
    });

    it("is idempotent", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);

      await service().setActive(alice.id, false, await versionOf(alice.id), ACTOR);
      await expect(service().setActive(alice.id, false, await versionOf(alice.id), ACTOR)).resolves.toMatchObject({ active: false });
      await service().setActive(alice.id, true, await versionOf(alice.id), ACTOR);
      await expect(service().setActive(alice.id, true, await versionOf(alice.id), ACTOR)).resolves.toMatchObject({ active: true });
    });

    it("keeps sessions and tokens when reactivating", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      await openSessions("alice", 1);
      await createTokens("alice", 1);

      await service().setActive(alice.id, true, await versionOf(alice.id), ACTOR);

      expect(await sessionCount("alice")).toBe(1);
      expect(await tokenCount("alice")).toBe(1);
    });

    it("can't deactivate the built-in admin", async () => {
      const em = orm.em.fork();
      const admin = em.create(User, { username: "admin", role: "admin" });
      await em.flush();

      await expect(service().setActive(admin.id, false, await versionOf(admin.id), ACTOR)).rejects.toBeInstanceOf(NotFoundError);
      expect((await stored("admin")).active).toBe(true);
    });
  });

  describe("versions (AUD-024, AUD-025, API-029)", () => {
    const conflict = { code: "VERSION_CONFLICT", status: 409, message: VERSION_CONFLICT };

    it("raises the version on each change, and accepts only the current one", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      expect(alice.version).toBe(1);

      const deactivated = await service().setActive(alice.id, false, 1, ACTOR);
      expect(deactivated.version).toBe(2);
      await expect(service().resetPassword(alice.id, "brand new password", 2, ACTOR)).resolves.toMatchObject({ version: 3 });
    });

    it("refuses a stale edit and keeps the newer change and its audit", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      await service().setActive(alice.id, false, 1, ACTOR);
      const entries = (await auditOf(alice.id)).length;

      await expect(service().setActive(alice.id, true, 1, ACTOR)).rejects.toMatchObject(conflict);
      await expect(service().resetPassword(alice.id, "brand new password", 1, ACTOR)).rejects.toMatchObject(conflict);
      expect(await stored("alice")).toMatchObject({ active: false, version: 2 });
      expect(await auditOf(alice.id)).toHaveLength(entries);
    });

    it("checks the version even when setting the current state, which keeps it", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);

      await expect(service().setActive(alice.id, true, 1, ACTOR)).resolves.toMatchObject({ active: true, version: 1 });
      await service().resetPassword(alice.id, "brand new password", 1, ACTOR);
      await expect(service().setActive(alice.id, true, 1, ACTOR)).rejects.toMatchObject(conflict);
    });

    it("compares with a fresh read, not a copy already in the identity map", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      const users = service();
      await users.list();
      await service().setActive(alice.id, false, 1, ACTOR);

      await expect(users.setActive(alice.id, true, 1, ACTOR)).rejects.toMatchObject(conflict);
      await expect(users.setActive(alice.id, true, 2, ACTOR)).resolves.toMatchObject({ active: true, version: 3 });
    });

    it("reports a change that lands between the read and the flush as VERSION_CONFLICT", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      vi.spyOn(Object.getPrototypeOf(orm.em), "flush").mockRejectedValueOnce(new OptimisticLockError("moved on"));

      await expect(service().setActive(alice.id, false, 1, ACTOR)).rejects.toMatchObject(conflict);
      expect(await stored("alice")).toMatchObject({ active: true, version: 1 });
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
      await service().resetPassword(alice.id, "brand new password", await versionOf(alice.id), ACTOR);
      later();
      await service().setActive(alice.id, false, await versionOf(alice.id), ACTOR);
      later();
      await service().setActive(alice.id, true, await versionOf(alice.id), ACTOR);

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
      await service().resetPassword(alice.id, "brand new password", await versionOf(alice.id), ACTOR);
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
      await service().setActive(alice.id, true, await versionOf(alice.id), ACTOR);
      await service().setActive(alice.id, false, await versionOf(alice.id), ACTOR);
      await service().setActive(alice.id, false, await versionOf(alice.id), ACTOR);

      expect((await auditOf(alice.id)).map(({ action }) => action)).toEqual(["users.user.created", "users.user.deactivated"]);
    });

    it("records nothing when the write fails", async () => {
      await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      const before = await orm.em.fork().count(GlobalAuditEvent, {});

      await expect(service().create({ username: "alice", password: PASSWORD }, ACTOR)).rejects.toBeInstanceOf(ConflictError);

      expect(await orm.em.fork().count(GlobalAuditEvent, {})).toBe(before);
    });

    describe("tokens a reset or deactivation ends (AUD-014)", () => {
      /** The user's API tokens as stored now: id and name. */
      const tokensOf = async (username: string) =>
        (await orm.em.fork().find(ApiToken, { user: { username } }, { orderBy: { name: "asc" } })).map(({ id, name }) => ({ id, name }));
      /** The Global audit entries about these tokens, by token name. */
      const tokenAuditOf = async (tokens: { id: string }[]) =>
        (
          await orm.em.fork().find(GlobalAuditEvent, { subjectType: "ApiToken", subjectId: { $in: tokens.map(({ id }) => id) } })
        ).sort((a, b) => a.subjectLabel.localeCompare(b.subjectLabel));
      const revokedEntry = ({ id, name }: { id: string; name: string }) => ({
        action: "tokens.api-token.revoked",
        subjectType: "ApiToken",
        subjectId: id,
        subjectLabel: name,
        before: { name },
        after: null,
      });

      it("records one revoked entry per token a password reset deletes, by the admin, beside the reset", async () => {
        const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
        await service().create({ username: "bob", password: PASSWORD }, ACTOR);
        await createTokens("alice", 2);
        await createTokens("bob", 1);
        const [alicesTokens, bobsTokens] = [await tokensOf("alice"), await tokensOf("bob")];
        later();

        await service().resetPassword(alice.id, "brand new password", await versionOf(alice.id), ACTOR);

        const entries = await tokenAuditOf(alicesTokens);
        expect(entries).toEqual(alicesTokens.map((token) => expect.objectContaining(revokedEntry(token))));
        const [reset] = (await auditOf(alice.id)).filter(({ action }) => action === "users.user.password-reset");
        for (const entry of entries) {
          expect(entry).toMatchObject({
            actorUserId: "admin-id",
            actorUsername: "admin",
            sessionId: "admin-session",
            channel: "ui",
            tokenId: null,
            occurredAt: reset.occurredAt,
          });
        }
        expect(await tokenAuditOf(bobsTokens)).toEqual([]);
        expect(await tokensOf("bob")).toEqual(bobsTokens);
      });

      it("records them for a deactivation too, naming the admin's token when it came through the API (AUD-007)", async () => {
        const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
        await createTokens("alice", 2);
        const tokens = await tokensOf("alice");
        const apiActor: AuditActor = { ...ACTOR, sessionId: null, channel: "api", token: { id: "admin-token-id", name: "ops" } };

        await service().setActive(alice.id, false, await versionOf(alice.id), apiActor);

        const entries = await tokenAuditOf(tokens);
        expect(entries).toEqual(tokens.map((token) => expect.objectContaining(revokedEntry(token))));
        for (const entry of entries) {
          expect(entry).toMatchObject({ sessionId: null, channel: "api", tokenId: "admin-token-id", tokenName: "ops" });
        }
        expect(await tokenCount("alice")).toBe(0);
      });

      it("records no token entry when the user has no tokens, or when nothing is deleted", async () => {
        const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
        const tokenEntries = () => orm.em.fork().count(GlobalAuditEvent, { subjectType: "ApiToken" });
        const before = await tokenEntries();

        await service().resetPassword(alice.id, "brand new password", await versionOf(alice.id), ACTOR);
        await service().setActive(alice.id, false, await versionOf(alice.id), ACTOR);
        await createTokens("alice", 1);
        await service().setActive(alice.id, false, await versionOf(alice.id), ACTOR);
        await service().setActive(alice.id, true, await versionOf(alice.id), ACTOR);

        expect(await tokenEntries()).toBe(before);
        expect(await tokenCount("alice")).toBe(1);
      });

      it("records nothing and keeps the tokens when the version is stale", async () => {
        const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
        await createTokens("alice", 1);
        const tokens = await tokensOf("alice");

        await expect(service().resetPassword(alice.id, "brand new password", alice.version + 1, ACTOR)).rejects.toMatchObject({
          code: "VERSION_CONFLICT",
        });

        expect(await tokensOf("alice")).toEqual(tokens);
        expect(await tokenAuditOf(tokens)).toEqual([]);
      });

      it("rolls the delete back with the entries when the flush fails after it", async () => {
        const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
        await createTokens("alice", 2);
        const tokens = await tokensOf("alice");
        const users = service();
        vi.spyOn(Object.getPrototypeOf(orm.em), "flush").mockRejectedValueOnce(new OptimisticLockError("moved on"));

        await expect(users.setActive(alice.id, false, await versionOf(alice.id), ACTOR)).rejects.toMatchObject({
          code: "VERSION_CONFLICT",
        });

        expect(await tokensOf("alice")).toEqual(tokens);
        expect(await tokenAuditOf(tokens)).toEqual([]);
      });
    });

    it("keeps two sessions of one account apart (AUD-008)", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD }, ACTOR);
      later();
      await service().setActive(alice.id, false, await versionOf(alice.id), { ...ACTOR, sessionId: "first-tab" });
      later();
      await service().setActive(alice.id, true, await versionOf(alice.id), { ...ACTOR, sessionId: "second-tab" });

      const entries = await auditOf(alice.id);
      expect(entries.slice(1).map(({ actorUserId, sessionId }) => [actorUserId, sessionId])).toEqual([
        ["admin-id", "first-tab"],
        ["admin-id", "second-tab"],
      ]);
    });
  });
});
