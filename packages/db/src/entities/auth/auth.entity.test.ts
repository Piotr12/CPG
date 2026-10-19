import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initOrm, migrate, type Orm } from "../../orm";
import { Session } from "./session.entity";
import { User } from "./user.entity";

const HASH = "a".repeat(64);

describe("User and Session", () => {
  const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-auth-")), "cpg.sqlite");
  let orm: Orm;

  beforeAll(async () => {
    await migrate({ databasePath });
    orm = await initOrm({ databasePath });
  });
  afterAll(() => orm.close());

  it("generates UUIDs and creation times", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T08:00:00Z") });
    try {
      const em = orm.em.fork();
      const user = em.create(User, { username: "admin", role: "admin" });
      const session = em.create(Session, { tokenHash: HASH, user, expiresAt: new Date("2026-10-19T20:00:00Z") });
      await em.flush();

      expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(user.id).not.toBe(session.id);
      expect(user.createdAt).toEqual(new Date("2026-10-19T08:00:00Z"));
      expect(session.createdAt).toEqual(new Date("2026-10-19T08:00:00Z"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("defaults new accounts to active, with no password hash", async () => {
    const em = orm.em.fork();
    const user = em.create(User, { username: "fresh", role: "user" });
    await em.flush();

    const stored = await orm.em.fork().findOneOrFail(User, { id: user.id });
    expect(stored.active).toBe(true);
    expect(stored.passwordHash).toBeNull();
  });

  it("starts every account at version 1 and raises it on each update", async () => {
    const em = orm.em.fork();
    const user = em.create(User, { username: "versioned", role: "user" });
    await em.flush();
    expect(user.version).toBe(1);

    user.active = false;
    await em.flush();
    expect((await orm.em.fork().findOneOrFail(User, { id: user.id })).version).toBe(2);
  });

  it("refuses a flush over a version another writer has moved on", async () => {
    const em = orm.em.fork();
    const user = em.create(User, { username: "contended", role: "user" });
    await em.flush();

    const stale = orm.em.fork();
    const copy = await stale.findOneOrFail(User, { id: user.id });
    user.active = false;
    await em.flush();

    copy.passwordHash = "changed-elsewhere";
    await expect(stale.flush()).rejects.toThrow(/optimistic lock/);
  });

  it("keeps usernames and token hashes unique", async () => {
    const em = orm.em.fork();
    em.create(User, { username: "admin", role: "user" });
    await expect(em.flush()).rejects.toThrow(/UNIQUE constraint failed: user.username/);

    const other = orm.em.fork();
    const user = await other.findOneOrFail(User, { username: "admin" });
    other.create(Session, { tokenHash: HASH, user, expiresAt: new Date() });
    await expect(other.flush()).rejects.toThrow(/UNIQUE constraint failed: session.token_hash/);
  });

  it("rejects a role outside admin and user", async () => {
    await expect(
      orm.em.getConnection().execute("insert into user (id, username, role, created_at) values ('x', 'x', 'root', 0)"),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("deletes a user's sessions with the user", async () => {
    const em = orm.em.fork();
    const user = em.create(User, { username: "doomed", role: "user" });
    em.create(Session, { tokenHash: "b".repeat(64), user, expiresAt: new Date() });
    await em.flush();

    await orm.em.getConnection().execute("delete from user where username = 'doomed'");

    expect(await orm.em.fork().count(Session, { tokenHash: "b".repeat(64) })).toBe(0);
  });
});
