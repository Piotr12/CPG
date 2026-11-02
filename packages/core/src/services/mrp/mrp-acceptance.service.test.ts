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
import { PurchaseRequisitionService, type RequisitionView } from "../purchase-requisitions/purchase-requisition.service";
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
/** An active BOM of `output`, valid from 2026, made of a raw material of its own: a Make set may propose it (E16-S03, #280). Returns the component's code. */
async function bom(output: string) {
  const { cradle } = await scope();
  const component = await cradle.materialService.create({ type: "raw", description: `Input of ${output}`, baseUnit: "each" }, ANNA);
  await cradle.bomService.create({ output, priority: 1, validFrom: "2026-01-01", validThrough: null, components: [{ material: component.id, quantity: "1", unit: "each" }] }, ANNA);
  return component.id;
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

/** Make at the plant with lead time `leadTimeDays` and lot multiple `lotMultiple`, no minimum. */
async function makeParameters(materialId: string, { leadTimeDays = 2, lotMultiple = "1.000000" } = {}) {
  await (await scope()).cradle.planningParameterService.create(
    { material: materialId, location: PLANT, procurement: "make", leadTimeDays, minimumQuantity: "0.000000", lotMultiple },
    ANNA,
  );
}
/** One BOM of `output` made of one `component` per unit, valid from `validFrom`, at `priority`. Returns the BOM's ID. */
async function recipe(output: string, component: string, { priority = 1, validFrom = "2026-01-01" } = {}) {
  const created = await (await scope()).cradle.bomService.create(
    { output, priority, validFrom, validThrough: null, components: [{ material: component, quantity: "1", unit: "each" }] },
    ANNA,
  );
  return created.id;
}
/** A raw input with `onHand` each at the plant. */
async function input(description: string, onHand: string) {
  const { cradle } = await scope();
  const created = await cradle.materialService.create({ type: "raw", description, baseUnit: "each" }, ANNA);
  await cradle.stockService.correct({ material: created.id, location: PLANT, quantity: onHand, unit: "each", reason: "Count" }, ANNA);
  return created.id;
}
/**
 * A feasible Make proposal (#320): `description` made at the plant through one BOM of an input with enough on hand,
 * for an order of `quantity` due `needDate`, planned by a run. Returns the pair, the BOM and the plan's proposals.
 */
async function makeProposal(description: string, { quantity = "12", needDate = "2026-10-08", onHand = "1000", leadTimeDays = 2, lotMultiple = "1.000000" } = {}) {
  const made = await material(description);
  await makeParameters(made.id, { leadTimeDays, lotMultiple });
  const component = await input(`Input of ${description}`, onHand);
  const bomId = await recipe(made.id, component);
  await order(made.id, quantity, needDate);
  await run();
  const { run: runId, proposals } = await plan(made.id);
  return { material: made.id, component, bom: bomId, runId, proposals, proposal: proposals[0] };
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
      // A requisition is exploded through no BOM (#281), so it passed over none (E18-S03).
      bom: null, bomRevision: null, rejectedBoms: [],
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

    expect([earlier.document, later.document].map((document) => [(document as RequisitionView).requiredDate, document.quantity])).toEqual([["2026-10-05", "10.000000"], ["2026-10-20", "30.000000"]]);
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

  it("refuses a Make row with no BOM as not executable; a Make need no BOM can supply isn't a proposal at all (#320 Q2, #282, #283)", async () => {
    const jam = await material("Jam");
    await parameters(jam.id, "make");
    const input = await bom(jam.id);
    await order(jam.id, "12", "2026-10-08");
    await run();
    // No input on hand: the production is a provisional action, with no ID to accept (E17-S03).
    const provisional = await plan(jam.id);
    expect(provisional.proposals).toEqual([]);
    expect(provisional.provisional).toEqual([expect.objectContaining({ kind: "production-order", quantity: "12.000000", blockers: ["no-feasible-bom"] })]);
    expect(provisional.provisional[0]).not.toHaveProperty("id");
    await (await scope()).cradle.stockService.correct({ material: input, location: PLANT, quantity: "12", unit: "each", reason: "Count" }, ANNA);
    await run();
    // As an image older than E17-S01 stores a Make proposal: with no BOM to pin.
    await sql("update mrp_recommendation set bom = null, bom_revision = null where material = ?", [jam.id]);
    const { run: runId, proposals: [proposal] } = await plan(jam.id);
    expect(proposal).toMatchObject({ kind: "production-order", executable: false, bom: null });

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

describe("MrpAcceptanceService.accept: Make proposals (#320)", () => {
  it("turns a feasible Make proposal into one Open production order pinned to its BOM revision, finishing on the need date, tagged with the run, moving no stock (RUN-006)", async () => {
    const { material: jam, bom: bomId, runId, proposal } = await makeProposal("Jam");
    expect(proposal).toMatchObject({ kind: "production-order", needDate: "2026-10-08", quantity: "12.000000", bom: bomId, bomRevision: 1, executable: true, document: null });
    const movements = await count("stock_movement");

    const accepted = await accept(runId, proposal.id);

    expect(accepted.document).toMatchObject({
      id: "00000001", output: jam, location: PLANT, bom: bomId, revision: 1, quantity: "12.000000", enteredQuantity: "12", enteredUnit: "kg",
      numerator: "1", denominator: "1", plannedFinish: "2026-10-08", plannedStart: "2026-10-06", leadTimeDays: 2,
      produced: "0.000000", status: "open", mrpRun: runId,
    });
    expect(accepted.proposal).toEqual({
      id: proposal.id, run: runId, material: jam, location: PLANT, kind: "production-order", needDate: "2026-10-08", quantity: "12.000000",
      plannedStart: "2026-10-06", plannedFinish: "2026-10-08", lateDays: 0, beyondHorizon: false, executable: true, document: "00000001",
      bom: bomId, bomRevision: 1, rejectedBoms: [],
    });
    expect(await count("production_order")).toBe(1);
    expect(await count("stock_movement")).toBe(movements);
    expect(await count("production_completion")).toBe(0);
    expect((await plan(jam)).proposals[0].document).toBe("00000001");
    expect(await (await scope()).cradle.productionOrderService.get("00000001")).toMatchObject({ mrpRun: runId, bom: bomId, revision: 1 });
  });

  it("creates the order for the proposal's lot-rounded quantity (R03)", async () => {
    const { runId, proposal } = await makeProposal("Syrup", { quantity: "37", lotMultiple: "50.000000" });
    expect(proposal.quantity).toBe("50.000000");

    await expect(accept(runId, proposal.id)).resolves.toMatchObject({ document: { quantity: "50.000000", enteredQuantity: "50" } });
  });

  it("records the creation with the run, the account, the session and the channel, and a refused accept records nothing (R08)", async () => {
    const { runId, proposal } = await makeProposal("Jam");
    const entries = await count("tenant_audit_event");

    const { document } = await accept(runId, proposal.id, { actor: BOT });
    await expect(accept(runId, proposal.id)).rejects.toMatchObject({ code: "MRP_PROPOSAL_ACCEPTED" });

    const created = await sql<{ after: string }>(
      "select action, after, actor_username, session_id, channel, token_name from tenant_audit_event where subject_type = 'ProductionOrder' and subject_id = ?", [document.id]);
    expect(created).toEqual([{
      action: "production-orders.production-order.created", actor_username: "bot", session_id: null, channel: "api", token_name: "planner", after: expect.any(String),
    }]);
    expect(JSON.parse(created[0].after)).toMatchObject({ id: document.id, mrpRun: runId, bom: proposal.bom, revision: 1 });
    expect(await count("tenant_audit_event")).toBe(entries + 1);
  });

  it("refuses a second accept naming the production order, and keeps exactly one (R07)", async () => {
    const { runId, proposal } = await makeProposal("Jam");
    await accept(runId, proposal.id);

    await expect(accept(runId, proposal.id)).rejects.toMatchObject({
      code: "MRP_PROPOSAL_ACCEPTED", status: 409, message: MRP_PROPOSAL_ACCEPTED, messageParams: { document: "00000001", kind: "production-order" },
    });
    expect(await count("production_order")).toBe(1);
  });

  it("refuses it as stale when the BOM has a new current revision since the run, creating nothing (RUN-017, spec Q3)", async () => {
    const { material: jam, bom: bomId, runId, proposal } = await makeProposal("Jam");
    const { cradle } = await scope();
    const current = await cradle.bomService.get(bomId);
    await cradle.bomService.update(bomId, { validFrom: "2025-01-01" }, current.version, ANNA);

    await expect(accept(runId, proposal.id)).rejects.toMatchObject({
      code: "MRP_PROPOSAL_STALE", status: 409, message: MRP_PROPOSAL_STALE, messageParams: { material: jam, location: PLANT },
    });
    expect(await count("production_order")).toBe(0);
    // Planned again, the same pair now proposes revision 2, and that one is accepted.
    await run();
    const fresh = await plan(jam);
    expect(fresh.proposals[0]).toMatchObject({ bom: bomId, bomRevision: 2 });
    await expect(accept(fresh.run, fresh.proposals[0].id)).resolves.toMatchObject({ document: { bom: bomId, revision: 2 } });
  });

  it("refuses it as stale when another BOM is now chosen, or the pair turned to Buy (RUN-017, spec Q3)", async () => {
    const jam = await makeProposal("Jam");
    // A higher-priority BOM, feasible from stock: the fresh plan chooses it instead.
    const other = await input("Other input", "1000");
    const { cradle } = await scope();
    const first = await cradle.bomService.get(jam.bom);
    await cradle.bomService.update(jam.bom, { priority: 2 }, first.version, ANNA);
    await recipe(jam.material, other, { priority: 1 });
    await expect(accept(jam.runId, jam.proposal.id)).rejects.toMatchObject({ code: "MRP_PROPOSAL_STALE" });

    const tea = await makeProposal("Tea");
    const set = (await cradle.planningParameterService.list()).find(({ material: item }) => item === tea.material)!;
    await cradle.planningParameterService.update(tea.material, PLANT, { procurement: "buy" }, set.version, ANNA);
    await expect(accept(tea.runId, tea.proposal.id)).rejects.toMatchObject({ code: "MRP_PROPOSAL_STALE" });
    expect(await count("production_order")).toBe(0);
  });

  it("refuses an on-time proposal as stale when the pair's lead time changed, though its finish didn't, since the order's start would (spec Q3)", async () => {
    const { material: jam, runId, proposal } = await makeProposal("Jam");
    expect(proposal).toMatchObject({ plannedStart: "2026-10-06", plannedFinish: "2026-10-08", lateDays: 0 });
    const { cradle } = await scope();
    const set = (await cradle.planningParameterService.list()).find(({ material: item }) => item === jam)!;
    await cradle.planningParameterService.update(jam, PLANT, { leadTimeDays: 3 }, set.version, ANNA);

    await expect(accept(runId, proposal.id)).rejects.toMatchObject({ code: "MRP_PROPOSAL_STALE" });
    expect(await count("production_order")).toBe(0);
  });

  it("accepts a proposal when a BOM edit left the choice and its revision as they were", async () => {
    const { bom: bomId, runId, proposal } = await makeProposal("Jam");
    const { cradle } = await scope();
    // A second BOM of lower priority adds a choice MRP doesn't make.
    const spare = await input("Spare input", "1000");
    const jam = (await cradle.bomService.get(bomId)).output;
    await recipe(jam, spare, { priority: 2 });

    await expect(accept(runId, proposal.id)).resolves.toMatchObject({ document: { bom: bomId, revision: 1 } });
  });

  it("finishes a Late Supply proposal's order on its need date, starting before today, and leaves the pair's later proposal acceptable (spec Q1)", async () => {
    const jam = await makeProposal("Jam", { needDate: "2026-10-02", leadTimeDays: 4 });
    await order(jam.material, "8", "2026-10-20");
    await run();
    const { run: runId, proposals: [late, later] } = await plan(jam.material);
    expect(late).toMatchObject({ needDate: "2026-10-02", plannedStart: "2026-10-01", plannedFinish: "2026-10-05", lateDays: 3 });
    expect(later).toMatchObject({ needDate: "2026-10-20", quantity: "8.000000" });

    await expect(accept(runId, late.id)).resolves.toMatchObject({ document: { plannedFinish: "2026-10-02", plannedStart: "2026-09-28", leadTimeDays: 4 } });
    await expect(accept(runId, later.id)).resolves.toMatchObject({ document: { plannedFinish: "2026-10-20", quantity: "8.000000" } });
    expect(await count("production_order")).toBe(2);
  });

  it("refuses a Late Supply proposal whose BOM is valid on its late finish but not yet on its need date, as the production-order service judges it there (spec Q6)", async () => {
    const jam = await material("Jam");
    await makeParameters(jam.id, { leadTimeDays: 5 });
    const component = await input("Input of Jam", "1000");
    await recipe(jam.id, component, { validFrom: "2026-10-04" });
    await order(jam.id, "12", "2026-10-02");
    await run();
    const { run: runId, proposals: [proposal] } = await plan(jam.id);
    expect(proposal).toMatchObject({ needDate: "2026-10-02", plannedFinish: "2026-10-06", bomRevision: 1 });

    await expect(accept(runId, proposal.id)).rejects.toMatchObject({ code: "PRODUCTION_NO_USABLE_BOM" });
    expect(await count("production_order")).toBe(0);
    expect((await plan(jam.id)).proposals[0].document).toBeNull();
  });

  it("leaves a parent's component proposal acceptable after accepting the parent, and the parent after accepting the component first (spec Q7)", async () => {
    const accepted = async (first: "parent" | "component") => {
      const jam = await makeProposal(`Jam ${first}`, { onHand: "12" });
      // The input's own need, a safety target of 5 it falls below once the parent consumes its 12 on hand: a
      // requisition the parent's production leaves as it was. A target is no demand, so the parent stays feasible.
      const { cradle } = await scope();
      await cradle.planningParameterService.create(
        { material: jam.component, location: PLANT, procurement: "buy", leadTimeDays: 2, minimumQuantity: "0.000000", lotMultiple: "1.000000" },
        ANNA,
      );
      await cradle.safetyStockTargetService.create({ material: jam.component, location: PLANT, effectiveFrom: "2026-09-01", quantity: "5" }, ANNA);
      await run();
      const parent = await plan(jam.material);
      const component = await plan(jam.component);
      expect(parent.proposals).toEqual([expect.objectContaining({ kind: "production-order", quantity: "12.000000", executable: true })]);
      expect(component.proposals).toEqual([expect.objectContaining({ kind: "purchase-requisition", needDate: "2026-10-06", quantity: "5.000000" })]);
      const order1 = first === "parent" ? parent.proposals[0] : component.proposals[0];
      const order2 = first === "parent" ? component.proposals[0] : parent.proposals[0];
      await accept(parent.run, order1.id);
      return accept(parent.run, order2.id);
    };

    await expect(accepted("parent")).resolves.toMatchObject({ proposal: { kind: "purchase-requisition", quantity: "5.000000" } });
    await expect(accepted("component")).resolves.toMatchObject({ proposal: { kind: "production-order", quantity: "12.000000" } });
  });

  it("accepts two parents sharing an input in either order: an accepted order claims what its proposal claimed (spec Q7)", async () => {
    const shared = async (first: "earlier" | "later") => {
      const component = await input(`Shared ${first}`, "24");
      const [jam, tea] = [await material(`Jam ${first}`), await material(`Tea ${first}`)];
      for (const made of [jam, tea]) {
        await makeParameters(made.id);
        await recipe(made.id, component);
      }
      await order(jam.id, "12", "2026-10-08");
      await order(tea.id, "12", "2026-10-10");
      await run();
      const [earlier, later] = [await plan(jam.id), await plan(tea.id)];
      expect([earlier.proposals, later.proposals]).toEqual([[expect.objectContaining({ executable: true })], [expect.objectContaining({ executable: true })]]);
      const [one, two] = first === "earlier" ? [earlier, later] : [later, earlier];
      await accept(one.run, one.proposals[0].id);
      return accept(two.run, two.proposals[0].id);
    };

    await expect(shared("earlier")).resolves.toMatchObject({ document: { quantity: "12.000000", plannedFinish: "2026-10-10" } });
    await expect(shared("later")).resolves.toMatchObject({ document: { quantity: "12.000000", plannedFinish: "2026-10-08" } });
  });

  it("doesn't find a Test Make proposal under Prod's latest run (RUN-022, R05)", async () => {
    const { runId, proposal } = await makeProposal("Jam");
    await run("test");

    await expect(accept(runId, proposal.id, { tenant: "test" })).rejects.toMatchObject({ code: "MRP_PROPOSAL_NOT_FOUND", status: 404, message: MRP_PROPOSAL_NOT_FOUND });
    expect([await count("production_order"), await count("production_order", "test")]).toEqual([0, 0]);
  });
});

describe("MrpAcceptanceService and MrpRunService: reruns (E19-S02)", () => {
  /** A run's proposals without their IDs, which every run draws afresh (spec Q8). */
  const without = (proposals: readonly MrpPlanView["proposals"][number][]) => proposals.map((proposal) => ({ ...proposal, id: undefined }));
  /** A Make material at the plant whose BOM needs 1 of a stocked raw material per kg, exact lots. Returns the output, its BOM and the component. */
  async function makeable(description: string) {
    const output = await material(description);
    const { cradle } = await scope();
    const component = await cradle.materialService.create({ type: "raw", description: `Input of ${description}`, baseUnit: "each" }, ANNA);
    await cradle.stockService.correct({ material: component.id, location: PLANT, quantity: "500", unit: "each", reason: "Count" }, ANNA);
    const bom = await cradle.bomService.create({ output: output.id, priority: 1, validFrom: "2026-01-01", validThrough: null, components: [{ material: component.id, quantity: "1", unit: "each" }] }, ANNA);
    await cradle.planningParameterService.create({ material: output.id, location: PLANT, procurement: "make", leadTimeDays: 2, minimumQuantity: "0.000000", lotMultiple: "0.000001" }, ANNA);
    await cradle.planningParameterService.create({ material: component.id, location: PLANT, procurement: "buy", leadTimeDays: 2, minimumQuantity: "0.000000", lotMultiple: "0.000001" }, ANNA);
    return { output: output.id, bom: bom.id, component: component.id };
  }
  /** An Open production order of 100 kg finishing on 12 October, as the production dialog creates it. */
  async function produce(output: string, bom: string) {
    const { cradle } = await scope();
    return inRequestTransaction(cradle.em, () => cradle.productionOrderService.create({ output, location: PLANT, quantity: "100", unit: "kg", plannedFinish: "2026-10-12", bom, revision: 1 }, ANNA));
  }
  const productionOrder = async (id: string) => {
    const { quantity, plannedStart, plannedFinish, status, version } = await (await scope()).cradle.productionOrderService.get(id);
    return { quantity, plannedStart, plannedFinish, status, version };
  };
  const audits = async () => sql<{ action: string; subject_type: string }>("select action, subject_type from tenant_audit_event where tenant_code = 'prod' order by rowid");

  it("RUN-008, RUN-012: a requisition accepted from run 1 stays Open and tagged with run 1, and run 2 nets it, proposing nothing more for its pair", async () => {
    const { material: sugar, runId, proposal } = await buyProposal();
    const { document } = await accept(runId, proposal.id);

    const rerun = await run();

    expect(rerun.id).toBe("00000002");
    const after = await plan(sugar);
    expect(after.run).toBe("00000002");
    expect(after.proposals).toEqual([]);
    expect(after.buckets.find(({ date }) => date === "2026-10-05")).toMatchObject({ tentativeSupply: "100.000000", projectedBefore: "0.000000" });
    expect(after.excess).toBe("0.000000");
    expect(await count("purchase_requisition")).toBe(1);
    expect(await (await scope()).cradle.purchaseRequisitionService.get(document.id)).toMatchObject({ status: "open", quantity: "100.000000", mrpRun: "00000001", version: document.version });
  });

  it("RUN-011: run 2 replaces run 1's unaccepted proposals with its own, and accepting run 1's is refused as stale, creating nothing", async () => {
    const { material: sugar, runId, proposal } = await buyProposal();

    await run();

    const report = await (await scope()).cradle.mrpRunService.latest({});
    expect(report.run).toMatchObject({ id: "00000002", createdAt: expect.any(Date), startDate: "2026-10-01" });
    const { proposals } = await plan(sugar);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].id).not.toBe(proposal.id);
    expect(await count("mrp_recommendation")).toBe(1);
    await expect(accept(runId, proposal.id)).rejects.toMatchObject({ code: "MRP_PROPOSAL_STALE", status: 409, message: MRP_PROPOSAL_STALE });
    expect(await count("purchase_requisition")).toBe(0);
  });

  it("an accepted lot-rounded proposal shows its rounding as excess on the next run, with nothing else changed (spec Q1)", async () => {
    const pepper = await material("Pepper");
    await (await scope()).cradle.planningParameterService.create({ material: pepper.id, location: PLANT, procurement: "buy", leadTimeDays: 2, minimumQuantity: "0.000000", lotMultiple: "25.000000" }, ANNA);
    await order(pepper.id, "20", "2026-10-05");
    await run();
    const first = await plan(pepper.id);
    expect(first.proposals.map(({ quantity }) => quantity)).toEqual(["25.000000"]);
    expect(first.excess).toBe("0.000000");

    await accept(first.run, first.proposals[0].id);
    await run();

    const second = await plan(pepper.id);
    expect(second.proposals).toEqual([]);
    expect(second.excess).toBe("5.000000");
  });

  it("RUN-010: an Open production order of 100 against demand now 80 is left as it was, and the read shows an excess of 20", async () => {
    const { output, bom } = await makeable("Cabinet");
    const order100 = await produce(output, bom);
    await order(output, "80", "2026-10-20");
    const before = await productionOrder(order100.id);

    await run();
    await run();

    const report = await plan(output);
    expect(report.proposals).toEqual([]);
    expect(report.excess).toBe("20.000000");
    expect(await productionOrder(order100.id)).toEqual(before);
    expect(before).toMatchObject({ quantity: "100.000000", plannedFinish: "2026-10-12", status: "open" });
  });

  it("RUN-013, R10: a rerun leaves an Open purchase-order line and production order as they were when new demand wants more and earlier, proposes the rest, and audits only the run", async () => {
    const { output, bom } = await makeable("Shelf");
    const order100 = await produce(output, bom);
    const sugar = await material("Sugar");
    await parameters(sugar.id);
    const { cradle } = await scope();
    await cradle.supplierService.create({ name: "Mill" }, ANNA);
    const po = await cradle.purchaseOrderService.create({ supplier: "00000001", location: PLANT, lines: [{ material: sugar.id, quantity: "40", unit: "kg", plannedDate: "2026-10-15" }] }, ANNA);
    await run();
    const [orderBefore, poBefore] = [await productionOrder(order100.id), await (await scope()).cradle.purchaseOrderService.get(po.id)];
    // More, and earlier, than either document brings.
    await order(output, "130", "2026-10-08");
    await order(sugar.id, "70", "2026-10-06");
    const audited = (await audits()).length;

    await run();

    expect(await productionOrder(order100.id)).toEqual(orderBefore);
    expect(await (await scope()).cradle.purchaseOrderService.get(po.id)).toEqual(poBefore);
    expect((await plan(output)).proposals.map(({ kind, needDate, quantity }) => ({ kind, needDate, quantity }))).toEqual([
      { kind: "production-order", needDate: "2026-10-08", quantity: "130.000000" },
    ]);
    expect((await plan(sugar.id)).proposals.map(({ kind, needDate, quantity }) => ({ kind, needDate, quantity }))).toEqual([
      { kind: "purchase-requisition", needDate: "2026-10-06", quantity: "70.000000" },
    ]);
    expect((await audits()).slice(audited)).toEqual([{ action: "mrp.mrp-run.created", subject_type: "MrpRun" }]);
  });

  it("gives identical proposals, in the same order, from two reruns over unchanged data, apart from their new IDs (spec Q8)", async () => {
    const { output, bom } = await makeable("Desk");
    await produce(output, bom);
    await order(output, "120", "2026-10-20");
    const salt = await material("Salt");
    await parameters(salt.id);
    await order(salt.id, "7", "2026-10-03");
    await order(salt.id, "9", "2026-10-09");
    await run();
    const first = (await (await scope()).cradle.mrpRunService.latest({})).plans;

    await run();

    const second = (await (await scope()).cradle.mrpRunService.latest({})).plans;
    const proposals = (plans: readonly MrpPlanView[]) => plans.flatMap((each) => without(each.proposals).map((proposal) => ({ material: each.material, ...proposal })));
    expect(proposals(first).length).toBeGreaterThanOrEqual(3);
    expect(proposals(second)).toEqual(proposals(first));
    const idsOf = (plans: readonly MrpPlanView[]) => plans.flatMap((each) => each.proposals.map(({ id }) => id));
    expect(idsOf(second).filter((id) => idsOf(first).includes(id))).toEqual([]);
  });
});
