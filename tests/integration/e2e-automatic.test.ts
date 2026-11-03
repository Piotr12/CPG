import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MrpPlanView } from "@cpg/core";
import { untilOk } from "./api";
import { day, firstOfNextMonth, journeyAccounts, openMrp, runOnScreen, shown, supplyOf, withinOneDay } from "./journeys";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

/** A material's supply documents before any step. */
const NONE = { requisitions: 0, purchaseOrderLines: 0, productionOrders: 0, receipts: 0, completions: 0 };

/** A provisional level's buckets hold no supply of any kind: MRP never assumes its output (E2E-021). */
const noSupply = (plan: MrpPlanView) =>
  plan.buckets.every(({ tentativeSupply, dependableSupply, proposedReceipts }) => [tentativeSupply, dependableSupply, proposedReceipts].every((figure) => figure === "0.000000"));

// Journeys with automatic runs (spec 2026-11-03--0626UTC-mrp-end-to-end-journeys): an automatic run's requisition is
// left alone when its forecast falls (E2E-005), and a three-level chain gets only its raw requisition until each level
// below is on hand (E2E-021). An automatic run creates a document for every executable proposal of the tenant, other
// files' materials included, so these run in Test, reset to its startup dataset before and after (spec Q2), and assert
// only on their own materials. Each journey's first automatic run goes through the Run MRP dialog: that run is the
// acceptance (spec Q4). Every request and answer is checked for finance fields (UX-023).
describe("automatic journeys: a falling forecast and a provisional hierarchy", () => {
  // This file's own account and token: other files share the app, and users are never deleted.
  const accounts = journeyAccounts(baseUrl, adminPassword, "e2eau", "test");
  const { masters, user } = accounts;

  /** Back to Test's startup dataset: removes every document this file's batches created, other materials' included. */
  const resetTest = () => untilOk("reset Test", () => masters.call("POST", "/reset", {}));
  // Registered after the accounts' hooks: `beforeAll` runs after their sign-ins, `afterAll` before their token is revoked.
  beforeAll(resetTest);
  afterAll(resetTest);

  /** A material of the journey's own with planning parameters at `location`: Buy or Make, a 2-day lead time, no lot rule. */
  async function material(name: string, type: "raw" | "intermediate" | "finished", procurement: "buy" | "make", location: string) {
    const id = (await masters.post("/materials", { type, description: `e2eau ${name}`, baseUnit: "kg" })).id as string;
    await masters.post("/planning-parameters", { material: id, location, procurement, leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" });
    return id;
  }

  it("E2E-005: a forecast cut from 100 to 70 after automatic run 1 created its requisition of 100: automatic run 2 creates nothing, leaves the requisition as it was, and shows 30 excess", () => withinOneDay(async () => {
    const location = (await masters.post("/locations", { name: "e2eau E2E-005 plant" })).id as string;
    const item = await material("E2E-005 M", "raw", "buy", location);
    // Mid next month: inside the horizon and past the lead time whatever today is; with no customer orders, all of a
    // forecast is demand (D08, spec Q6).
    const date = `${firstOfNextMonth().slice(0, 8)}15`;
    // Forecasts are the admin's to write.
    const forecast = await masters.post("/forecasts", { material: item, location, date, quantity: "100" });

    // Automatic run 1, chosen in the Run MRP dialog: the run itself creates the requisition of 100, tagged with it.
    const first = await runOnScreen(accounts.ola, baseUrl, "test", { material: item, location }, "automatic");
    const run1 = await user.plan(item, location);
    expect(run1.run).toMatchObject({ id: first, mode: "automatic", channel: "ui", creation: { status: "created" } });
    expect(run1.proposals).toEqual([expect.objectContaining({ kind: "purchase-requisition", quantity: "100.000000", executable: true, document: expect.any(String) })]);
    const requisitionId = run1.proposals[0].document!;
    const requisition = await user.get(`/purchase-requisitions/${requisitionId}`);
    expect(requisition).toMatchObject({ material: item, location, quantity: "100.000000", requiredDate: run1.proposals[0].needDate, status: "open", mrpRun: first });
    // The screen links the proposal to the document the run created.
    await accounts.ola.waitUntil(`Boolean(${shown("main [data-mrp-document]")})`);
    expect(await accounts.ola.evaluate<string>(`${shown("main [data-mrp-document]")}.textContent`)).toMatch(new RegExp(`${requisitionId}$`));
    const supply = { ...NONE, requisitions: 1 };
    expect(await supplyOf(user, item, location)).toEqual(supply);

    // The forecast falls to 70, and automatic run 2 follows.
    expect(await masters.patch(`/forecasts/${item}/${location}/${date}`, { quantity: "70", version: forecast.version })).toMatchObject({ quantity: "70.000000" });
    const second = await user.run("automatic");
    expect(second.creation).toMatchObject({ status: "created" });

    // No new document for M, and the requisition is untouched: MRP never reduces or cancels a document (R10).
    const run2 = await user.plan(item, location);
    expect(run2.run.id).toBe(second.id);
    expect(run2.proposals).toEqual([]);
    expect(await supplyOf(user, item, location)).toEqual(supply);
    const after = await user.get(`/purchase-requisitions/${requisitionId}`);
    expect([after.quantity, after.requiredDate, after.version]).toEqual([requisition.quantity, requisition.requiredDate, requisition.version]);
    expect(after).toEqual(requisition);
    // The 30 the requisition brings beyond the forecast is stated as excess, through the API and on the screen.
    expect(run2.excess).toBe("30.000000");
    await openMrp(accounts.ola, baseUrl, "test", { material: item, location });
    await accounts.ola.waitUntil(`(${shown("main [data-mrp-field=id]")}?.textContent ?? "") === ${JSON.stringify(second.id)} && Boolean(${shown("main [data-mrp-excess]")})`);
    expect(await accounts.ola.evaluate<string>(`${shown("main [data-mrp-excess]")}.textContent`)).toMatch(/^Excess: 30 kg of open supply /);
  }));

  /** R's supply documents once its requisition is ordered and received. */
  const RECEIVED = { ...NONE, requisitions: 1, purchaseOrderLines: 1, receipts: 1 };

  /**
   * E2E-021's chain: F ← I ← R, nothing on hand, R bought, and a customer order for 10 F due `day(14)`. Automatic
   * run 1 (on the screen when `onScreen`) creates R's requisition and nothing else for the chain; `receiveAndRerun`
   * then takes it to automatic run 2.
   */
  async function hierarchy(name: string, onScreen: boolean) {
    const location = (await masters.post("/locations", { name: `e2eau ${name} plant` })).id as string;
    const supplier = (await masters.post("/suppliers", { name: `e2eau ${name} supplier` })).id as string;
    const customer = (await masters.post("/customers", { name: `e2eau ${name} retail` })).id as string;
    const raw = await material(`${name} R`, "raw", "buy", location);
    const intermediate = await material(`${name} I`, "intermediate", "make", location);
    const finished = await material(`${name} F`, "finished", "make", location);
    const bom = async (output: string, component: string, quantity: string) =>
      (await masters.post("/boms", { output, priority: 1, validFrom: day(-30), validThrough: null, components: [{ material: component, quantity, unit: "kg" }] })).id as string;
    const iBom = await bom(intermediate, raw, "2");
    const fBom = await bom(finished, intermediate, "1");
    await user.post("/customer-orders", { customer, location, lines: [{ material: finished, quantity: "10", unit: "kg", requiredDate: day(14) }] });
    const supply = async () => ({ R: await supplyOf(user, raw, location), I: await supplyOf(user, intermediate, location), F: await supplyOf(user, finished, location) });
    const plans = async () => ({ R: await user.plan(raw, location), I: await user.plan(intermediate, location), F: await user.plan(finished, location) });

    const first = onScreen ? await runOnScreen(accounts.ola, baseUrl, "test", { material: raw, location }, "automatic") : (await user.run("automatic")).id;
    const run1 = await plans();
    expect(run1.R.run).toMatchObject({ id: first, mode: "automatic", channel: onScreen ? "ui" : "api", creation: { status: "created" } });
    const requisition = run1.R.proposals[0]?.document;
    expect(await supply()).toEqual({ R: { ...NONE, requisitions: 1 }, I: NONE, F: NONE });

    /** R is ordered from that requisition and received in full, and automatic run 2 follows through the API. */
    const receiveAndRerun = async () => {
      const order = await user.post("/purchase-orders", { supplier, location, lines: [{ material: raw, quantity: "20", unit: "kg", plannedDate: day(4), requisition }] });
      await user.post("/goods-receipts", { purchaseOrder: order.id, lines: [{ line: 1, quantity: "20", unit: "kg" }] });
      expect((await supply()).R).toEqual(RECEIVED);
      const second = await user.run("automatic");
      expect(second.creation).toMatchObject({ status: "created" });
      return plans();
    };
    return { location, raw, intermediate, finished, iBom, fBom, first, requisition, supply, plans, run1, receiveAndRerun };
  }

  it("E2E-021: automatic runs create only R's requisition while F and I are provisional, shown with dates, components and shortages, and F's production order once I is on hand", () => withinOneDay(async () => {
    const { location, raw, intermediate, finished, iBom, fBom, first, requisition, supply, plans, run1, receiveAndRerun } = await hierarchy("E2E-021", true);

    // Run 1: R's requisition is the hierarchy's only proposal, created by the run; F and I are provisional, with no
    // production order and no supply in any bucket (MRP-047).
    expect(run1.R.proposals).toEqual([expect.objectContaining({ kind: "purchase-requisition", needDate: day(10), plannedStart: day(8), quantity: "20.000000", executable: true, document: requisition })]);
    expect(await user.get(`/purchase-requisitions/${requisition}`)).toMatchObject({ material: raw, location, quantity: "20.000000", requiredDate: day(10), mrpRun: first });
    expect([run1.I.proposals, run1.F.proposals]).toEqual([[], []]);
    expect(run1.F.provisional).toEqual([expect.objectContaining({
      kind: "production-order", needDate: day(14), quantity: "10.000000", plannedStart: day(12), plannedFinish: day(14), bom: fBom, bomRevision: 1,
      components: [{ material: intermediate, quantity: "10.000000" }], missing: `${fBom}/1: ${intermediate} 10.000000 0.000000 10.000000`,
    })]);
    expect(run1.I.provisional).toEqual([expect.objectContaining({
      kind: "production-order", needDate: day(12), quantity: "10.000000", plannedStart: day(10), plannedFinish: day(12), bom: iBom, bomRevision: 1,
      components: [{ material: raw, quantity: "20.000000" }], missing: `${iBom}/1: ${raw} 20.000000 0.000000 20.000000`,
    })]);
    for (const [level, plan] of [["I", run1.I], ["F", run1.F]] as const) expect(noSupply(plan), `${level} holds no supply`).toBe(true);

    // The screen shows the same provisional F and I, with their dates, components and shortages, and nothing to accept.
    const ola = accounts.ola;
    await ola.open(`${baseUrl}/admin/test/mrp?location=${location}`);
    await ola.waitUntil(`(${shown("main [data-mrp-field=id]")}?.textContent ?? "") === ${JSON.stringify(first)} && Boolean(${shown("main [data-mrp-provisional]")})`);
    const why = "main [data-mrp-provisional] [data-mrp-why-bom] button";
    await ola.waitUntil(`[...document.querySelectorAll(${JSON.stringify(why)})].filter((e) => !e.closest("[hidden]") && e.offsetParent !== null && Object.keys(e).some((key) => key.startsWith("__reactFiber"))).length === 2`);
    for (const index of [0, 1]) {
      await ola.evaluate(`[...document.querySelectorAll(${JSON.stringify(why)})].filter((e) => !e.closest("[hidden]") && e.offsetParent !== null)[${index}].click()`);
    }
    await ola.waitUntil(`${shown("main [data-mrp-provisional]")}.querySelectorAll("[data-mrp-shortage]").length === 2`);
    const screen = await ola.evaluate<{ rows: { pair: string; text: string }[]; components: string[]; shortages: string[]; accept: number }>(`(() => {
      const section = ${shown("main [data-mrp-provisional]")};
      return {
        rows: [...section.querySelectorAll("tbody tr")].map((row) => ({ pair: row.cells[0].textContent, text: row.textContent })),
        components: [...section.querySelectorAll("[data-mrp-provisional-component]")].map((item) => item.textContent),
        shortages: [...section.querySelectorAll("[data-mrp-shortage]")].map((item) => item.textContent),
        accept: section.querySelectorAll("[data-mrp-accept]").length,
      };
    })()`);
    expect(screen.rows).toHaveLength(2);
    const rowOf = (pair: string) => screen.rows.find((row) => row.pair.includes(pair))?.text ?? "";
    for (const [pair, need, start] of [[`${finished} e2eau E2E-021 F`, day(14), day(12)], [`${intermediate} e2eau E2E-021 I`, day(12), day(10)]]) {
      expect(rowOf(pair), pair).toMatch(/^Provisional/);
      expect(rowOf(pair), pair).toContain(`${need}start ${start} · finish ${need}`);
    }
    expect(screen.components.sort()).toEqual([`${intermediate} e2eau E2E-021 I 10 kg`, `${raw} e2eau E2E-021 R 20 kg`].sort());
    expect(screen.shortages.sort()).toEqual([
      `${intermediate} e2eau E2E-021 I: needs 10 kg, dependable 0 kg, short 10 kg`,
      `${raw} e2eau E2E-021 R: needs 20 kg, dependable 0 kg, short 20 kg`,
    ].sort());
    expect(screen.accept).toBe(0);

    // Run 2, after R's receipt: R needs nothing more, and I's production order, executable from the R on hand, is
    // created, since making I is what lets F run (#369). F, whose input I is not on hand, is still provisional with
    // no production order.
    const run2 = await receiveAndRerun();
    expect(run2.R.proposals).toEqual([]);
    expect(run2.I.provisional).toEqual([]);
    expect(run2.I.proposals).toEqual([expect.objectContaining({ kind: "production-order", quantity: "10.000000", bom: iBom, bomRevision: 1, executable: true, document: expect.any(String) })]);
    const iOrder = run2.I.proposals[0].document!;
    expect(await user.get(`/production-orders/${iOrder}`)).toMatchObject({ output: intermediate, location, bom: iBom, revision: 1, quantity: "10.000000", status: "open", mrpRun: run2.I.run.id });
    expect(run2.F.proposals).toEqual([]);
    expect(run2.F.provisional).toEqual([expect.objectContaining({ quantity: "10.000000", bom: fBom, blockers: ["no-feasible-bom"] })]);
    expect(noSupply(run2.F), "F holds no supply").toBe(true);
    expect((await supply()).F).toEqual(NONE);

    // I's production order is completed from the R on hand.
    await user.post(`/production-orders/${iOrder}/completions`, { quantity: "10", unit: "kg", components: [{ material: raw, quantity: "20", unit: "kg" }] });
    const made = { R: RECEIVED, I: { ...NONE, productionOrders: 1, completions: 1 }, F: NONE };
    expect(await supply()).toEqual(made);

    // Run 3: with I on hand, F is executable, and the automatic run creates its production order, tagged with the run.
    const third = await user.run("automatic");
    const run3 = await plans();
    expect([run3.R.proposals, run3.I.proposals, run3.I.provisional, run3.F.provisional]).toEqual([[], [], [], []]);
    expect(run3.F.proposals).toEqual([expect.objectContaining({ kind: "production-order", quantity: "10.000000", bom: fBom, bomRevision: 1, executable: true, document: expect.any(String) })]);
    const fOrder = run3.F.proposals[0].document!;
    expect(third.documents).toContainEqual({ proposal: run3.F.proposals[0].id, kind: "production-order", id: fOrder });
    expect(await user.get(`/production-orders/${fOrder}`)).toMatchObject({ output: finished, location, bom: fBom, revision: 1, quantity: "10.000000", status: "open", mrpRun: third.id });
    const done = { ...made, F: { ...NONE, productionOrders: 1 } };
    expect(await supply()).toEqual(done);

    // Run 4: the order covers F's demand, so another automatic run adds no document to the hierarchy.
    const fourth = await user.run("automatic");
    expect(fourth.creation).toMatchObject({ status: "created" });
    expect(await supply()).toEqual(done);
  }));

  it("UX-023: every request and answer of these journeys carried no price, cost, currency, invoice, tax, payment or accounting field", () => {
    // journeyApi failed any journey whose request or answer had one; this proves the journeys went through it.
    expect(user.state.checked).toBeGreaterThan(100);
    expect(masters.state.checked).toBeGreaterThan(30);
  });
});
