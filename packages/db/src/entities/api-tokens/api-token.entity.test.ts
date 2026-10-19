import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initOrm, migrate, type Orm } from "../../orm";
import { User } from "../auth/user.entity";
import { API_TOKEN_NAME_MAX, ApiToken } from "./api-token.entity";

const hash = (char: string) => char.repeat(64);

describe("ApiToken", () => {
  const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-api-tokens-")), "cpg.sqlite");
  let orm: Orm;

  beforeAll(async () => {
    await migrate({ databasePath });
    orm = await initOrm({ databasePath });
    const em = orm.em.fork();
    em.create(User, { username: "alice", role: "user" });
    em.create(User, { username: "bob", role: "user" });
    await em.flush();
  });
  afterAll(() => orm.close());

  const user = (em: Orm["em"], username: string) => em.findOneOrFail(User, { username });

  it("allows names up to 64 characters", () => {
    expect(API_TOKEN_NAME_MAX).toBe(64);
  });

  it("generates a UUID, stamps the creation and starts unused", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T11:00:00Z") });
    try {
      const em = orm.em.fork();
      const token = em.create(ApiToken, { user: await user(em, "alice"), name: "agent1", tokenHash: hash("a") });
      await em.flush();

      expect(token.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(token.createdAt).toEqual(new Date("2026-10-19T11:00:00Z"));
      expect((await orm.em.fork().findOneOrFail(ApiToken, token.id)).lastUsedAt).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps names unique per account, not system-wide", async () => {
    const em = orm.em.fork();
    em.create(ApiToken, { user: await user(em, "bob"), name: "agent1", tokenHash: hash("b") });
    await em.flush();

    const again = orm.em.fork();
    again.create(ApiToken, { user: await user(again, "alice"), name: "agent1", tokenHash: hash("c") });
    await expect(again.flush()).rejects.toThrow(/UNIQUE constraint failed: api_token.user_id, api_token.name/);
  });

  it("never stores two tokens with the same hash", async () => {
    const em = orm.em.fork();
    em.create(ApiToken, { user: await user(em, "alice"), name: "build", tokenHash: hash("a") });

    await expect(em.flush()).rejects.toThrow(/UNIQUE constraint failed: api_token.token_hash/);
  });

  it("is deleted with its account", async () => {
    await orm.em.getConnection().execute("delete from user where username = 'alice'");

    const names = (await orm.em.fork().find(ApiToken, {}, { populate: ["user"] })).map((t) => t.user.username);
    expect(names).toEqual(["bob"]);
  });
});
