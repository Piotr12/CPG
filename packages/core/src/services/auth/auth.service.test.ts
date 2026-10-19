import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, Session, User, type Orm } from "@cpg/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, type AppConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { TooManyRequestsError, UnauthorizedError } from "../../http/errors";
import { AuthService, BUILT_IN_ADMIN_USERNAME, INVALID_CREDENTIALS, SESSION_TTL_MS } from "./auth.service";
import { LoginThrottle, MAX_FAILURES_PER_CLIENT } from "./login-throttle";
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

    it("throttles unknown usernames per client", async () => {
      for (let i = 0; i < MAX_FAILURES_PER_CLIENT; i++) await signIn(PASSWORD, `guess-${i}`).catch(() => {});

      await expect(signIn(PASSWORD, "another-guess")).rejects.toBeInstanceOf(TooManyRequestsError);
      await expect(signIn()).resolves.toMatchObject({ token: expect.any(String) });
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
