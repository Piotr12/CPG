import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, Session, User, type Orm } from "@cpg/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, type AppConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { TooManyRequestsError, UnauthorizedError } from "../../http/errors";
import { AuthService, BUILT_IN_ADMIN_USERNAME, INVALID_CREDENTIALS, SESSION_TTL_MS } from "./auth.service";
import { UserService } from "../users/user.service";
import { LoginThrottle, MAX_FAILURES_PER_CLIENT, MAX_FAILURES_PER_IP } from "./login-throttle";
import { hashSessionToken } from "./session-token";

const PASSWORD = "correct horse battery staple";
const IP = "203.0.113.7";
const NOW = new Date("2026-10-19T08:00:00Z");

describe("AuthService", () => {
  const baseConfig = loadConfig({
    DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-auth-service-")),
    CPG_ADMIN_PASSWORD: PASSWORD,
  });
  let orm: Orm;
  let throttle: LoginThrottle;

  const service = (config: AppConfig = baseConfig) =>
    new AuthService({ em: orm.em.fork(), config, loginThrottle: throttle });
  const signIn = (password = PASSWORD, username = BUILT_IN_ADMIN_USERNAME) =>
    service().signIn({ username, password, clientIp: IP });

  beforeAll(async () => {
    await migrateDatabase(baseConfig);
    orm = await initOrm(toDbOptions(baseConfig));
  });
  afterAll(() => orm.close());
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    throttle = new LoginThrottle();
    await orm.em.fork().nativeDelete(Session, {});
    await orm.em.fork().nativeDelete(User, {});
  });
  afterEach(() => vi.useRealTimers());

  describe("signIn", () => {
    it("opens a 12-hour session for the admin and stores only the token's hash", async () => {
      const { token, expiresAt } = await signIn();

      expect(expiresAt).toEqual(new Date(NOW.getTime() + SESSION_TTL_MS));
      const sessions = await orm.em.fork().find(Session, {}, { populate: ["user"] });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].tokenHash).toBe(hashSessionToken(token));
      expect(sessions[0].tokenHash).not.toContain(token);
      expect(sessions[0].user).toMatchObject({ username: "admin", role: "admin" });
    });

    it("creates the built-in admin once, however often it signs in", async () => {
      const first = await signIn();
      const second = await signIn();

      expect(first.token).not.toBe(second.token);
      expect(await orm.em.fork().find(User, {})).toEqual([expect.objectContaining({ username: "admin", role: "admin" })]);
      expect(await orm.em.fork().count(Session, {})).toBe(2);
    });

    it("creates a single admin when two first sign-ins race", async () => {
      const results = await Promise.all([signIn(), signIn()]);

      expect(results.map(({ token }) => token)).toHaveLength(2);
      expect(await orm.em.fork().count(User, {})).toBe(1);
      expect(await orm.em.fork().count(Session, {})).toBe(2);
    });

    it.each([
      ["a wrong password", "wrong password", BUILT_IN_ADMIN_USERNAME],
      ["an unknown username", PASSWORD, "root"],
      ["the password with different case", PASSWORD.toUpperCase(), BUILT_IN_ADMIN_USERNAME],
    ])("refuses %s with the same generic error and opens no session", async (_case, password, username) => {
      await expect(signIn(password, username)).rejects.toEqual(new UnauthorizedError(INVALID_CREDENTIALS));
      expect(await orm.em.fork().count(Session, {})).toBe(0);
    });

    it("fails closed when no admin password is configured", async () => {
      const unconfigured = { ...baseConfig, adminPassword: undefined };

      await expect(
        service(unconfigured).signIn({ username: "admin", password: "", clientIp: IP }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("blocks a client after five failures, even with the right password", async () => {
      for (let i = 0; i < MAX_FAILURES_PER_CLIENT; i++) await signIn("wrong").catch(() => {});

      await expect(signIn()).rejects.toBeInstanceOf(TooManyRequestsError);
      expect(await orm.em.fork().count(Session, {})).toBe(0);
    });

    it("forgets a client's failures after a successful sign-in", async () => {
      for (let i = 0; i < MAX_FAILURES_PER_CLIENT - 1; i++) await signIn("wrong").catch(() => {});
      await signIn();
      for (let i = 0; i < MAX_FAILURES_PER_CLIENT - 1; i++) await signIn("wrong").catch(() => {});

      await expect(signIn()).resolves.toMatchObject({ token: expect.any(String) });
    });

    it("throttles a client that sprays usernames", async () => {
      for (let i = 0; i < MAX_FAILURES_PER_IP; i++) await signIn(PASSWORD, `guess-${i}`).catch(() => {});

      await expect(signIn(PASSWORD, "another-guess")).rejects.toBeInstanceOf(TooManyRequestsError);
      await expect(
        service().signIn({ username: "admin", password: PASSWORD, clientIp: "198.51.100.1" }),
      ).resolves.toMatchObject({ token: expect.any(String) });
    });
  });

  describe("signIn for normal users", () => {
    const USER_PASSWORD = "alice's password";
    const users = () => new UserService({ em: orm.em.fork() });
    const sessionsOf = (username: string) => orm.em.fork().count(Session, { user: { username } });

    it("opens a session for an active user, whatever the case of the username", async () => {
      await users().create({ username: "alice", password: USER_PASSWORD });

      const { token } = await signIn(USER_PASSWORD, "  Alice ");

      await expect(service().validateSession(token)).resolves.toMatchObject({ username: "alice", role: "user" });
    });

    it.each([
      ["a wrong password", "alice", "wrong password!"],
      ["an unknown username", "nobody", USER_PASSWORD],
    ])("refuses %s with the same generic error", async (_case, username, password) => {
      await users().create({ username: "alice", password: USER_PASSWORD });

      await expect(signIn(password, username)).rejects.toEqual(new UnauthorizedError(INVALID_CREDENTIALS));
      expect(await orm.em.fork().count(Session, {})).toBe(0);
    });

    it("refuses a deactivated user with the right password, and lets them back after reactivation", async () => {
      const alice = await users().create({ username: "alice", password: USER_PASSWORD });
      await users().setActive(alice.id, false);

      await expect(signIn(USER_PASSWORD, "alice")).rejects.toEqual(new UnauthorizedError(INVALID_CREDENTIALS));

      await users().setActive(alice.id, true);
      await expect(signIn(USER_PASSWORD, "alice")).resolves.toMatchObject({ token: expect.any(String) });
    });

    it("blocks an unknown name after exactly as many failures as an existing one", async () => {
      await users().create({ username: "alice", password: USER_PASSWORD });
      const blockedAfter = async (username: string) => {
        for (let attempt = 1; ; attempt++) {
          const error = await signIn("wrong password!", username).catch((caught: unknown) => caught);
          if (error instanceof TooManyRequestsError) return attempt;
        }
      };

      expect(await blockedAfter("alice")).toBe(MAX_FAILURES_PER_CLIENT + 1);
      expect(await blockedAfter("no-such-user")).toBe(MAX_FAILURES_PER_CLIENT + 1);
    });

    it("keeps two sessions independent, and a reset ends both (TEN-006, TEN-009)", async () => {
      const alice = await users().create({ username: "alice", password: USER_PASSWORD });
      const first = await signIn(USER_PASSWORD, "alice");
      const second = await signIn(USER_PASSWORD, "alice");
      expect(first.token).not.toBe(second.token);
      expect(await sessionsOf("alice")).toBe(2);

      await users().resetPassword(alice.id, "a brand new password");

      await expect(service().validateSession(first.token)).resolves.toBeNull();
      await expect(service().validateSession(second.token)).resolves.toBeNull();
      await expect(signIn(USER_PASSWORD, "alice")).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(signIn("a brand new password", "alice")).resolves.toMatchObject({ token: expect.any(String) });
    });

    it.each([
      ["a password reset", (id: string) => users().resetPassword(id, "a brand new password")],
      ["a deactivation", (id: string) => users().setActive(id, false)],
    ])("leaves no session when %s commits during the sign-in", async (_case, change) => {
      const alice = await users().create({ username: "alice", password: USER_PASSWORD });
      const auth = service();
      // The change commits after the password check, just before the session transaction opens.
      const em = (auth as unknown as { em: { transactional: (...args: unknown[]) => Promise<unknown> } }).em;
      const transactional = em.transactional.bind(em);
      vi.spyOn(em, "transactional").mockImplementationOnce(async (...args) => {
        await change(alice.id);
        return transactional(...args);
      });
      const attempt = auth.signIn({ username: "alice", password: USER_PASSWORD, clientIp: IP });

      await expect(attempt).rejects.toEqual(new UnauthorizedError(INVALID_CREDENTIALS));
      expect(await sessionsOf("alice")).toBe(0);
    });
  });

  describe("validateSession", () => {
    it("returns the signed-in user for a live session", async () => {
      const { token } = await signIn();
      const [session] = await orm.em.fork().find(Session, {});

      await expect(service().validateSession(token)).resolves.toEqual({
        sessionId: session.id,
        userId: expect.any(String),
        username: "admin",
        role: "admin",
      });
    });

    it.each([
      ["no token", undefined],
      ["an empty token", ""],
      ["an unknown token", "not-a-session"],
    ])("returns null for %s", async (_case, token) => {
      await expect(service().validateSession(token)).resolves.toBeNull();
    });

    it("rejects and deletes an expired session", async () => {
      const { token } = await signIn();
      vi.setSystemTime(new Date(NOW.getTime() + SESSION_TTL_MS));

      await expect(service().validateSession(token)).resolves.toBeNull();
      expect(await orm.em.fork().count(Session, {})).toBe(0);
    });

    it("rejects and deletes the session of a user who is no longer active", async () => {
      const alice = await new UserService({ em: orm.em.fork() }).create({ username: "alice", password: "alice's password" });
      const { token } = await signIn("alice's password", "alice");
      // Deactivation deletes sessions itself; this simulates a leftover row.
      await orm.em.fork().nativeUpdate(User, { id: alice.id }, { active: false });

      await expect(service().validateSession(token)).resolves.toBeNull();
      expect(await orm.em.fork().count(Session, {})).toBe(0);
    });

    it("accepts a session up to the moment before it expires", async () => {
      const { token } = await signIn();
      vi.setSystemTime(new Date(NOW.getTime() + SESSION_TTL_MS - 1));

      await expect(service().validateSession(token)).resolves.not.toBeNull();
    });
  });

  describe("signOut", () => {
    it("ends only that session and is safe to repeat", async () => {
      const first = await signIn();
      const second = await signIn();

      await service().signOut(first.token);
      await service().signOut(first.token);
      await service().signOut(undefined);

      await expect(service().validateSession(first.token)).resolves.toBeNull();
      await expect(service().validateSession(second.token)).resolves.not.toBeNull();
    });
  });
});
