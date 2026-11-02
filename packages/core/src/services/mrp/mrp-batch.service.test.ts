import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, type MrpRunMode, type Orm } from "@cpg/db";
import { asValue } from "awilix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import type { AppContainer } from "../../container/cradle";
import { scopeForTenant } from "../../container/tenant-scope";
import { migrateDatabase, toDbOptions } from "../../database";
import { ConflictError } from "../../http/errors";
import { inRequestTransaction, retryingStaleSnapshot } from "../../http/request-transaction";
import type { AuditActor } from "../audit/actor";
import { REQUISITION_ID_RACE } from "../purchase-requisitions/purchase-requisition.service";
import { MRP_BATCH_TOO_LARGE } from "./mrp-batch.service";
import { MrpProposalDocumentService } from "./mrp-proposal-document.service";
import type { MrpPlanView } from "./mrp-run-view";

/*
 * The automatic batch (E19-S03) through the real run: one request transaction on a real SQLite file, as the
 * write wrappers run it, with today fixed. Every proposal the run can create becomes its document, or none does.
 */
// Thursday 1 October 2026: the horizon runs through 29 December.
const NOW = new Date("2026-10-01T09:30:00.000Z");
const ANNA: AuditActor = { userId: "anna-id", username: "anna", sessionId: "anna-session", channel: "ui", token: null };
const BOT: AuditActor = { userId: "bot-id", username: "bot", sessionId: null, channel: "api", token: { id: "token-id", name: "planner" } };
const PLANT = "00000001";

let orm: Orm;
let container: AppContainer;
const scope = (tenant = "prod") => scopeForTenant(container, tenant);
/** A run as the wrappers run it: one transaction on the scope's `em`, the tenant read first, retried once on a stale snapshot. */
const run = (mode: MrpRunMode = "automatic", { tenant = "prod", actor = ANNA } = {}) =>
  retryingStaleSnapshot(async () => {
    const { cradle } = await scope(tenant);
    return inRequestTransaction(cradle.em, async () => {
      await cradle.tenantService.currentState(cradle.tenant.code);
      return cradle.mrpRunService.run(actor, { mode });
    });
  });
const sql = <T = Record<string, unknown>>(query: string, params: unknown[] = []) => orm.em.getConnection().execute<T[]>(query, params);
const count = async (table: string, tenant = "prod") => (await sql<{ n: number }>(`select count(*) as n from ${table} where tenant_code = ?`, [tenant]))[0].n;
const requisitions = (tenant = "prod") =>
  sql<{ code: string; material: string; quantity: string; required_date: string; mrp_run: string | null }>(
    "select r.code, m.code as material, r.quantity, r.required_date, r.mrp_run from purchase_requisition r join material m on r.material_id = m.id where r.tenant_code = ? order by r.code",
    [tenant],
  );
/** The tenant's audit entries of one action, oldest first, with their `after`. */
const audits = async (action: string, tenant = "prod") =>
  (await sql<{ subject_id: string; channel: string; actor_username: string; after: string }>(
    "select subject_id, channel, actor_username, after from tenant_audit_event where tenant_code = ? and action = ? order by rowid",
    [tenant, action],
  )).map((row) => ({ ...row, after: JSON.parse(row.after) as Record<string, unknown> }));

async function material(description: string, { tenant = "prod", type = "finished" as "finished" | "intermediate" | "raw" } = {}) {
  return (await scope(tenant)).cradle.materialService.create({ type, description, baseUnit: "kg" }, ANNA);
}
/** Buy (or Make) at the plant with no lot rule: a proposal is exactly the need. */
async function parameters(materialId: string, procurement: "buy" | "make" = "buy", tenant = "prod") {
  await (await scope(tenant)).cradle.planningParameterService.create(
    { material: materialId, location: PLANT, procurement, leadTimeDays: 2, minimumQuantity: "0.000000", lotMultiple: "0.000001" },
    ANNA,
  );
}
/** One customer order at the plant with a line per `[quantity, requiredDate]`. */
async function order(materialId: string, lines: [string, string][], tenant = "prod") {
  return (await scope(tenant)).cradle.customerOrderService.create(
    { customer: "00000001", location: PLANT, lines: lines.map(([quantity, requiredDate]) => ({ material: materialId, quantity, unit: "kg", requiredDate })) },
    ANNA,
  );
}
/** `n` Buy materials, each with one order of `10 + i` due on 5 October: one proposal each, in material order. */
async function buyMaterials(n: number, tenant = "prod") {
  const codes: string[] = [];
  for (let index = 0; index < n; index += 1) {
    const item = await material(`Item ${index}`, { tenant });
    await parameters(item.id, "buy", tenant);
    await order(item.id, [[String(10 + index), "2026-10-05"]], tenant);
    codes.push(item.id);
  }
  return codes;
}
/** The latest run's plan of `materialId` at the plant. */
async function plan(materialId: string, tenant = "prod"): Promise<MrpPlanView> {
  return (await (await scope(tenant)).cradle.mrpRunService.latest({ material: materialId, location: PLANT })).plans[0];
}

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-batch-")) });
  await migrateDatabase(config);
  orm = await initOrm(toDbOptions(config));
  container = createAppContainer(config, orm);
  for (const tenant of ["prod", "test"]) {
    await (await scope(tenant)).cradle.customerService.create({ name: "Retail" }, ANNA);
    await (await scope(tenant)).cradle.locationService.create({ name: "Plant" }, ANNA);
  }
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await orm.close();
});

describe("an automatic MRP run's batch (E19-S03)", () => {
  it("RUN-003: a manual run, the default, creates no document and stores no creation outcome", async () => {
    await buyMaterials(2);

    const view = await run("manual");

    expect(view).toMatchObject({ mode: "manual", creation: null });
    expect(view).not.toHaveProperty("documents");
    for (const table of ["purchase_requisition", "purchase_order", "production_order"]) expect(await count(table)).toBe(0);
    // The run's audit entry keeps its manual shape.
    expect((await audits("mrp.mrp-run.created")).map(({ after }) => after)).toEqual([{ date: "2026-10-01", generation: 1 }]);
  });

  it("RUN-007, RUN-014, R08: creates exactly the 5 executable proposals as Open requisitions tagged with the run, each with its creation entry", async () => {
    const items = await buyMaterials(5);

    const view = await run("automatic", { actor: BOT });

    expect(view).toMatchObject({ id: "00000001", mode: "automatic", creation: { status: "created", documents: 5 } });
    expect(await requisitions()).toEqual(
      items.map((item, index) => ({ code: `0000000${index + 1}`, material: item, quantity: `${10 + index}.000000`, required_date: "2026-10-05", mrp_run: "00000001" })),
    );
    // In candidate order: material, location, need date (spec Q14); each proposal names its own document.
    const plans = await Promise.all(items.map((item) => plan(item)));
    expect(view.documents).toEqual(plans.map(({ proposals: [proposal] }, index) => ({ proposal: proposal.id, kind: "purchase-requisition", id: `0000000${index + 1}` })));
    expect(plans.map(({ proposals }) => proposals.map(({ document }) => document))).toEqual([["00000001"], ["00000002"], ["00000003"], ["00000004"], ["00000005"]]);
    expect(await count("purchase_order")).toBe(0);
    const created = await audits("purchase-requisitions.purchase-requisition.created");
    expect(created.map(({ subject_id, channel, actor_username, after }) => [subject_id, channel, actor_username, after.mrpRun])).toEqual(
      ["00000001", "00000002", "00000003", "00000004", "00000005"].map((id) => [id, "api", "bot", "00000001"]),
    );
    expect((await audits("mrp.mrp-run.created")).map(({ after }) => after)).toEqual([{ date: "2026-10-01", generation: 1, mode: "automatic", documents: 5 }]);
  });

  it("creates nothing for a Make proposal: it stays listed without a document until Make proposals can be created (#320, spec Q1)", async () => {
    const shelf = await material("Shelf");
    const { cradle } = await scope();
    const input = await cradle.materialService.create({ type: "raw", description: "Board", baseUnit: "each" }, ANNA);
    await cradle.stockService.correct({ material: input.id, location: PLANT, quantity: "500", unit: "each", reason: "Count" }, ANNA);
    await cradle.bomService.create({ output: shelf.id, priority: 1, validFrom: "2026-01-01", validThrough: null, components: [{ material: input.id, quantity: "1", unit: "each" }] }, ANNA);
    await parameters(shelf.id, "make");
    await order(shelf.id, [["20", "2026-10-09"]]);
    const [sugar] = await buyMaterials(1);

    const view = await run();

    expect(view.creation).toEqual({ status: "created", documents: 1 });
    expect((await plan(shelf.id)).proposals).toEqual([expect.objectContaining({ kind: "production-order", executable: false, document: null })]);
    expect((await plan(sugar)).proposals[0].document).toBe("00000001");
    expect(await count("production_order")).toBe(0);
  });

  it("creates every proposal across a flush boundary, 26 of one pair, and marks each with its own document", async () => {
    const sugar = await material("Sugar");
    await parameters(sugar.id);
    // One need a day: 26 proposals, one more than a chunk.
    await order(sugar.id, Array.from({ length: 26 }, (_, day) => ["1", `2026-10-${String(5 + day).padStart(2, "0")}`] as [string, string]));

    const view = await run();

    expect(view.creation).toEqual({ status: "created", documents: 26 });
    const { proposals } = await plan(sugar.id);
    expect(proposals).toHaveLength(26);
    expect(proposals.map(({ document }) => document)).toEqual(Array.from({ length: 26 }, (_, index) => String(index + 1).padStart(8, "0")));
    expect((await requisitions()).map(({ required_date }) => required_date)).toEqual(proposals.map(({ needDate }) => needDate));
  });

  it("RUN-015, RUN-023, AUD-023: one inactive material's candidate fails the batch, so none of the 5 is created, and the run keeps its results and names the cause and candidate", async () => {
    const items = await buyMaterials(5);
    // A material with open demand can't be deactivated through its service (#287's test), so the flag is set directly.
    await sql("update material set active = 0 where code = ? and tenant_code = 'prod'", [items[2]]);

    const view = await run();

    const third = (await plan(items[2])).proposals[0];
    expect(view.creation).toEqual({
      status: "failed", code: "MATERIAL_INACTIVE", message: expect.any(String),
      candidate: { proposal: third.id, kind: "purchase-requisition", material: items[2], location: PLANT, needDate: "2026-10-05", quantity: "12.000000" },
    });
    expect(view.documents).toEqual([]);
    expect(await count("purchase_requisition")).toBe(0);
    expect(await audits("purchase-requisitions.purchase-requisition.created")).toEqual([]);
    // The results stay whole, and no proposal is marked: the savepoint took the marks back with the documents.
    const plans = await Promise.all(items.map((item) => plan(item)));
    expect(plans.map(({ proposals }) => proposals.map(({ document }) => document))).toEqual([[null], [null], [null], [null], [null]]);
    expect(await count("mrp_daily_result")).toBe(5 * 90);
    // Stored on the run, so the latest read and the audit say it too.
    expect((await (await scope()).cradle.mrpRunService.latest({})).run.creation).toEqual(view.creation);
    expect((await audits("mrp.mrp-run.created")).map(({ after }) => after)).toEqual([
      { date: "2026-10-01", generation: 1, mode: "automatic", documents: 0, failure: "MATERIAL_INACTIVE" },
    ]);
  });

  it("RUN-015: a quantity above what one document may hold fails the batch as VALIDATION_FAILED, keeping its field errors", async () => {
    const [sugar] = await buyMaterials(1);
    const flour = await material("Flour");
    await parameters(flour.id);
    // Two entries of the most one may hold: the proposal sums them, past the limit.
    await order(flour.id, [["999999999999", "2026-10-06"], ["999999999999", "2026-10-06"]]);

    const view = await run();

    expect(view.creation).toMatchObject({
      status: "failed", code: "VALIDATION_FAILED", fieldErrors: { quantity: [expect.any(String)] },
      candidate: { material: flour.id, quantity: "1999999999998.000000" },
    });
    expect((await plan(sugar)).proposals[0].document).toBeNull();
    expect(await count("purchase_requisition")).toBe(0);
  });

  it("caps a batch: above the limit it records MRP_BATCH_TOO_LARGE with the count, and creates nothing (spec Q15)", async () => {
    container.register({ mrpBatchLimit: asValue(2) });
    await buyMaterials(3);

    const view = await run();

    expect(view.creation).toEqual({ status: "failed", code: "MRP_BATCH_TOO_LARGE", message: MRP_BATCH_TOO_LARGE, params: { candidates: "3", limit: "2" } });
    expect(await count("purchase_requisition")).toBe(0);
    expect(await count("mrp_recommendation")).toBe(3);
  });

  it("fails the whole request, storing no run, document or entry, on an error that isn't a business refusal (spec Q10)", async () => {
    await buyMaterials(3);
    await sql("create trigger fail_third before insert on purchase_requisition when (select count(*) from purchase_requisition) >= 2 begin select raise(abort, 'disk full'); end");

    await expect(run()).rejects.toThrow("disk full");

    expect(await count("mrp_run")).toBe(0);
    expect(await count("purchase_requisition")).toBe(0);
    expect(await audits("purchase-requisitions.purchase-requisition.created")).toEqual([]);
    expect(await audits("mrp.mrp-run.created")).toEqual([]);
  });

  it("lets REQUISITION_ID_RACE fail the request instead of storing it as the run's outcome (spec Q10)", async () => {
    await buyMaterials(2);
    vi.spyOn(MrpProposalDocumentService.prototype, "create").mockRejectedValueOnce(new ConflictError(REQUISITION_ID_RACE, "REQUISITION_ID_RACE"));
    const { cradle } = await scope();

    await expect(inRequestTransaction(cradle.em, () => cradle.mrpRunService.run(ANNA, { mode: "automatic" }))).rejects.toMatchObject({ code: "REQUISITION_ID_RACE" });

    expect(await count("mrp_run")).toBe(0);
    expect(await count("purchase_requisition")).toBe(0);
  });

  it("RUN-016: an independent exception doesn't fail the batch: A's Missing BOM is reported and B's requisition created", async () => {
    const a = await material("Cabinet");
    await parameters(a.id, "make");
    await order(a.id, [["3", "2026-10-05"]]);
    const [b] = await buyMaterials(1);

    const view = await run();

    expect(view.creation).toEqual({ status: "created", documents: 1 });
    expect((await plan(a.id)).exceptions.map(({ code }) => code)).toEqual(["MISSING_BOM"]);
    expect((await plan(b)).proposals[0].document).toBe("00000001");
  });

  it("RUN-025: creates R's requisition and no production order for the provisional F and I, which stay in the provisional plan", async () => {
    const { cradle } = await scope();
    const f = await material("Cabinet");
    const i = await material("Frame", { type: "intermediate" });
    const r = await material("Steel", { type: "raw" });
    for (const [output, component, quantity] of [[f.id, i.id, "2"], [i.id, r.id, "0.5"]]) {
      await cradle.bomService.create({ output, priority: 1, validFrom: "2026-01-01", validThrough: null, components: [{ material: component, quantity, unit: "kg" }] }, ANNA);
    }
    await parameters(f.id, "make");
    await parameters(i.id, "make");
    await parameters(r.id, "buy");
    await order(f.id, [["10", "2026-10-21"]]);

    const view = await run();

    expect(view.creation).toEqual({ status: "created", documents: 1 });
    expect(await requisitions()).toEqual([expect.objectContaining({ material: r.id, quantity: "10.000000", mrp_run: "00000001" })]);
    expect(await count("production_order")).toBe(0);
    for (const item of [f.id, i.id]) {
      const provisional = await plan(item);
      expect(provisional.proposals).toEqual([]);
      expect(provisional.provisional).toEqual([expect.objectContaining({ kind: "production-order" })]);
    }
  });

  it("RUN-008, RUN-013: an automatic rerun on unchanged data creates nothing and leaves the first run's requisition as it was", async () => {
    const [sugar] = await buyMaterials(1);
    await run();
    const before = await (await scope()).cradle.purchaseRequisitionService.get("00000001");

    const rerun = await run();

    expect(rerun).toMatchObject({ id: "00000002", creation: { status: "created", documents: 0 }, documents: [] });
    expect(await (await scope()).cradle.purchaseRequisitionService.get("00000001")).toEqual(before);
    expect(before).toMatchObject({ status: "open", mrpRun: "00000001" });
    expect((await plan(sugar)).proposals).toEqual([]);
  });

  it("RUN-010: an automatic run leaves an Open production order of 100 against demand of 80 as it was, and the read shows an excess of 20", async () => {
    const { cradle } = await scope();
    const output = await material("Shelf");
    const component = await cradle.materialService.create({ type: "raw", description: "Board", baseUnit: "each" }, ANNA);
    await cradle.stockService.correct({ material: component.id, location: PLANT, quantity: "500", unit: "each", reason: "Count" }, ANNA);
    const bom = await cradle.bomService.create({ output: output.id, priority: 1, validFrom: "2026-01-01", validThrough: null, components: [{ material: component.id, quantity: "1", unit: "each" }] }, ANNA);
    await parameters(output.id, "make");
    const produced = await inRequestTransaction(cradle.em, () =>
      cradle.productionOrderService.create({ output: output.id, location: PLANT, quantity: "100", unit: "kg", plannedFinish: "2026-10-12", bom: bom.id, revision: 1 }, ANNA),
    );
    await order(output.id, [["80", "2026-10-20"]]);
    const before = await (await scope()).cradle.productionOrderService.get(produced.id);

    const view = await run();

    expect(view.creation).toEqual({ status: "created", documents: 0 });
    expect(await (await scope()).cradle.productionOrderService.get(produced.id)).toEqual(before);
    expect((await plan(output.id)).excess).toBe("20.000000");
    expect(await count("production_order")).toBe(1);
  });

  it("N06: creates and changes no transfer when the source can't supply one", async () => {
    const { cradle } = await scope();
    const cabinet = await material("Cabinet");
    const store = (await cradle.locationService.create({ name: "Store" }, ANNA)).id;
    await cradle.stockService.correct({ material: cabinet.id, location: PLANT, quantity: "6", unit: "kg", reason: "Count" }, ANNA);
    await parameters(cabinet.id);
    await cradle.planningParameterService.create({ material: cabinet.id, location: store, procurement: "buy", leadTimeDays: 2, minimumQuantity: "0.000000", lotMultiple: "1.000000" }, ANNA);
    const transfer = await cradle.transferService.create({ material: cabinet.id, source: PLANT, destination: store, quantity: "10", unit: "kg", plannedDispatch: "2026-10-03", plannedArrival: "2026-10-04" }, ANNA);
    const before = await (await scope()).cradle.transferService.get(transfer.id);

    await run();

    expect((await plan(cabinet.id)).exceptions.map(({ code }) => code)).toEqual(["INSUFFICIENT_TRANSFER_STOCK"]);
    expect(await count("transfer")).toBe(1);
    expect(await (await scope()).cradle.transferService.get(transfer.id)).toEqual(before);
  });

  it("R05: creates documents only in its own tenant", async () => {
    await buyMaterials(2, "test");
    await buyMaterials(1, "prod");

    const view = await run("automatic", { tenant: "test" });

    expect(view.creation).toEqual({ status: "created", documents: 2 });
    expect(await count("purchase_requisition", "test")).toBe(2);
    expect(await count("purchase_requisition", "prod")).toBe(0);
  });
});
