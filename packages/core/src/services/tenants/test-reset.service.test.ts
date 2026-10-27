import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ApiToken, CustomerOrder, GlobalAuditEvent, GlobalIdempotencyKey, initOrm, isTenantOwned, Material, ProductionCompletion, Session, StockMovement, Tenant, TenantAuditEvent, TenantIdempotencyKey, User, UserPreference, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import type { AppContainer } from "../../container/cradle";
import { scopeForTenant } from "../../container/tenant-scope";
import { migrateDatabase, toDbOptions } from "../../database";
import type { AuditActor } from "../audit/actor";
import { seedTestTenantDataset } from "../demo/seed-demo-data";
import { ShipmentService } from "../shipments/shipment.service";
import { formatSequentialId } from "../../domain/business-ids/sequential-id";
import { generateTestTenantDataset } from "../../domain/demo/generate-dataset";
import { TEST_DATASET_CONFIGS } from "../../domain/demo/test-datasets";
import { assertCurrentGeneration } from "../../domain/tenants/generation";
import { inRequestTransaction, retryingStaleSnapshot } from "../../http/request-transaction";
import { fingerprintOf } from "../idempotency/fingerprint";
import { IDEMPOTENCY_TTL_MS } from "../idempotency/idempotency.service";
import { MAX_DATASET_GENERATION } from "../../validators/tenants/test-reset.schema";

/*
 * A reset generates the dataset for today from the container's `testDatasets`: tiny, two history months,
 * unless it is asked for realistic, whose two years take seconds to write; only one test does.
 */
/** The reset's clock: the dataset it writes is the one generated for this day. */
const TODAY = new Date("2026-10-21T10:00:00.000Z");
const generated = (config = TEST_DATASET_CONFIGS.tiny) => generateTestTenantDataset(config, "2026-10-21");

const actor: AuditActor = { userId: "admin", username: "admin", sessionId: "session-admin", channel: "ui", token: null };
let orm: Orm;
let container: AppContainer;
const scope = (code = "test") => scopeForTenant(container, code);
const reset = async (generation = 1) => (await scope()).cradle.testResetService.reset(generation, actor);
const audit = { action: "test.record.created", subjectType: "Material", subjectId: "one", subjectLabel: "one", actorUserId: "admin", actorUsername: "admin", channel: "ui" as const };

beforeEach(async () => {
  vi.useFakeTimers({ now: TODAY, toFake: ["Date"] });
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-reset-service-")) });
  await migrateDatabase(config);
  orm = await initOrm(toDbOptions(config));
  container = createAppContainer(config, orm);
});
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await orm.close(); });

/** Raw values let preservation assertions include every column, without ORM identity-map reuse. */
async function snapshot() {
  const tables = [...orm.getMetadata().getAll().values()].map((meta) => meta.tableName).sort();
  const result: Record<string, unknown> = {};
  for (const table of tables) result[table] = await orm.em.getConnection().execute(`select * from "${table}" order by rowid`);
  return result;
}

/** Every tenant-owned table with a business ID, and the tenant's IDs in it in order (TEN-029). */
async function sequences(tenant: string) {
  const result: Record<string, string[]> = {};
  for (const meta of orm.getMetadata().getAll().values()) {
    if (!isTenantOwned(meta) || !meta.properties.code) continue;
    const rows = await orm.em.getConnection().execute<{ code: string }[]>(`select code from "${meta.tableName}" where tenant_code = ? order by code`, [tenant]);
    result[meta.tableName] = rows.map(({ code }) => code);
  }
  return result;
}

async function populate() {
  await seedTestTenantDataset((await scope()).cradle, TODAY);
  const test = (await scope()).cradle;
  await test.materialService.create({ type: "raw", description: "old generation only", baseUnit: "kg" }, actor);
  await test.customerOrderService.create({ customer: "00000001", location: "00000001", lines: [{ material: "00000005", quantity: "1", unit: "each", requiredDate: "2027-01-01" }] }, actor);
  const prod = (await scope("prod")).cradle;
  await prod.materialService.create({ type: "raw", description: "keep Prod", baseUnit: "kg" }, actor);
  await prod.customerService.create({ name: "keep Prod customer" }, actor);
  await prod.locationService.create({ name: "keep Prod location" }, actor);
  await prod.customerOrderService.create({ customer: "00000001", location: "00000001", lines: [{ material: "00000001", quantity: "3", unit: "kg", requiredDate: "2027-01-01" }] }, actor);
  // Prod stock, a transfer in transit, and a purchase order received in part (TEN-025).
  await prod.locationService.create({ name: "keep Prod destination" }, actor);
  await prod.supplierService.create({ name: "keep Prod supplier" }, actor);
  await prod.stockService.correct({ material: "00000001", location: "00000001", quantity: "10", unit: "kg", reason: "keep Prod count" }, actor);
  const transfer = await prod.transferService.create({ material: "00000001", source: "00000001", destination: "00000002", quantity: "4", unit: "kg", plannedDispatch: "2026-10-21", plannedArrival: "2026-10-22" }, actor);
  await prod.transferService.dispatch(transfer.id, { quantity: "4", unit: "kg" }, actor);
  const order = await prod.purchaseOrderService.create({ supplier: "00000001", location: "00000001", lines: [{ material: "00000001", quantity: "5", unit: "kg", plannedDate: "2027-01-01" }] }, actor);
  await prod.goodsReceiptService.post({ purchaseOrder: order.id, lines: [{ line: 1, quantity: "2", unit: "kg" }] }, actor);
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

describe("atomic Test reset", { timeout: 60_000 }, () => {
  it.each([false, true])("reseeds every kind and restores readOnly=%s, preserving globals and Prod, read-only alike (TEN-022…025, TEN-028, AUD-011…013)", async (readOnly) => {
    await populate();
    await container.createScope().cradle.tenantService.setReadOnly("test", readOnly, actor);
    // Prod shares the flag, so its read-only state is compared both ways (TEN-025).
    await container.createScope().cradle.tenantService.setReadOnly("prod", readOnly, actor);
    const before = await snapshot();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    expect(await reset()).toEqual({ code: "test", name: "Test", generation: 2, readOnly });
    // The server's own record of the reset's duration, the figure the owner reads off cpg.baby's log (#185).
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/^Reset the Test tenant to the tiny dataset, generation 2: deleted and reseeded in \d+\.\d s$/));

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
    // Prod had the records TEN-025 names, so the comparison above covers them.
    for (const table of ["customer_order", "stock_balance", "stock_movement", "transfer", "transfer_posting", "purchase_order", "goods_receipt", "tenant_audit_event"]) {
      expect(prodRows(before[table]).length, table).toBeGreaterThan(0);
    }
    const current = (await scope()).cradle;
    expect(await current.em.count(TenantAuditEvent, {})).toBe(0);
    expect(await current.em.count(TenantIdempotencyKey, {})).toBe(0);
    // Today's dataset again, from ID 00000001: the old generation's own records are gone.
    const { masters, summary, timeline } = generated();
    expect((await current.materialService.list()).map(({ id }) => id)).toEqual(masters.materials.map((_, index) => String(index + 1).padStart(8, "0")));
    expect((await current.locationService.list()).map(({ name }) => name)).toEqual(masters.locations);
    expect((await current.customerService.list())[0].id).toBe("00000001");
    expect((await current.supplierService.list())[0].id).toBe("00000001");
    expect((await current.bomService.list())[0].id).toBe("00000001");
    expect(await current.em.count(CustomerOrder, {})).toBe(summary.customerOrders);
    expect(await current.em.count(StockMovement, {})).toBe(summary.movements);
    expect((await current.customerOrderService.get("00000001")).createdAt.toISOString()).toBe(timeline.find(({ kind }) => kind === "customerOrder")!.at);
    const userOrder = String(summary.customerOrders + 1).padStart(8, "0");
    await expect(current.customerOrderService.get(userOrder)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_NOT_FOUND" });
    // A second seed would refuse: the dataset is complete.
    await expect(seedTestTenantDataset(current, TODAY)).rejects.toThrow("Incomplete demonstration seed: materials");
    const events = await current.em.find(GlobalAuditEvent, { action: "tenants.tenant.reset" });
    expect(events).toMatchObject([{ before: { generation: 1, readOnly }, after: { generation: 2, readOnly, dataset: "tiny" }, actorUsername: "admin", sessionId: "session-admin" }]);
    expect(await orm.em.getConnection().execute("pragma foreign_key_check")).toEqual([]);
    const prod = (await scope("prod")).cradle;
    expect(await prod.tenantService.get("prod")).toEqual({ code: "prod", name: "Prod", generation: 1, readOnly });
    // Prod's sequences carry on where they were (TEN-029).
    await container.createScope().cradle.tenantService.setReadOnly("prod", false, actor);
    expect((await prod.materialService.create({ type: "raw", description: "next Prod", baseUnit: "kg" }, actor)).id).toBe("00000002");
    expect((await prod.purchaseOrderService.create({ supplier: "00000001", location: "00000001", lines: [{ material: "00000001", quantity: "1", unit: "kg", plannedDate: "2027-01-01" }] }, actor)).id).toBe("00000002");
  });

  it("keeps the health check answering while a reset runs: the loop turns between documents and the ping skips the connection mutex (#185)", async () => {
    await populate();
    const { systemStatusService } = container.createScope().cradle;
    let finished = false;
    const resetting = reset().then((info) => { finished = true; return info; });
    // Scheduled as a timer, so it needs an event-loop turn, as an incoming request does; it must answer
    // before the reset ends, not once it has committed.
    const pingedDuringReset = new Promise<boolean>((resolve, reject) => {
      setTimeout(() => systemStatusService.ping().then(() => resolve(!finished), reject), 0);
    });

    expect(await pingedDuringReset).toBe(true);
    expect(await resetting).toMatchObject({ generation: 2 });
  });

  it("makes a write another ORM copy begins during the reset wait for its commit, then succeed (#185)", async () => {
    await populate();
    // Another Next.js bundle: its own ORM and SQLite connection on the same file (lesson of 2026-10-17).
    const other = await initOrm({ databasePath: orm.config.get("dbName") });
    try {
      const writer = (await scopeForTenant(createAppContainer(container.cradle.config, other), "prod")).cradle;
      const resetting = reset();
      // Issued once the reset is under way and has yielded to the event loop, as a request arriving meanwhile is.
      await new Promise((resolve) => setImmediate(resolve));
      const written = writer.locationService.create({ name: "written during the reset" }, actor);

      expect(await resetting).toMatchObject({ generation: 2 });
      // Without the gate this write got "database is locked" at once: the reset held SQLite's write lock.
      expect((await written).name).toBe("written during the reset");
      expect(await (await scope("prod")).cradle.locationService.list()).toContainEqual(expect.objectContaining({ name: "written during the reset" }));
    } finally { await other.close(); }
  });

  it("writes the realistic dataset's two years for today when the admin picks it, and audits the choice (TEN-001, TEN-022)", async () => {
    const { masters, summary, timeline } = generated(TEST_DATASET_CONFIGS.realistic);
    const info = vi.spyOn(console, "info");

    expect(await (await scope()).cradle.testResetService.reset(1, actor, "realistic")).toMatchObject({ generation: 2 });
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/^Reset the Test tenant to the realistic dataset, generation 2: deleted and reseeded in \d+\.\d s$/));

    const current = (await scope()).cradle;
    expect(await current.em.count(Material, {})).toBe(masters.materials.length);
    expect(await current.em.count(CustomerOrder, {})).toBe(summary.customerOrders);
    expect(await current.em.count(ProductionCompletion, {})).toBe(summary.completions);
    expect(await current.em.count(StockMovement, {})).toBe(summary.movements);
    expect(await current.em.count(TenantAuditEvent, {})).toBe(0);
    const first = await current.customerOrderService.get("00000001");
    expect(first.createdAt.toISOString()).toBe(timeline.find(({ kind }) => kind === "customerOrder")!.at);
    expect(await current.em.find(GlobalAuditEvent, { action: "tenants.tenant.reset" })).toMatchObject([{ after: { generation: 2, readOnly: false, dataset: "realistic" } }]);

    // TEN-029: from two years of documents, one more of each master and of requisitions (realistic has as many as tiny), and
    // two transfers, a tiny reset restarts every sequence.
    const { material, location, enteredQuantity, enteredUnit } = (await current.purchaseRequisitionService.list())[0];
    await current.purchaseRequisitionService.create({ material, location, quantity: enteredQuantity, unit: enteredUnit, requiredDate: "2030-01-01" }, actor);
    await current.materialService.create({ type: "raw", description: "old generation only", baseUnit: "kg" }, actor);
    await current.locationService.create({ name: "old generation location" }, actor);
    await current.customerService.create({ name: "old generation customer" }, actor);
    await current.supplierService.create({ name: "old generation supplier" }, actor);
    const recipes = await current.bomService.list();
    const recipe = recipes[0];
    const priority = Math.max(...recipes.filter(({ output }) => output === recipe.output).map(({ priority }) => priority)) + 1;
    await current.bomService.create({ output: recipe.output, priority, validFrom: "2030-01-01", validThrough: null,
      components: recipe.components.map(({ material, enteredQuantity, enteredUnit }) => ({ material, quantity: enteredQuantity, unit: enteredUnit })) }, actor);
    const transfer = { material: "00000001", source: "00000001", destination: "00000002", quantity: "1", unit: "kg", plannedDispatch: "2026-10-21", plannedArrival: "2026-10-22" };
    for (let index = 0; index < 2; index++) await current.transferService.create(transfer, actor);
    // Two MRP runs in Test and one in Prod: a reset clears Test's runs and their results, and leaves Prod's (#274, D06).
    for (let index = 0; index < 2; index++) await inRequestTransaction(current.em, () => current.mrpRunService.run(actor));
    const prod = (await scope("prod")).cradle;
    const prodRun = await inRequestTransaction(prod.em, () => prod.mrpRunService.run(actor));
    const old = await sequences("test");

    await reset(2);

    const tiny = generated();
    const expected: Record<string, number> = {
      material: tiny.masters.materials.length, location: tiny.masters.locations.length, customer: tiny.masters.customers.length,
      supplier: tiny.masters.suppliers.length, bom: tiny.masters.boms.length, customer_order: tiny.summary.customerOrders,
      shipment: tiny.summary.shipments, goods_issue: tiny.summary.goodsIssues, purchase_requisition: tiny.summary.requisitions,
      purchase_order: tiny.summary.purchaseOrders, goods_receipt: tiny.summary.goodsReceipts, production_order: tiny.summary.productionOrders,
      production_completion: tiny.summary.completions, transfer: 0, mrp_run: 0,
    };
    const fresh = await sequences("test");
    expect(Object.keys(fresh).sort()).toEqual(Object.keys(expected).sort());
    for (const [table, codes] of Object.entries(fresh)) {
      // The old generation went further, so a sequence that carried on would not start at 00000001.
      expect(old[table].length, table).toBeGreaterThan(expected[table]);
      expect(codes, table).toEqual(Array.from({ length: expected[table] }, (_, index) => formatSequentialId(index + 1)));
    }
    // The new generation has one plant: a transfer needs a second, which takes the next location ID too.
    expect((await (await scope()).cradle.locationService.create({ name: "new generation location" }, actor)).id).toBe("00000002");
    expect((await (await scope()).cradle.transferService.create(transfer, actor)).id).toBe("00000001");
    const next = (await scope()).cradle;
    expect(await next.mrpRunService.current()).toBeNull();
    expect(await next.em.getConnection().execute("select count(*) as n from mrp_daily_result where tenant_code = 'test'")).toEqual([{ n: 0 }]);
    expect((await inRequestTransaction(next.em, () => next.mrpRunService.run(actor))).id).toBe("00000001");
    expect(await (await scope("prod")).cradle.mrpRunService.current()).toEqual(prodRun);
  }, 300_000);

  it.each(["locations", "BOMs", "shipments"] as const)("rolls back deletion and partially seeded %s, including both flags and all audits (TEN-027)", async (kind) => {
    await populate();
    await container.createScope().cradle.tenantService.setReadOnly("test", true, actor);
    const scoped = await scope();
    const spies = {
      locations: () => vi.spyOn(scoped.cradle.locationService, "seedDemo"),
      BOMs: () => vi.spyOn(scoped.cradle.bomService, "seedDemo"),
      // Mid-timeline: masters, openings and the first customer orders are already written.
      shipments: () => vi.spyOn(ShipmentService.prototype, "seedDemo"),
    };
    spies[kind]().mockRejectedValueOnce(new Error("injected seed failure"));
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


describe("keyed reset", { timeout: 60_000 }, () => {
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

describe("reset and a write on an independent SQLite connection (TEN-026)", { timeout: 60_000 }, () => {
  /** A write the way the API makes it: generation and read-only checked inside its own transaction. */
  async function apiWrite(writer: AppContainer["cradle"], description: string) {
    const fingerprint = await fingerprintOf({ method: "POST", path: "/api/tenants/test/materials", body: { description } });
    return writer.idempotencyService.run(
      { userId: "admin", key: description, operation: "POST /api/tenants/test/materials", fingerprint },
      { kind: "tenant", tenant: "test", generation: 1, requireGeneration: true },
      () => writer.materialService.create({ type: "raw", description, baseUnit: "kg" }, actor),
    );
  }

  it("retries a direct (UI) reset after another write commits first, removing that completed old-generation write", async () => {
    await populate();
    const other = await initOrm({ databasePath: orm.config.get("dbName") });
    try {
      const writer = (await scopeForTenant(createAppContainer(container.cradle.config, other), "test")).cradle;
      const resetting = (await scope()).cradle;
      // The spy only times the write: right after the reset's own transaction has read the generation.
      const read = resetting.tenantService.currentState.bind(resetting.tenantService);
      const currentState = vi.spyOn(resetting.tenantService, "currentState").mockImplementationOnce(async (code) => {
        const state = await read(code);
        await apiWrite(writer, "committed just before reset");
        return state;
      });
      await expect(resetting.testResetService.reset(1, actor)).resolves.toMatchObject({ generation: 2 });
      // The first attempt stopped at its first write, its snapshot stale; the retry read again, saw the write and removed it.
      // Each attempt reads the state before and after; a single attempt would read it twice.
      expect(currentState.mock.calls.map(([code]) => code)).toEqual(["test", "test", "test"]);
      expect(await (await scope()).cradle.em.count(Material, { description: "committed just before reset" })).toBe(0);
      expect(await (await scope()).cradle.em.count(GlobalAuditEvent, { action: "tenants.tenant.reset" })).toBe(1);
    } finally { await other.close(); }
  });

  it("retries an API reset after another write commits first, through the idempotency gate's own retry", async () => {
    await populate();
    const other = await initOrm({ databasePath: orm.config.get("dbName") });
    try {
      const writer = (await scopeForTenant(createAppContainer(container.cradle.config, other), "test")).cradle;
      const resetting = (await scope()).cradle;
      const fingerprint = await fingerprintOf({ method: "POST", path: "/api/tenants/test/reset", body: {} });
      let attempts = 0;
      // The gate has read the generation in its transaction when it calls the write; another connection commits first.
      await expect(resetting.idempotencyService.run(
        { userId: "admin", key: "reset", operation: "POST /api/tenants/test/reset", fingerprint },
        { kind: "test-reset", tenant: "test", generation: 1, requireGeneration: true },
        async () => {
          if (++attempts === 1) await apiWrite(writer, "committed just before reset");
          return resetting.testResetService.reset(1, actor);
        },
      )).resolves.toMatchObject({ replayed: false, data: { generation: 2 } });
      // The first attempt's snapshot went stale at the reset's first write; the gate's retry saw the write and removed it.
      expect(attempts).toBe(2);
      expect(await (await scope()).cradle.em.count(Material, { description: "committed just before reset" })).toBe(0);
      expect(await (await scope()).cradle.em.count(GlobalAuditEvent, { action: "tenants.tenant.reset" })).toBe(1);
    } finally { await other.close(); }
  });

  it("holds a write from another connection while the reset is uncommitted, then refuses it as stale, and keeps Test read-only", async () => {
    await populate();
    await container.createScope().cradle.tenantService.setReadOnly("test", true, actor);
    const other = await initOrm({ databasePath: orm.config.get("dbName") });
    try {
      const writer = (await scopeForTenant(createAppContainer(container.cradle.config, other), "test")).cradle;
      const resetting = (await scope()).cradle;
      let written: Promise<unknown> | undefined;
      await inRequestTransaction(resetting.em, async () => {
        await resetting.testResetService.reset(1, actor);
        // The reset has deleted and reseeded Test and holds the write gate: the other connection's write waits for the
        // commit instead of reaching SQLite's writer lock (#185).
        written = apiWrite(writer, "written during reset").then(() => "written", (error: unknown) => error);
        expect(await Promise.race([written, new Promise((resolve) => setTimeout(() => resolve("waiting"), 300))])).toBe("waiting");
      });
      // Once it commits, the waiting write sees the new generation and is refused as stale before the gate is even reached;
      // so is the same write issued afterwards.
      expect(await written).toMatchObject({ code: "GENERATION_STALE" });
      await expect(apiWrite(writer, "written after reset")).rejects.toMatchObject({ code: "GENERATION_STALE" });
      const current = (await scope()).cradle;
      expect(await current.tenantService.get("test")).toMatchObject({ generation: 2, readOnly: true });
      expect(await current.em.count(Material, { description: { $like: "written %" } })).toBe(0);
      expect(await current.em.count(Material, {})).toBe(generated().masters.materials.length);
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
