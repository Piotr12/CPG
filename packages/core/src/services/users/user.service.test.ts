import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, Session, User, type Orm } from "@cpg/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { ConflictError, NotFoundError } from "../../http/errors";
import { verifyPassword } from "../auth/password-hash";
import { USER_NOT_FOUND, USERNAME_TAKEN, UserService } from "./user.service";

const PASSWORD = "initial password 1";
const MISSING_ID = "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f";

describe("UserService", () => {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-user-service-")) });
  let orm: Orm;

  const service = () => new UserService({ em: orm.em.fork() });
  const stored = (username: string) => orm.em.fork().findOneOrFail(User, { username });
  const sessionCount = (username: string) => orm.em.fork().count(Session, { user: { username } });
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
      const created = await service().create({ username: "  Alice ", password: PASSWORD });

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
      await service().create({ username: "alice", password: PASSWORD });

      await expect(service().create({ username: "ALICE", password: PASSWORD })).rejects.toEqual(
        new ConflictError(USERNAME_TAKEN),
      );
    });

    it("reserves admin even before the built-in admin's row exists", async () => {
      await expect(service().create({ username: "Admin", password: PASSWORD })).rejects.toEqual(
        new ConflictError(USERNAME_TAKEN),
      );
      expect(await orm.em.fork().count(User, {})).toBe(0);
    });

    it("lets other database errors through", async () => {
      const users = service();
      vi.spyOn(Object.getPrototypeOf(orm.em), "flush").mockRejectedValueOnce(new Error("disk full"));

      await expect(users.create({ username: "alice", password: PASSWORD })).rejects.toThrow("disk full");
    });
  });

  describe("list", () => {
    it("shows the admin first, then usernames A–Z, without password hashes", async () => {
      await service().create({ username: "zed", password: PASSWORD });
      await service().create({ username: "bob", password: PASSWORD });
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
      const alice = await service().create({ username: "alice", password: PASSWORD });
      await service().create({ username: "bob", password: PASSWORD });
      await openSessions("alice", 2);
      await openSessions("bob", 1);

      await service().resetPassword(alice.id, "brand new password");

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

      await expect(service().resetPassword(admin.id, "brand new password")).rejects.toEqual(
        new NotFoundError("NOT_FOUND", USER_NOT_FOUND),
      );
      await expect(service().resetPassword(MISSING_ID, "brand new password")).rejects.toBeInstanceOf(NotFoundError);
      expect((await stored("admin")).passwordHash).toBeNull();
    });

    it("changes nothing when the transaction fails", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD });
      await openSessions("alice", 2);
      const before = (await stored("alice")).passwordHash;
      const users = service();
      vi.spyOn(Object.getPrototypeOf(orm.em), "flush").mockRejectedValueOnce(new Error("disk full"));

      await expect(users.resetPassword(alice.id, "brand new password")).rejects.toThrow("disk full");

      expect((await stored("alice")).passwordHash).toBe(before);
      expect(await sessionCount("alice")).toBe(2);
    });
  });

  describe("setActive", () => {
    it("deactivates, ending every session, and reactivates with the same password", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD });
      await openSessions("alice", 2);

      expect(await service().setActive(alice.id, false)).toMatchObject({ username: "alice", active: false });
      expect(await sessionCount("alice")).toBe(0);
      expect((await stored("alice")).active).toBe(false);

      expect(await service().setActive(alice.id, true)).toMatchObject({ active: true });
      const row = await stored("alice");
      expect(row.active).toBe(true);
      expect(await verifyPassword(PASSWORD, row.passwordHash!)).toBe(true);
    });

    it("is idempotent", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD });

      await service().setActive(alice.id, false);
      await expect(service().setActive(alice.id, false)).resolves.toMatchObject({ active: false });
      await service().setActive(alice.id, true);
      await expect(service().setActive(alice.id, true)).resolves.toMatchObject({ active: true });
    });

    it("keeps sessions when reactivating", async () => {
      const alice = await service().create({ username: "alice", password: PASSWORD });
      await openSessions("alice", 1);

      await service().setActive(alice.id, true);

      expect(await sessionCount("alice")).toBe(1);
    });

    it("can't deactivate the built-in admin", async () => {
      const em = orm.em.fork();
      const admin = em.create(User, { username: "admin", role: "admin" });
      await em.flush();

      await expect(service().setActive(admin.id, false)).rejects.toBeInstanceOf(NotFoundError);
      expect((await stored("admin")).active).toBe(true);
    });
  });
});
