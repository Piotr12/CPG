import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "@cpg/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { getContainer } from "../../container/container";
import { tenantScope } from "../../container/tenant-scope";
import { toDbOptions } from "../../database";
import { inRequestTransaction } from "../../http/request-transaction";
import { tenantServerAction } from "../../http/tenant-server-action";
import { mrpRunSchema } from "../../validators/mrp/mrp-run.schema";
import type { AuditActor } from "../audit/actor";
import { fingerprintOf, operationOf } from "../idempotency/fingerprint";

/*
 * The run trusts its callers for the read-only and generation gate (spec, "Read-only, generation and
 * channels"). The app's tests mock `@cpg/core`, so these run the real wrappers around the real service:
 * the Run MRP action's `tenantServerAction`, and the `IdempotencyService` behind `tenantApiWrite`.
 */
const ANNA: AuditActor = { userId: "anna-id", username: "anna", sessionId: "anna-session", channel: "ui", token: null };
const ADMIN_TOKEN: AuditActor = { userId: "admin-id", username: "admin", sessionId: null, channel: "api", token: { id: "t", name: "ops" } };
const runAction = tenantServerAction(mrpRunSchema, (input, { cradle }) => cradle.mrpRunService.run(ANNA, input ?? {}));

const sql = async (query: string) => (await getContainer()).cradle.orm.em.getConnection().execute(query);
const runs = async () => (await sql("select tenant_code, code from mrp_run order by tenant_code, code")) as { tenant_code: string; code: string }[];
/** A keyed API run, as `POST /api/tenants/{tenant}/mrp/runs` makes it, with its raw body. */
async function apiRun(tenant: "prod" | "test", key: string, generation: number | null, body: string | null = null) {
  const { cradle } = await tenantScope(tenant);
  const write = { method: "POST", path: `/api/tenants/${tenant}/mrp/runs`, body };
  const input = mrpRunSchema.parse(body === null ? null : JSON.parse(body));
  return cradle.idempotencyService.run(
    { userId: ADMIN_TOKEN.userId, key, operation: operationOf(write), fingerprint: await fingerprintOf(write) },
    { kind: "tenant", tenant, generation, requireGeneration: tenant === "test" },
    () => cradle.mrpRunService.run(ADMIN_TOKEN, input ?? {}),
  );
}
/** Three Buy materials in Test, each with one need ten days out: an automatic run there creates three requisitions. */
async function threeNeeds() {
  // This file runs on the real clock, so the need is placed inside today's horizon.
  const requiredDate = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const { cradle } = await tenantScope("test");
  await cradle.customerService.create({ name: "Retail" }, ANNA);
  await cradle.locationService.create({ name: "Plant" }, ANNA);
  for (const description of ["Sugar", "Salt", "Flour"]) {
    const item = await (await tenantScope("test")).cradle.materialService.create({ type: "raw", description, baseUnit: "kg" }, ANNA);
    await (await tenantScope("test")).cradle.planningParameterService.create(
      { material: item.id, location: "00000001", procurement: "buy", leadTimeDays: 2, minimumQuantity: "0.000000", lotMultiple: "0.000001" },
      ANNA,
    );
    await (await tenantScope("test")).cradle.customerOrderService.create(
      { customer: "00000001", location: "00000001", lines: [{ material: item.id, quantity: "5", unit: "kg", requiredDate }] },
      ANNA,
    );
  }
}
const requisitions = async () => (await sql("select code, mrp_run from purchase_requisition order by code")) as { code: string; mrp_run: string }[];
/**
 * In Prod, a Buy need of 5 with a requisition of 2 already entered for it, and a Make need of 20 with a production order of 5
 * already open for it: both leave a need an automatic run would create a document for.
 */
async function needsWithDocuments() {
  const requiredDate = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const { cradle } = await tenantScope("prod");
  await cradle.customerService.create({ name: "Retail" }, ANNA);
  await cradle.locationService.create({ name: "Plant" }, ANNA);
  const parameters = (material: string, procurement: "buy" | "make") => cradle.planningParameterService.create(
    { material, location: "00000001", procurement, leadTimeDays: 2, minimumQuantity: "0.000000", lotMultiple: "0.000001" },
    ANNA,
  );
  const need = (material: string, quantity: string) => cradle.customerOrderService.create(
    { customer: "00000001", location: "00000001", lines: [{ material, quantity, unit: "kg", requiredDate }] },
    ANNA,
  );
  const sugar = await cradle.materialService.create({ type: "raw", description: "Sugar", baseUnit: "kg" }, ANNA);
  await parameters(sugar.id, "buy");
  await need(sugar.id, "5");
  await inRequestTransaction(cradle.em, () => cradle.purchaseRequisitionService.create({ material: sugar.id, location: "00000001", quantity: "2", unit: "kg", requiredDate }, ANNA));
  const shelf = await cradle.materialService.create({ type: "finished", description: "Shelf", baseUnit: "kg" }, ANNA);
  const board = await cradle.materialService.create({ type: "raw", description: "Board", baseUnit: "kg" }, ANNA);
  await cradle.stockService.correct({ material: board.id, location: "00000001", quantity: "500", unit: "kg", reason: "Count" }, ANNA);
  const bom = await cradle.bomService.create({ output: shelf.id, priority: 1, validFrom: "2026-01-01", validThrough: null, components: [{ material: board.id, quantity: "1", unit: "kg" }] }, ANNA);
  await parameters(shelf.id, "make");
  await need(shelf.id, "20");
  await inRequestTransaction(cradle.em, () =>
    cradle.productionOrderService.create({ output: shelf.id, location: "00000001", quantity: "5", unit: "kg", plannedFinish: requiredDate, bom: bom.id, revision: 1 }, ANNA));
}
/** Every stored column of Prod's requisitions and production orders. */
const prodDocuments = async () => ({
  requisitions: await sql("select * from purchase_requisition where tenant_code = 'prod' order by code"),
  productionOrders: await sql("select * from production_order where tenant_code = 'prod' order by code"),
});

describe("the gate around an MRP run", () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "cpg-mrp-gate-"));
  beforeAll(async () => {
    await migrate(toDbOptions(loadConfig({ DATA_DIR: dataDir })));
    vi.stubEnv("DATA_DIR", dataDir);
  });
  afterEach(async () => {
    await sql("update tenant set read_only = 0");
    await sql("delete from production_order");
    await sql("delete from purchase_requisition");
    await sql("delete from mrp_daily_result");
    await sql("delete from mrp_recommendation");
    await sql("delete from mrp_run_exception");
    await sql("delete from mrp_run");
  });
  afterAll(async () => {
    await (await getContainer()).cradle.orm.close();
    vi.unstubAllEnvs();
  });

  it("runs from the page in a writable tenant", async () => {
    await expect(runAction("prod", 1, {})).resolves.toMatchObject({ ok: true, data: { id: "00000001", account: "anna", channel: "ui" } });
    expect(await runs()).toEqual([{ tenant_code: "prod", code: "00000001" }]);
  });

  it("refuses a run from the page in a read-only tenant, and stores nothing (RUN-021, TEN-019)", async () => {
    await sql("update tenant set read_only = 1 where code = 'prod'");

    await expect(runAction("prod", 1, {})).resolves.toMatchObject({ ok: false, error: { code: "TENANT_READ_ONLY" } });
    expect(await runs()).toEqual([]);
  });

  it("refuses a run from a page rendered for an older Test generation, and stores nothing", async () => {
    await sql("update tenant set generation = 2 where code = 'test'");
    try {
      await expect(runAction("test", 1, {})).resolves.toMatchObject({ ok: false, error: { code: "GENERATION_STALE" } });
      expect(await runs()).toEqual([]);
    } finally {
      await sql("update tenant set generation = 1 where code = 'test'");
    }
  });

  it("refuses a mode or key the run doesn't take, and stores nothing (E19-S03)", async () => {
    for (const input of [{ mode: "auto" }, { mode: null }, { extra: 1 }]) {
      await expect(runAction("prod", 1, input)).resolves.toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    }
    expect(await runs()).toEqual([]);
  });

  it("refuses an API run in a read-only tenant, the admin's token included, and stores nothing (RUN-021, TEN-019)", async () => {
    await sql("update tenant set read_only = 1 where code = 'prod'");

    await expect(apiRun("prod", "key-1", null)).rejects.toMatchObject({ code: "TENANT_READ_ONLY", status: 409 });
    expect(await runs()).toEqual([]);
  });

  it("refuses a Test API run without the generation, or with a stale one, and stores nothing (R07)", async () => {
    await expect(apiRun("test", "key-2", null)).rejects.toMatchObject({ code: "GENERATION_REQUIRED", status: 428 });
    await expect(apiRun("test", "key-3", 7)).rejects.toMatchObject({ code: "GENERATION_STALE", status: 409 });
    expect(await runs()).toEqual([]);
  });

  it("replays a repeated API run with the same key, so no second run exists", async () => {
    const first = await apiRun("test", "key-4", 1);
    const repeat = await apiRun("test", "key-4", 1);

    expect(first.replayed).toBe(false);
    expect(repeat).toEqual({ data: JSON.parse(JSON.stringify(first.data)), replayed: true });
    expect(await runs()).toEqual([{ tenant_code: "test", code: "00000001" }]);
  });

  it("refuses an automatic run from the page and through the API in a read-only tenant, the admin's token included, storing nothing (RUN-021)", async () => {
    await sql("update tenant set read_only = 1 where code = 'prod'");

    await expect(runAction("prod", 1, { mode: "automatic" })).resolves.toMatchObject({ ok: false, error: { code: "TENANT_READ_ONLY" } });
    await expect(apiRun("prod", "key-5", null, JSON.stringify({ mode: "automatic" }))).rejects.toMatchObject({ code: "TENANT_READ_ONLY", status: 409 });
    expect(await runs()).toEqual([]);
  });

  it("TEN-019: a refused automatic run with executable needs in a read-only tenant leaves its requisitions and production orders exactly as before, and the earlier run the latest (#381)", async () => {
    await needsWithDocuments();
    // The earlier results: a manual run proposes a requisition of 3 and a production order of 15, so the needs are executable.
    await expect(runAction("prod", 1, {})).resolves.toMatchObject({ ok: true, data: { id: "00000001", mode: "manual" } });
    expect(await sql("select kind, quantity from mrp_recommendation where tenant_code = 'prod' order by kind")).toEqual([
      { kind: "production-order", quantity: "15.000000" },
      { kind: "purchase-requisition", quantity: "3.000000" },
    ]);
    const before = await prodDocuments();
    expect([before.requisitions.length, before.productionOrders.length]).toEqual([1, 1]);
    const report = async () => (await tenantScope("prod")).cradle.mrpRunService.latest({});
    const reportBefore = await report();
    expect(reportBefore.run).toMatchObject({ id: "00000001", mode: "manual" });
    await sql("update tenant set read_only = 1 where code = 'prod'");

    await expect(runAction("prod", 1, { mode: "automatic" })).resolves.toMatchObject({ ok: false, error: { code: "TENANT_READ_ONLY" } });
    await expect(apiRun("prod", "key-8", null, JSON.stringify({ mode: "automatic" }))).rejects.toMatchObject({ code: "TENANT_READ_ONLY", status: 409 });

    expect(await prodDocuments()).toEqual(before);
    expect(await runs()).toEqual([{ tenant_code: "prod", code: "00000001" }]);
    // The old report reads as it did: the same run, plans and proposals.
    expect(await report()).toEqual(reportBefore);
  });

  it("replays an automatic API run with its key: the same run and the same 3 documents, and the tenant holds 3, not 6 (RUN-024, API-027)", async () => {
    await threeNeeds();
    const body = JSON.stringify({ mode: "automatic" });

    const first = await apiRun("test", "key-6", 1, body);
    const repeat = await apiRun("test", "key-6", 1, body);

    expect(first.data).toMatchObject({ id: "00000001", mode: "automatic", creation: { status: "created", documents: 3 } });
    expect(first.data.documents?.map(({ id }) => id)).toEqual(["00000001", "00000002", "00000003"]);
    expect(repeat).toEqual({ data: JSON.parse(JSON.stringify(first.data)), replayed: true });
    expect(await requisitions()).toEqual(["00000001", "00000002", "00000003"].map((code) => ({ code, mrp_run: "00000001" })));
    expect(await runs()).toEqual([{ tenant_code: "test", code: "00000001" }]);
    // The same key with a manual body is another request, refused before anything runs.
    await expect(apiRun("test", "key-6", 1, "{}")).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("refuses the old key with the old generation after a Test reset (R07)", async () => {
    await apiRun("test", "key-7", 1, JSON.stringify({ mode: "automatic" }));
    await sql("update tenant set generation = 2 where code = 'test'");
    try {
      await expect(apiRun("test", "key-7", 1, JSON.stringify({ mode: "automatic" }))).rejects.toMatchObject({ code: "GENERATION_STALE" });
    } finally {
      await sql("update tenant set generation = 1 where code = 'test'");
    }
  });
});
