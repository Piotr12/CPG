import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ApiToken, GlobalAuditEvent, initOrm, Session, Setting, User, type Orm, type UserRole } from "@cpg/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, type AppConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../http/errors";
import { apiActor, uiActor } from "../audit/actor";
import { ADMIN_PASSWORD_SETTING } from "../auth/admin-password-stamp";
import { hashApiTokenSecret } from "../auth/api-token-secret";
import type { SessionUser } from "../auth/auth.service";
import { hashPassword } from "../auth/password-hash";
import { ApiTokenService, LAST_USED_RESOLUTION_MS, TOKEN_NAME_TAKEN, TOKEN_NOT_FOUND } from "./api-token.service";

const ADMIN_PASSWORD = "the admin password 1";
const MISSING_ID = "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f";

describe("ApiTokenService", () => {
  const config = loadConfig({
    DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-api-token-service-")),
    CPG_ADMIN_PASSWORD: ADMIN_PASSWORD,
  });
  let orm: Orm;

  const service = (overrides: Partial<AppConfig> = {}) =>
    new ApiTokenService({ em: orm.em.fork(), config: { ...config, ...overrides } });
  const tokenRows = () => orm.em.fork().find(ApiToken, {}, { populate: ["user"], orderBy: { name: "asc" } });
  /** One account's Global audit entries about API tokens, oldest first (the audit is never cleared). */
  const tokenAudit = (actorUserId: string) =>
    orm.em
      .fork()
      .find(GlobalAuditEvent, { subjectType: "ApiToken", actorUserId }, { orderBy: { occurredAt: "asc", id: "asc" } });

  /** An account with one open session, as a signed-in browser has. */
  async function signedIn(username: string, role: UserRole = "user"): Promise<SessionUser> {
    const em = orm.em.fork();
    const user = em.create(User, { username, role });
    const session = em.create(Session, {
      tokenHash: `${username}-session`.padEnd(64, "0"),
      user,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await em.flush();
    return { sessionId: session.id, userId: user.id, username, role };
  }

  async function stampAdminPassword(password: string): Promise<void> {
    const em = orm.em.fork();
    em.create(Setting, { key: ADMIN_PASSWORD_SETTING, value: await hashPassword(password) });
    await em.flush();
  }

  beforeAll(async () => {
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
  });
  afterAll(() => orm.close());
  beforeEach(async () => {
    const em = orm.em.fork();
    await em.nativeDelete(ApiToken, {});
    await em.nativeDelete(Session, {});
    await em.nativeDelete(User, {});
    await em.nativeDelete(Setting, {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("create", () => {
    it("returns the secret once and stores only its hash (API-001, API-006)", async () => {
      const alice = await signedIn("alice");

      const { token, secret } = await service().create(alice, "agent1");

      expect(secret).toMatch(/^cpg_[A-Za-z0-9_-]{43}$/);
      expect(token).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        name: "agent1",
        createdAt: expect.any(Date),
        lastUsedAt: null,
      });
      const [row] = await tokenRows();
      expect(row.user.username).toBe("alice");
      expect(row.tokenHash).toBe(hashApiTokenSecret(secret));
      expect(JSON.stringify(await service().list(alice.userId))).not.toContain(secret);
    });

    it("rejects a second token with the same name for the same account, keeping the first (API-003)", async () => {
      const alice = await signedIn("alice");
      const { secret } = await service().create(alice, "build");

      await expect(service().create(alice, "build")).rejects.toEqual(new ConflictError(TOKEN_NAME_TAKEN));
      expect(await tokenRows()).toHaveLength(1);
      expect(await service().authenticate(secret)).toMatchObject({ username: "alice" });
    });

    it("lets another account use the same name, and names are case-sensitive (API-004)", async () => {
      const alice = await signedIn("alice");
      const bob = await signedIn("bob");
      await service().create(alice, "build");

      await service().create(bob, "build");
      await service().create(alice, "Build");

      expect((await tokenRows()).map(({ name, user }) => `${user.username}:${name}`).sort()).toEqual([
        "alice:Build",
        "alice:build",
        "bob:build",
      ]);
    });

    it("lets an account hold many tokens (API-005)", async () => {
      const alice = await signedIn("alice");
      for (const name of ["one", "two", "three", "four"]) await service().create(alice, name);

      expect(await service().list(alice.userId)).toHaveLength(4);
    });

    it("refuses when the session is gone, the account inactive or the session someone else's", async () => {
      const alice = await signedIn("alice");
      const bob = await signedIn("bob");
      await orm.em.fork().nativeUpdate(User, { id: bob.userId }, { active: false });

      await expect(service().create({ ...alice, sessionId: MISSING_ID }, "x")).rejects.toThrow(UnauthorizedError);
      await expect(service().create(bob, "x")).rejects.toThrow(UnauthorizedError);
      await expect(service().create({ ...alice, sessionId: bob.sessionId }, "x")).rejects.toThrow(UnauthorizedError);
      expect(await tokenRows()).toEqual([]);
    });

    it("leaves no token when a reset or deactivation commits during the request (R06)", async () => {
      const alice = await signedIn("alice");
      const tokens = service();
      // The reset deletes the sessions just before the insert transaction opens.
      const em = (tokens as unknown as { em: { transactional: (...args: unknown[]) => Promise<unknown> } }).em;
      const transactional = em.transactional.bind(em);
      vi.spyOn(em, "transactional").mockImplementationOnce(async (...args) => {
        await orm.em.fork().nativeDelete(Session, { user: alice.userId });
        return transactional(...args);
      });

      await expect(tokens.create(alice, "agent1")).rejects.toThrow(UnauthorizedError);
      expect(await tokenRows()).toEqual([]);
    });

    it("rethrows anything other than a name clash", async () => {
      const alice = await signedIn("alice");
      const tokens = service();
      const em = (tokens as unknown as { em: { transactional: (...args: unknown[]) => Promise<unknown> } }).em;
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new Error("disk full"));

      await expect(tokens.create(alice, "agent1")).rejects.toThrow("disk full");
    });

    describe("for the admin", () => {
      it("works while the server runs with the stamped password (API-002)", async () => {
        const admin = await signedIn("admin", "admin");
        await stampAdminPassword(ADMIN_PASSWORD);

        const { secret } = await service().create(admin, "ops");

        expect(await service().authenticate(secret)).toMatchObject({ username: "admin", role: "admin" });
      });

      it("refuses without a stamp, with another password, or with none configured", async () => {
        const admin = await signedIn("admin", "admin");

        await expect(service().create(admin, "ops")).rejects.toThrow(UnauthorizedError);
        await stampAdminPassword(ADMIN_PASSWORD);
        await expect(service({ adminPassword: "an older admin password" }).create(admin, "ops")).rejects.toThrow(
          UnauthorizedError,
        );
        await expect(service({ adminPassword: undefined }).create(admin, "ops")).rejects.toThrow(UnauthorizedError);
        expect(await tokenRows()).toEqual([]);
      });

      it("refuses when the stamp changes while the request runs (a deploy with a new password)", async () => {
        const admin = await signedIn("admin", "admin");
        await stampAdminPassword(ADMIN_PASSWORD);
        const tokens = service();
        const em = (tokens as unknown as { em: { transactional: (...args: unknown[]) => Promise<unknown> } }).em;
        const transactional = em.transactional.bind(em);
        vi.spyOn(em, "transactional").mockImplementationOnce(async (...args) => {
          const other = orm.em.fork();
          await other.nativeUpdate(Setting, { key: ADMIN_PASSWORD_SETTING }, { value: await hashPassword("new password!!") });
          return transactional(...args);
        });

        await expect(tokens.create(admin, "ops")).rejects.toThrow(UnauthorizedError);
        expect(await tokenRows()).toEqual([]);
      });
    });
  });

  describe("list", () => {
    it("returns only the account's own tokens, newest first, without secrets or hashes", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T11:00:00Z") });
      const alice = await signedIn("alice");
      const bob = await signedIn("bob");
      await service().create(alice, "older");
      vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
      await service().create(alice, "newer");
      await service().create(bob, "bobs");

      const listed = await service().list(alice.userId);

      expect(listed.map(({ name }) => name)).toEqual(["newer", "older"]);
      expect(Object.keys(listed[0]).sort()).toEqual(["createdAt", "id", "lastUsedAt", "name"]);
    });
  });

  describe("revoke", () => {
    it("deletes the token at once and leaves the account's others working (API-008)", async () => {
      const alice = await signedIn("alice");
      const a = await service().create(alice, "a");
      const b = await service().create(alice, "b");

      expect(await service().revoke(alice.userId, a.token.id, uiActor(alice))).toEqual({ id: a.token.id });

      expect(await service().authenticate(a.secret)).toBeNull();
      expect(await service().authenticate(b.secret)).toMatchObject({ tokenName: "b" });
    });

    it("records creation and revocation in the Global audit, never the secret (AUD-014, AUD-028)", async () => {
      const alice = await signedIn("alice");
      const { token, secret } = await service().create(alice, "ci-bot");
      // A later millisecond: entries of the same instant sort by their random id, so a revoke in the
      // creation's millisecond could list first.
      await new Promise((resolve) => setTimeout(resolve, 2));

      await service().revoke(alice.userId, token.id, uiActor(alice));

      const entries = await tokenAudit(alice.userId);
      expect(entries.map(({ action, subjectId, subjectLabel, before, after, channel, sessionId, actorUsername }) => ({
        action,
        subjectId,
        subjectLabel,
        before,
        after,
        channel,
        sessionId,
        actorUsername,
      }))).toEqual([
        {
          action: "tokens.api-token.created",
          subjectId: token.id,
          subjectLabel: "ci-bot",
          before: null,
          after: { name: "ci-bot" },
          channel: "ui",
          sessionId: alice.sessionId,
          actorUsername: "alice",
        },
        {
          action: "tokens.api-token.revoked",
          subjectId: token.id,
          subjectLabel: "ci-bot",
          before: { name: "ci-bot" },
          after: null,
          channel: "ui",
          sessionId: alice.sessionId,
          actorUsername: "alice",
        },
      ]);
      expect(JSON.stringify(entries)).not.toContain(secret);
      expect(JSON.stringify(entries)).not.toContain(hashApiTokenSecret(secret));
    });

    it("names the token that revoked itself through the API (AUD-007)", async () => {
      const alice = await signedIn("alice");
      const { token, secret } = await service().create(alice, "self");
      const caller = (await service().authenticate(secret))!;

      await service().revoke(alice.userId, token.id, apiActor(caller));

      const revoked = (await tokenAudit(alice.userId)).find(({ action }) => action === "tokens.api-token.revoked")!;
      expect(revoked).toMatchObject({ channel: "api", sessionId: null, tokenId: token.id, tokenName: "self" });
    });

    it("treats another account's token, an unknown id and a malformed id alike, deleting nothing", async () => {
      const alice = await signedIn("alice");
      const bob = await signedIn("bob");
      const bobs = await service().create(bob, "b");
      const notFound = new NotFoundError("TOKEN_NOT_FOUND", TOKEN_NOT_FOUND);

      await expect(service().revoke(alice.userId, bobs.token.id, uiActor(alice))).rejects.toEqual(notFound);
      await expect(service().revoke(alice.userId, MISSING_ID, uiActor(alice))).rejects.toEqual(notFound);
      await expect(service().revoke(alice.userId, "not-a-uuid", uiActor(alice))).rejects.toEqual(notFound);
      expect(await tokenRows()).toHaveLength(1);
      expect((await tokenAudit(alice.userId)).map(({ action }) => action)).toEqual([]);
      expect((await tokenAudit(bob.userId)).map(({ action }) => action)).toEqual(["tokens.api-token.created"]);
    });
  });

  describe("authenticate", () => {
    it("returns the owner with their current role and the token's id and name", async () => {
      const alice = await signedIn("alice");
      const { token, secret } = await service().create(alice, "agent1");

      expect(await service().authenticate(secret)).toEqual({
        userId: alice.userId,
        username: "alice",
        role: "user",
        tokenId: token.id,
        tokenName: "agent1",
      });
    });

    it("rejects an unknown secret and an inactive owner's token (API-011)", async () => {
      const alice = await signedIn("alice");
      const { secret } = await service().create(alice, "agent1");
      await orm.em.fork().nativeUpdate(User, { id: alice.userId }, { active: false });

      expect(await service().authenticate("cpg_unknown")).toBeNull();
      expect(await service().authenticate(secret)).toBeNull();
    });

    it("records the last use, at most once a minute (API-007)", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T11:00:00Z") });
      const alice = await signedIn("alice");
      const { secret } = await service().create(alice, "agent1");
      const lastUsed = async () => (await service().list(alice.userId))[0].lastUsedAt;

      await service().authenticate(secret);
      expect(await lastUsed()).toEqual(new Date("2026-10-19T11:00:00Z"));

      vi.setSystemTime(new Date(Date.parse("2026-10-19T11:00:00Z") + LAST_USED_RESOLUTION_MS - 1));
      await service().authenticate(secret);
      expect(await lastUsed()).toEqual(new Date("2026-10-19T11:00:00Z"));

      vi.setSystemTime(new Date("2026-10-19T11:05:00Z"));
      await service().authenticate(secret);
      expect(await lastUsed()).toEqual(new Date("2026-10-19T11:05:00Z"));
    });

    it("never expires (API-009)", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T11:00:00Z") });
      const alice = await signedIn("alice");
      const { secret } = await service().create(alice, "agent1");

      vi.setSystemTime(new Date("2027-10-19T11:00:00Z"));

      expect(await service().authenticate(secret)).toMatchObject({ username: "alice" });
    });

    it("still authenticates when recording the use fails, and logs it without the secret", async () => {
      const alice = await signedIn("alice");
      const { token, secret } = await service().create(alice, "agent1");
      const tokens = service();
      const em = (tokens as unknown as { em: { nativeUpdate: () => Promise<number> } }).em;
      vi.spyOn(em, "nativeUpdate").mockRejectedValueOnce(new Error("database is locked"));
      const log = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(await tokens.authenticate(secret)).toMatchObject({ username: "alice" });
      expect(log).toHaveBeenCalledWith(`Recording the use of API token ${token.id} failed:`, expect.any(Error));
      expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    });
  });
});
