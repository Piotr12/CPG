import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initOrm, migrate, type Orm } from "../../orm";
import { selectTenant, TenantViolationError } from "../tenants/tenant-owned";
import type { TenantCode } from "../tenants/tenant.entity";
import { GlobalIdempotencyKey } from "./global-idempotency-key.entity";
import { IDEMPOTENCY_KEY_MAX } from "./idempotency-key";
import { TenantIdempotencyKey } from "./tenant-idempotency-key.entity";

const ALICE = "4b0c1c5e-0000-4000-8000-00000000000a";
const BOB = "4b0c1c5e-0000-4000-8000-00000000000b";

const record = (userId: string, key: string) => ({
  userId,
  key,
  operation: "POST /api/users",
  fingerprint: "f".repeat(64),
  response: { id: "u1", createdAt: "2026-10-19T15:00:00.000Z" },
});

describe("GlobalIdempotencyKey and TenantIdempotencyKey", () => {
  const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-idempotency-")), "cpg.sqlite");
  let orm: Orm;

  const scope = (code?: TenantCode) => {
    const em = orm.em.fork();
    if (code) selectTenant(em, code);
    return em;
  };

  beforeAll(async () => {
    await migrate({ databasePath });
    orm = await initOrm({ databasePath });
  });
  afterAll(() => orm.close());

  it("accepts keys up to 255 characters", () => {
    expect(IDEMPOTENCY_KEY_MAX).toBe(255);
  });

  it("stores a global key with its id, time and parsed response", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T16:00:00Z") });
    try {
      const em = scope();
      const created = em.create(GlobalIdempotencyKey, record(ALICE, "k1"));
      await em.flush();

      const stored = await scope().findOneOrFail(GlobalIdempotencyKey, { id: created.id });
      expect(stored.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(stored.createdAt).toEqual(new Date("2026-10-19T16:00:00Z"));
      expect(stored.response).toEqual({ id: "u1", createdAt: "2026-10-19T15:00:00.000Z" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a global key unique per account, not system-wide", async () => {
    const em = scope();
    em.create(GlobalIdempotencyKey, record(BOB, "k1"));
    await em.flush();

    const again = scope();
    again.create(GlobalIdempotencyKey, record(ALICE, "k1"));
    await expect(again.flush()).rejects.toThrow(
      /UNIQUE constraint failed: global_idempotency_key.user_id, global_idempotency_key.key/,
    );
  });

  it("keeps a tenant key unique per tenant and account, and the same key free in the other tenant", async () => {
    const test = scope("test");
    test.create(TenantIdempotencyKey, { ...record(ALICE, "k1"), generation: 1 });
    await test.flush();
    const prod = scope("prod");
    prod.create(TenantIdempotencyKey, { ...record(ALICE, "k1"), generation: 1 });
    await prod.flush();

    const again = scope("test");
    again.create(TenantIdempotencyKey, { ...record(ALICE, "k1"), generation: 1 });
    await expect(again.flush()).rejects.toThrow(/UNIQUE constraint failed: tenant_idempotency_key.tenant_code/);
  });

  it("isolates tenant keys by the tenant filter", async () => {
    const test = scope("test");
    test.create(TenantIdempotencyKey, { ...record(BOB, "only-test"), generation: 2 });
    await test.flush();

    expect(await scope("test").count(TenantIdempotencyKey, { key: "only-test" })).toBe(1);
    expect(await scope("prod").count(TenantIdempotencyKey, { key: "only-test" })).toBe(0);
    await expect(scope().count(TenantIdempotencyKey, {})).rejects.toThrow(TenantViolationError);
  });
});
