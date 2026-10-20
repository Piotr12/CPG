import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ApiToken, GlobalAuditEvent, GlobalIdempotencyKey, initOrm, Material, Session, Tenant, TenantAuditEvent, TenantIdempotencyKey, User, UserPreference, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import type { AppContainer } from "../../container/cradle";
import { scopeForTenant } from "../../container/tenant-scope";
import { migrateDatabase, toDbOptions } from "../../database";
import type { AuditActor } from "../audit/actor";
import { DEMO_KINDS, demoSeeders, seedResetDemoData } from "../demo/seed-demo-data";
import { assertCurrentGeneration } from "../../domain/tenants/generation";
import { inRequestTransaction, retryingStaleSnapshot } from "../../http/request-transaction";
import { fingerprintOf } from "../idempotency/fingerprint";
import { IDEMPOTENCY_TTL_MS } from "../idempotency/idempotency.service";
import { MAX_DATASET_GENERATION } from "../../validators/tenants/test-reset.schema";

const actor: AuditActor = { userId: "admin", username: "admin", sessionId: "session-admin", channel: "ui", token: null };
let orm: Orm;
let container: AppContainer;
const scope = (code = "test") => scopeForTenant(container, code);
const reset = async (generation = 1) => (await scope()).cradle.testResetService.reset(generation, actor);
const audit = { action: "test.record.created", subjectType: "Material", subjectId: "one", subjectLabel: "one", actorUserId: "admin", actorUsername: "admin", channel: "ui" as const };

beforeEach(async () => {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-reset-service-")) });
  await migrateDatabase(config);
  orm = await initOrm(toDbOptions(config));
  container = createAppContainer(config, orm);
});
afterEach(async () => { vi.restoreAllMocks(); await orm.close(); });

/** Raw values let preservation assertions include every column, without ORM identity-map reuse. */
async function snapshot() {
  const tables = [...orm.getMetadata().getAll().values()].map((meta) => meta.tableName).sort();
  const result: Record<string, unknown> = {};
  for (const table of tables) result[table] = await orm.em.getConnection().execute(`select * from "${table}" order by rowid`);
  return result;
}

async function populate() {
  await seedResetDemoData((await scope()).cradle);
  const test = (await scope()).cradle;
  await test.materialService.create({ type: "raw", description: "old generation only", baseUnit: "kg" }, actor);
  const prod = (await scope("prod")).cradle;
  await prod.materialService.create({ type: "raw", description: "keep Prod", baseUnit: "kg" }, actor);
  const em = orm.em.fork();
  for (const [index, username] of ["admin", "alice"].entries()) {
    const user = em.create(User, { username, role: index === 0 ? "admin" : "user" });
    em.create(Session, { user, tokenHash: String(index).repeat(64), expiresAt: new Date("2030-01-01") });
    em.create(ApiToken, { user, name: "keep", tokenHash: String(index + 2).repeat(64) });
    em.create(UserPreference, { user, locale: "pl", theme: "dark" });
  }
  em.create(GlobalAuditEvent, audit);
  em.create(GlobalIdempotencyKey, { userId: "admin", key: "global", operation: "POST /global", fingerprint: "a", response: { kept: true } });
  await em.flush();
  test.em.create(TenantIdempotencyKey, { userId: "admin", key: "old", operation: "POST /old", fingerprint: "a", response: { old: true }, generation: 1 });
  await test.em.flush();
}

describe("atomic Test reset", () => {
  it.each([false, true])("reseeds every kind and restores readOnly=%s, preserving globals and Prod (TEN-022…025, TEN-028, TEN-029, AUD-011…013)", async (readOnly) => {
    await populate();
    await container.createScope().cradle.tenantService.setReadOnly("test", readOnly, actor);
    const before = await snapshot();

    expect(await reset()).toEqual({ code: "test", name: "Test", generation: 2, readOnly });

    const after = await snapshot();
    for (const table of ["user", "session", "api_token", "user_preference", "setting", "global_idempotency_key"]) expect(after[table], table).toEqual(before[table]);
    const globalBefore = before.global_audit_event as unknown[];
    expect(after.global_audit_event).toEqual(expect.arrayContaining(globalBefore));
    expect((after.global_audit_event as unknown[]).length).toBe(globalBefore.length + 1);
    const prodRows = (rows: unknown) => (rows as { tenant_code: string }[]).filter((row) => row.tenant_code === "prod");
    for (const [table, rows] of Object.entries(before)) {
      if (table === "tenant") continue;
      expect(prodRows(after[table]), table).toEqual(prodRows(rows));
    }
    const current = (await scope()).cradle;
    expect(await current.em.count(TenantAuditEvent, {})).toBe(0);
    expect(await current.em.count(TenantIdempotencyKey, {})).toBe(0);
    expect((await current.materialService.list())[0].id).toBe("00000001");
    expect((await current.locationService.list())[0].id).toBe("00000001");
    expect((await current.customerService.list())[0].id).toBe("00000001");
    expect((await current.supplierService.list())[0].id).toBe("00000001");
    expect((await current.bomService.list())[0].id).toBe("00000001");
    // Every seed would now skip because the complete demonstration kind already exists.
    const seeders = demoSeeders(current);
    for (const kind of DEMO_KINDS) expect(await seeders[kind].run()).toBe(0);
    const events = await current.em.find(GlobalAuditEvent, { action: "tenants.tenant.reset" });
    expect(events).toMatchObject([{ before: { generation: 1, readOnly }, after: { generation: 2, readOnly }, actorUsername: "admin", sessionId: "session-admin" }]);
    expect(await orm.em.getConnection().execute("pragma foreign_key_check")).toEqual([]);
    expect(await (await scope("prod")).cradle.tenantService.get("prod")).toEqual({ code: "prod", name: "Prod", generation: 1, readOnly: false });
  });

  it.each(["locations", "BOMs"] as const)("rolls back deletion and partially seeded %s, including both flags and all audits (TEN-027)", async (kind) => {
    await populate();
    await container.createScope().cradle.tenantService.setReadOnly("test", true, actor);
    const scoped = await scope();
    const service = kind === "locations" ? scoped.cradle.locationService : scoped.cradle.bomService;
    vi.spyOn(service, "seedDemo").mockRejectedValueOnce(new Error("injected seed failure"));
    const before = await snapshot();
    await expect(scoped.cradle.testResetService.reset(1, actor)).rejects.toThrow("injected seed failure");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a partial seed and keeps the old generation intact", async () => {
    await populate();
    const scoped = await scope();
    vi.spyOn(scoped.cradle.locationService, "seedDemo").mockResolvedValueOnce(0);
    const before = await snapshot();
    await expect(scoped.cradle.testResetService.reset(1, actor)).rejects.toThrow("Incomplete demonstration seed: locations");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a stale request, exhaustion, and non-Test scopes without changing data", async () => {
    const before = await snapshot();
    await expect(reset(2)).rejects.toMatchObject({ code: "GENERATION_STALE" });
    await expect((await scope("prod")).cradle.testResetService.reset(1, actor)).rejects.toThrow("Test scope");
    await expect(container.createScope().cradle.testResetService.reset(1, actor)).rejects.toThrow("Test scope");
    expect(await snapshot()).toEqual(before);
    await orm.em.fork().nativeUpdate(Tenant, { code: "test" }, { generation: MAX_DATASET_GENERATION });
    await expect(reset(MAX_DATASET_GENERATION)).rejects.toMatchObject({ code: "GENERATION_EXHAUSTED" });
    expect(await orm.em.fork().findOneOrFail(Tenant, { code: "test" })).toMatchObject({ generation: MAX_DATASET_GENERATION, readOnly: false });
  });

  it("joins an existing transaction, so a later API receipt failure also undoes the reset", async () => {
    await populate();
    const scoped = await scope();
    const before = await snapshot();
    await scoped.cradle.em.begin();
    await expect(scoped.cradle.testResetService.reset(1, actor)).resolves.toMatchObject({ generation: 2 });
    await scoped.cradle.em.rollback();
    expect(await snapshot()).toEqual(before);
  });
});


describe("keyed reset", () => {
  async function request(generation: number | null, key = "reset", body: unknown = {}) {
    const scoped = await scope();
    const fingerprint = await fingerprintOf({ method: "POST", path: "/api/tenants/test/reset", body });
    return scoped.cradle.idempotencyService.run(
      { userId: "admin", key, operation: "POST /api/tenants/test/reset", fingerprint },
      { kind: "test-reset", tenant: "test", generation, requireGeneration: true },
      () => scoped.cradle.testResetService.reset(generation!, actor),
    );
  }

  it("works while read-only, stores its receipt in the new generation, and replays only after a current precondition", async () => {
    await populate();
    await container.createScope().cradle.tenantService.setReadOnly("test", true, actor);
    const first = await request(1);
    expect(first).toMatchObject({ replayed: false, data: { generation: 2, readOnly: true } });
    const em = (await scope()).cradle.em;
    expect(await em.find(TenantIdempotencyKey, {})).toMatchObject([{ key: "reset", generation: 2 }]);
    await expect(request(1)).rejects.toMatchObject({ code: "GENERATION_STALE" });
    const before = await snapshot();
    await expect(request(2)).resolves.toEqual({ ...first, replayed: true });
    expect(await snapshot()).toEqual(before);
    await expect(request(2, "reset", { changed: true })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    await expect(request(null)).rejects.toMatchObject({ code: "GENERATION_REQUIRED" });
    // Expiration can free a key; it never frees an old-generation precondition.
    await em.nativeUpdate(TenantIdempotencyKey, { key: "reset" }, { createdAt: new Date(Date.now() - IDEMPOTENCY_TTL_MS - 1) });
    await expect(request(1)).rejects.toMatchObject({ code: "GENERATION_STALE" });
    await expect(request(2)).resolves.toMatchObject({ replayed: false, data: { generation: 3, readOnly: true } });
  });

  it("rolls back the whole reset when receipt insertion fails", async () => {
    await populate();
    const scoped = await scope();
    const before = await snapshot();
    const create = scoped.cradle.em.create.bind(scoped.cradle.em);
    vi.spyOn(scoped.cradle.em, "create").mockImplementation((...args: Parameters<typeof create>) => {
      if (args[0] === TenantIdempotencyKey) throw new Error("receipt insert failed");
      return create(...args);
    });
    const fingerprint = await fingerprintOf({ method: "POST", path: "/api/tenants/test/reset", body: {} });
    await expect(scoped.cradle.idempotencyService.run(
      { userId: "admin", key: "failed", operation: "POST /api/tenants/test/reset", fingerprint },
      { kind: "test-reset", tenant: "test", generation: 1, requireGeneration: true },
      () => scoped.cradle.testResetService.reset(1, actor),
    )).rejects.toThrow("receipt insert failed");
    expect(await snapshot()).toEqual(before);
  });
});

describe("reset and an in-flight write on independent SQLite connections (TEN-026)", () => {
  it("retries reset after another write commits first, removing that completed old-generation write", async () => {
    await populate();
    const other = await initOrm({ databasePath: orm.config.get("dbName") });
    try {
      const writer = await scopeForTenant(createAppContainer(container.cradle.config, other), "test");
      const resetting = await scope();
      const read = resetting.cradle.tenantService.currentState.bind(resetting.cradle.tenantService);
      vi.spyOn(resetting.cradle.tenantService, "currentState").mockImplementationOnce(async (code) => {
        const state = await read(code);
        await writer.cradle.materialService.create({ type: "raw", description: "committed just before reset", baseUnit: "kg" }, actor);
        return state;
      });
      await expect(resetting.cradle.testResetService.reset(1, actor)).resolves.toMatchObject({ generation: 2 });
      expect(await (await scope()).cradle.em.count(Material, { description: "committed just before reset" })).toBe(0);
      expect(await (await scope()).cradle.em.count(GlobalAuditEvent, { action: "tenants.tenant.reset" })).toBe(1);
    } finally { await other.close(); }
  });

  it("refuses an old snapshot write after reset commits, then rejects its stale-generation retry", async () => {
    await populate();
    const other = await initOrm({ databasePath: orm.config.get("dbName") });
    try {
      const writer = (await scopeForTenant(createAppContainer(container.cradle.config, other), "test")).cradle;
      let first = true;
      await expect(retryingStaleSnapshot(() => inRequestTransaction(writer.em, async () => {
        const state = await writer.tenantService.currentState("test");
        if (first) { first = false; await reset(); }
        assertCurrentGeneration(state.generation, 1, true);
        await writer.materialService.create({ type: "raw", description: "must never leak", baseUnit: "kg" }, actor);
      }))).rejects.toMatchObject({ code: "GENERATION_STALE" });
      expect(await (await scope()).cradle.em.count(Material, { description: "must never leak" })).toBe(0);
      expect(await (await scope()).cradle.tenantService.get("test")).toMatchObject({ generation: 2 });
    } finally { await other.close(); }
  });
});
