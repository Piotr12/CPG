import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import type { AppContainer } from "../../container/cradle";
import { scopeForTenant } from "../../container/tenant-scope";
import { migrateDatabase, toDbOptions } from "../../database";
import { inRequestTransaction, retryingStaleSnapshot } from "../../http/request-transaction";
import type { AuditActor } from "../audit/actor";
import { MRP_PROPOSAL_ACCEPTED, MRP_PROPOSAL_NOT_EXECUTABLE, MRP_PROPOSAL_NOT_FOUND, MRP_PROPOSAL_STALE } from "./mrp-acceptance.service";
import { PurchaseRequisitionService } from "../purchase-requisitions/purchase-requisition.service";
import { MRP_RUN_NOT_FOUND } from "./mrp-run.service";
import type { MrpPlanView } from "./mrp-run-view";

// Thursday 1 October 2026: the horizon runs through 29 December.
const NOW = new Date("2026-10-01T09:30:00.000Z");
const ANNA: AuditActor = { userId: "anna-id", username: "anna", sessionId: "anna-session", channel: "ui", token: null };
const BOT: AuditActor = { userId: "bot-id", username: "bot", sessionId: null, channel: "api", token: { id: "token-id", name: "planner" } };
const PLANT = "00000001";
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

let orm: Orm;
let container: AppContainer;
const scope = (tenant = "prod") => scopeForTenant(container, tenant);
/** A write as the wrappers run it: one transaction on the scope's `em`, the tenant read first, retried once on a stale snapshot. */
const wrapped = <T>(tenant: string, write: (cradle: AppContainer["cradle"]) => Promise<T>) =>
  retryingStaleSnapshot(async () => {
    const { cradle } = await scope(tenant);
    return inRequestTransaction(cradle.em, async () => {
      await cradle.tenantService.currentState(cradle.tenant.code);
      return write(cradle);
    });
  });
const run = (tenant = "prod") => wrapped(tenant, (cradle) => cradle.mrpRunService.run(ANNA));
const accept = (runId: string, proposalId: string, { tenant = "prod", actor = ANNA } = {}) =>
  wrapped(tenant, (cradle) => cradle.mrpAcceptanceService.accept(runId, proposalId, actor));
const sql = <T = Record<string, unknown>>(query: string, params: unknown[] = []) => orm.em.getConnection().execute<T[]>(query, params);
const count = async (table: string, tenant = "prod") => (await sql<{ n: number }>(`select count(*) as n from ${table} where tenant_code = ?`, [tenant]))[0].n;

async function material(description: string, tenant = "prod") {
  return (await scope(tenant)).cradle.materialService.create({ type: "finished", description, baseUnit: "kg" }, ANNA);
}
async function order(materialId: string, quantity: string, requiredDate: string, { tenant = "prod", location = PLANT } = {}) {
  return (await scope(tenant)).cradle.customerOrderService.create(
    { customer: "00000001", location, lines: [{ material: materialId, quantity, unit: "kg", requiredDate }] },
    ANNA,
  );
}
async function stock(materialId: string, quantity: string, tenant = "prod") {
  await (await scope(tenant)).cradle.stockService.correct({ material: materialId, location: PLANT, quantity, unit: "kg", reason: "Count" }, ANNA);
}
/** Buy (or Make) at the plant with no lot rule: a proposal is exactly the need. */
async function parameters(materialId: string, procurement: "buy" | "make" = "buy", tenant = "prod") {
  await (await scope(tenant)).cradle.planningParameterService.create(
    { material: materialId, location: PLANT, procurement, leadTimeDays: 2, minimumQuantity: "0.000000", lotMultiple: "1.000000" },
    ANNA,
  );
}
/** An active BOM of `output`, valid from 2026, made of a raw material of its own: a Make set may propose it (E16-S03, #280). */
async function bom(output: string) {
  const { cradle } = await scope();
  const component = await cradle.materialService.create({ type: "raw", description: `Input of ${output}`, baseUnit: "each" }, ANNA);
  await cradle.bomService.create({ output, priority: 1, validFrom: "2026-01-01", validThrough: null, components: [{ material: component.id, quantity: "1", unit: "each" }] }, ANNA);
}
/** The latest run's plan of `materialId` at the plant, with its proposals. */
async function plan(materialId: string, tenant = "prod"): Promise<MrpPlanView & { run: string }> {
  const report = await (await scope(tenant)).cradle.mrpRunService.latest({ material: materialId, location: PLANT });
  return { ...report.plans[0], run: report.run.id };
}
/** A Buy material with one order of `quantity` due on 5 October, planned by a run: its only proposal. */
async function buyProposal(description = "Sugar", quantity = "100", tenant = "prod") {
  const sugar = await material(description, tenant);
  await parameters(sugar.id, "buy", tenant);
  await order(sugar.id, quantity, "2026-10-05", { tenant });
  await run(tenant);
  const { run: runId, proposals } = await plan(sugar.id, tenant);
  return { material: sugar.id, runId, proposal: proposals[0] };
}

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-acceptance-")) });
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

describe("MrpAcceptanceService.accept: creating the document", () => {
  it("turns a Buy need of exactly 100 kg into one Open requisition of 100.000000 kg on the need date, tagged with the run, and no purchase order (BUY-001, R03)", async () => {
    const { material: sugar, runId, proposal } = await buyProposal();
    expect(proposal).toMatchObject({ kind: "purchase-requisition", needDate: "2026-10-05", quantity: "100.000000", executable: true, document: null });

    const accepted = await accept(runId, proposal.id);

    expect(accepted.document).toMatchObject({
      id: "00000001", material: sugar, location: PLANT, quantity: "100.000000", enteredQuantity: "100", enteredUnit: "kg",
      numerator: "1", denominator: "1", requiredDate: "2026-10-05", converted: "0.000000", status: "open", mrpRun: runId,
    });
    expect(accepted.proposal).toEqual({
      id: proposal.id, run: runId, material: sugar, location: PLANT, kind: "purchase-requisition", needDate: "2026-10-05",
      quantity: "100.000000", plannedStart: "2026-10-03", plannedFinish: "2026-10-05", lateDays: 0, beyondHorizon: false, executable: true, document: "00000001",
      // A requisition is exploded through no BOM (#281).
      bom: null, bomRevision: null,
    });
    expect(await count("purchase_requisition")).toBe(1);
    expect(await count("purchase_order")).toBe(0);
    expect((await plan(sugar)).proposals[0].document).toBe("00000001");
    expect(await (await scope()).cradle.purchaseRequisitionService.get("00000001")).toMatchObject({ mrpRun: runId });
  });

  it("creates a requisition of 50 linked to the run, readable with its run ID, and no purchase order (RUN-005)", async () => {
    const { runId, proposal } = await buyProposal("Salt", "50");

    const { document } = await accept(runId, proposal.id, { actor: BOT });

    expect(document).toMatchObject({ quantity: "50.000000", mrpRun: runId });
    expect((await (await scope()).cradle.purchaseRequisitionService.list())[0]).toMatchObject({ id: document.id, mrpRun: runId });
    expect(await count("purchase_order")).toBe(0);
  });

  it("records the creation with the run, the account, the session and the channel, in the document's transaction (R08)", async () => {
    const [sugar, salt] = [await material("Sugar"), await material("Salt")];
    for (const [item, quantity] of [[sugar.id, "100"], [salt.id, "7"]]) {
      await parameters(item);
      await order(item, quantity, "2026-10-05");
    }
    await run();
    const [ofSugar, ofSalt] = [await plan(sugar.id), await plan(salt.id)];

    await accept(ofSugar.run, ofSugar.proposals[0].id, { actor: BOT });
    await accept(ofSalt.run, ofSalt.proposals[0].id);
    // Refused after its checks: its transaction rolls back, so it records nothing.
    await expect(accept(ofSugar.run, ofSugar.proposals[0].id)).rejects.toMatchObject({ code: "MRP_PROPOSAL_ACCEPTED" });

    const entries = await sql<{ subject_id: string; actor_username: string; session_id: string | null; channel: string; token_name: string | null; after: string }>(
      "select subject_id, actor_username, session_id, channel, token_name, after from tenant_audit_event where action = 'purchase-requisitions.purchase-requisition.created' order by subject_id",
    );
    expect(entries.map(({ after, ...entry }) => ({ ...entry, after: JSON.parse(after) }))).toEqual([
      { subject_id: "00000001", actor_username: "bot", session_id: null, channel: "api", token_name: "planner", after: expect.objectContaining({ quantity: "100.000000", mrpRun: ofSugar.run }) },
      { subject_id: "00000002", actor_username: "anna", session_id: "anna-session", channel: "ui", token_name: null, after: expect.objectContaining({ quantity: "7.000000", mrpRun: ofSalt.run }) },
    ]);
  });

  it("accepts a pair's two proposals in either order: an accepted one leaves the later one as it was (spec Q2)", async () => {
    const sugar = await material("Sugar");
    await parameters(sugar.id);
    await order(sugar.id, "10", "2026-10-05");
    await order(sugar.id, "30", "2026-10-20");
    await run();
    const { run: runId, proposals } = await plan(sugar.id);
    expect(proposals.map(({ needDate, quantity }) => [needDate, quantity])).toEqual([["2026-10-05", "10.000000"], ["2026-10-20", "30.000000"]]);

    // The later first, then the earlier one: each in its own transaction, as two requests would.
    const later = await accept(runId, proposals[1].id);
    const earlier = await accept(runId, proposals[0].id);

    expect([earlier.document, later.document].map(({ quantity, requiredDate }) => [requiredDate, quantity])).toEqual([["2026-10-05", "10.000000"], ["2026-10-20", "30.000000"]]);
    expect((await plan(sugar.id)).proposals.map(({ document }) => document)).toEqual(["00000002", "00000001"]);
  });

  it("accepts the earlier proposal first, leaving the later one acceptable", async () => {
    const sugar = await material("Sugar");
    await parameters(sugar.id);
    await order(sugar.id, "10", "2026-10-05");
    await order(sugar.id, "30", "2026-10-20");
    await run();
    const { run: runId, proposals } = await plan(sugar.id);

    await accept(runId, proposals[0].id);

    await expect(accept(runId, proposals[1].id)).resolves.toMatchObject({ document: { quantity: "30.000000", requiredDate: "2026-10-20" } });
  });

  it("requires a Late Supply proposal on its need date, which leaves the pair's later proposal acceptable (spec Q2, Q3, #279)", async () => {
    const sugar = await material("Sugar");
    await parameters(sugar.id);
    // A 2-day lead time can't meet 2 October from 1 October: the proposal finishes on the 3rd, a day late.
    await order(sugar.id, "5", "2026-10-02");
    await order(sugar.id, "7", "2026-10-10");
    await run();
    const { run: runId, proposals } = await plan(sugar.id);
    expect(proposals.map(({ needDate, plannedFinish, lateDays }) => [needDate, plannedFinish, lateDays])).toEqual([["2026-10-02", "2026-10-03", 1], ["2026-10-10", "2026-10-10", 0]]);

    const late = await accept(runId, proposals[0].id);

    // Sizing counts a proposal from its need date (#279), and the requisition stands there too, so planning
    // again repeats the later proposal. On its planned finish it would leave the 2nd short, and MRP would
    // propose that shortage once more.
    expect(late.document).toMatchObject({ quantity: "5.000000", requiredDate: "2026-10-02" });
    expect(late.proposal).toMatchObject({ needDate: "2026-10-02", plannedFinish: "2026-10-03", lateDays: 1, document: late.document.id });
    await expect(accept(runId, proposals[1].id)).resolves.toMatchObject({ document: { quantity: "7.000000", requiredDate: "2026-10-10" } });
  });

  it("accepts the requisition a provisional parent's need drives, since the new plan repeats the same BOM choice (#282, MRP-047)", async () => {
    const jam = await material("Jam");
    const fruit = await (await scope()).cradle.materialService.create({ type: "raw", description: "Fruit", baseUnit: "kg" }, ANNA);
    await parameters(jam.id, "make");
    await parameters(fruit.id);
    await (await scope()).cradle.bomService.create(
      { output: jam.id, priority: 1, validFrom: "2026-01-01", validThrough: null, components: [{ material: fruit.id, quantity: "2", unit: "kg" }] },
      ANNA,
    );
    await order(jam.id, "12", "2026-10-08");
    await run();
    // No fruit is on hand, so Jam's proposal is provisional; its 24 kg still plan Fruit's requisition.
    expect((await plan(jam.id)).exceptions.map(({ code }) => code)).toEqual(["NO_FEASIBLE_BOM"]);
    const { run: runId, proposals: [proposal] } = await plan(fruit.id);
    expect(proposal).toMatchObject({ kind: "purchase-requisition", quantity: "24.000000", executable: true });

    await accept(runId, proposal.id);

    expect(await count("purchase_requisition")).toBe(1);
  });
});

describe("MrpAcceptanceService.accept: refusals, with nothing created", () => {
  it("rolls back the requisition and its audit entry when the write fails after the insert (R08)", async () => {
    const { material: sugar, runId, proposal } = await buyProposal();
    const create = PurchaseRequisitionService.prototype.create;
    vi.spyOn(PurchaseRequisitionService.prototype, "create").mockImplementation(async function (this: PurchaseRequisitionService, ...args) {
      await create.apply(this, args);
      throw new Error("the disk is full");
    });

    await expect(accept(runId, proposal.id)).rejects.toThrow("the disk is full");

    expect(await count("purchase_requisition")).toBe(0);
    expect(await sql("select id from tenant_audit_event where action = 'purchase-requisitions.purchase-requisition.created'")).toEqual([]);
    expect((await plan(sugar)).proposals[0].document).toBeNull();
  });


  it("refuses a proposal whose stock changed since the run as stale, naming its material and location (RUN-017)", async () => {
    const { material: sugar, runId, proposal } = await buyProposal();
    await stock(sugar, "30");

    await expect(accept(runId, proposal.id)).rejects.toMatchObject({
      code: "MRP_PROPOSAL_STALE", status: 409, message: MRP_PROPOSAL_STALE, messageParams: { material: sugar, location: PLANT },
    });
    expect(await count("purchase_requisition")).toBe(0);
    expect((await plan(sugar)).proposals[0].document).toBeNull();
  });

  it("refuses it as stale when the pair's lead time changed since the run, though its quantity didn't (E16-S02)", async () => {
    const { material: sugar, runId, proposal } = await buyProposal();
    expect(proposal).toMatchObject({ plannedFinish: "2026-10-05", beyondHorizon: false });
    // Sizing ignores the lead time, so the new plan repeats the quantity, finishing on 30 January instead: Beyond Horizon.
    await sql("update planning_parameter_set set lead_time_days = 120 where material_id = (select id from material where code = ? and tenant_code = 'prod')", [sugar]);

    await expect(accept(runId, proposal.id)).rejects.toMatchObject({ code: "MRP_PROPOSAL_STALE", status: 409, messageParams: { material: sugar, location: PLANT } });
    expect(await count("purchase_requisition")).toBe(0);
  });

  it("refuses it as stale after another open order line for the pair, or a requisition entered by hand for it (RUN-017)", async () => {
    const { material: sugar, runId, proposal } = await buyProposal();
    // One more kilogram on the need date: the proposal would now be 101.
    await order(sugar, "1", "2026-10-05");
    await expect(accept(runId, proposal.id)).rejects.toMatchObject({ code: "MRP_PROPOSAL_STALE" });

    const salt = await buyProposal("Salt");
    await (await scope()).cradle.purchaseRequisitionService.create({ material: salt.material, location: PLANT, quantity: "40", unit: "kg", requiredDate: "2026-10-03" }, ANNA);
    await expect(accept(salt.runId, salt.proposal.id)).rejects.toMatchObject({ code: "MRP_PROPOSAL_STALE" });
    expect(await count("purchase_requisition")).toBe(1);
  });

  it("refuses it as stale when the plan now proposes nothing for that day, or another document (RUN-017)", async () => {
    const { material: sugar, runId, proposal } = await buyProposal();
    await stock(sugar, "100");
    await expect(accept(runId, proposal.id)).rejects.toMatchObject({ code: "MRP_PROPOSAL_STALE", messageParams: { material: sugar, location: PLANT } });

    const salt = await buyProposal("Salt");
    const { cradle } = await scope();
    const set = (await cradle.planningParameterService.list()).find(({ material: item }) => item === salt.material)!;
    await cradle.planningParameterService.update(salt.material, PLANT, { procurement: "make" }, set.version, ANNA);
    await expect(accept(salt.runId, salt.proposal.id)).rejects.toMatchObject({ code: "MRP_PROPOSAL_STALE" });
    expect(await count("purchase_requisition")).toBe(0);
  });

  it("refuses it as stale once a requisition the run counted is cancelled (RUN-017)", async () => {
    const sugar = await material("Sugar");
    await parameters(sugar.id);
    await order(sugar.id, "100", "2026-10-05");
    const { cradle } = await scope();
    const counted = await cradle.purchaseRequisitionService.create({ material: sugar.id, location: PLANT, quantity: "40", unit: "kg", requiredDate: "2026-10-03" }, ANNA);
    await run();
    const { run: runId, proposals: [proposal] } = await plan(sugar.id);
    expect(proposal.quantity).toBe("60.000000");
    await (await scope()).cradle.purchaseRequisitionService.cancel(counted.id, counted.version, ANNA);

    await expect(accept(runId, proposal.id)).rejects.toMatchObject({ code: "MRP_PROPOSAL_STALE" });
    expect(await count("purchase_requisition")).toBe(1);
  });

  it("accepts a proposal when only something it doesn't depend on changed, such as an earlier day's new demand a new proposal would cover", async () => {
    const { material: sugar, runId, proposal } = await buyProposal();
    const other = await material("Pepper");
    await stock(other.id, "5");
    // A day earlier: planned again, it gets a proposal of its own, and 5 October's stays 100.
    await order(sugar, "1", "2026-10-04");

    await expect(accept(runId, proposal.id)).resolves.toMatchObject({ document: { quantity: "100.000000" } });
  });

  it("refuses a proposal of a superseded run as stale, and a run past the latest, or before any, as not found", async () => {
    await expect(accept("00000001", UNKNOWN)).rejects.toMatchObject({ code: "MRP_RUN_NOT_FOUND", status: 404, message: MRP_RUN_NOT_FOUND });
    const { runId, proposal } = await buyProposal();
    await expect(accept("00000002", proposal.id)).rejects.toMatchObject({ code: "MRP_RUN_NOT_FOUND" });
    await run();

    const refusal = accept(runId, proposal.id);

    await expect(refusal).rejects.toMatchObject({ code: "MRP_PROPOSAL_STALE", status: 409 });
    await expect(refusal).rejects.toHaveProperty("messageParams", undefined);
    expect(await count("purchase_requisition")).toBe(0);
  });

  it("refuses a run that started on an earlier day as stale, since its horizon has moved (spec Q7)", async () => {
    const { material: sugar, runId, proposal } = await buyProposal();
    vi.setSystemTime(new Date("2026-10-02T00:00:01.000Z"));

    await expect(accept(runId, proposal.id)).rejects.toMatchObject({ code: "MRP_PROPOSAL_STALE", messageParams: { material: sugar, location: PLANT } });
  });

  it("refuses a second accept, naming the document, and keeps exactly one (R07)", async () => {
    const { runId, proposal } = await buyProposal();
    await accept(runId, proposal.id);

    await expect(accept(runId, proposal.id, { actor: BOT })).rejects.toMatchObject({
      code: "MRP_PROPOSAL_ACCEPTED", status: 409, message: MRP_PROPOSAL_ACCEPTED, messageParams: { document: "00000001", kind: "purchase-requisition" },
    });
    expect(await count("purchase_requisition")).toBe(1);
  });

  it("doesn't find another tenant's proposal, an unknown one, or malformed IDs (RUN-022, R05)", async () => {
    const testSide = await buyProposal("Sugar", "100", "test");
    const prodSide = await buyProposal("Salt", "20");
    expect(prodSide.runId).toBe(testSide.runId);

    for (const [runId, proposalId] of [[prodSide.runId, testSide.proposal.id], [prodSide.runId, UNKNOWN], ["0", prodSide.proposal.id], ["", prodSide.proposal.id],
      ["00000001x", prodSide.proposal.id], [prodSide.runId, "not-a-uuid"], [prodSide.runId, prodSide.proposal.id.toUpperCase()]]) {
      await expect(accept(runId, proposalId)).rejects.toMatchObject({ code: "MRP_PROPOSAL_NOT_FOUND", status: 404, message: MRP_PROPOSAL_NOT_FOUND });
    }
    expect([await count("purchase_requisition"), await count("purchase_requisition", "test")]).toEqual([0, 0]);
  });

  it("refuses a Make proposal as not executable until a provisional one is stored apart from a feasible one (spec Q1, #282, #283)", async () => {
    const jam = await material("Jam");
    await parameters(jam.id, "make");
    await bom(jam.id);
    await order(jam.id, "12", "2026-10-08");
    await run();
    const { run: runId, proposals: [proposal] } = await plan(jam.id);
    expect(proposal).toMatchObject({ kind: "production-order", executable: false });

    await expect(accept(runId, proposal.id)).rejects.toMatchObject({
      code: "MRP_PROPOSAL_NOT_EXECUTABLE", status: 409, message: MRP_PROPOSAL_NOT_EXECUTABLE, messageParams: { material: jam.id, location: PLANT, kind: "production-order" },
    });
    expect(await count("production_order")).toBe(0);
  });

  it("refuses an inactive location, and a quantity more than an entry may hold, as a manual requisition would (spec Q11)", async () => {
    const pepper = await buyProposal("Pepper");
    await sql("update location set active = 0 where code = ? and tenant_code = 'prod'", [PLANT]);
    await expect(accept(pepper.runId, pepper.proposal.id)).rejects.toMatchObject({ code: "LOCATION_INACTIVE" });
    await sql("update location set active = 1 where code = ? and tenant_code = 'prod'", [PLANT]);

    // Two lines of 999,999,999,999 kg: a need no entered quantity can carry (12 integer digits, R03).
    const bulk = await material("Bulk");
    await parameters(bulk.id);
    await order(bulk.id, "999999999999", "2026-10-05");
    await order(bulk.id, "999999999999", "2026-10-05");
    await run();
    const { run: runId, proposals: [proposal] } = await plan(bulk.id);
    expect(proposal.quantity).toBe("1999999999998.000000");
    await expect(accept(runId, proposal.id)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await count("purchase_requisition")).toBe(0);
  });

  it("refuses an inactive material as a manual requisition would, leaving the proposal unaccepted (spec Q11)", async () => {
    const { material: sugar, runId, proposal } = await buyProposal();
    // The Materials screen refuses this while the order is open; the flag is set directly to reach the requisition's own refusal.
    await sql("update material set active = 0 where code = ? and tenant_code = 'prod'", [sugar]);

    await expect(accept(runId, proposal.id)).rejects.toMatchObject({ code: "MATERIAL_INACTIVE" });
    expect(await count("purchase_requisition")).toBe(0);
    expect((await plan(sugar)).proposals[0].document).toBeNull();
  });
});
