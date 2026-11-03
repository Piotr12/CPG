import { describe, expect, inject, it } from "vitest";
import type { MrpPlanView } from "@cpg/core";
import { acceptOnScreen, day, firstOfNextMonth, journeyAccounts, runOnScreen, safetyGap, shown, supplyOf, withinOneDay } from "./journeys";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

/** A material's supply documents before any step. */
const NONE = { requisitions: 0, purchaseOrderLines: 0, productionOrders: 0, receipts: 0, completions: 0 };

/** A provisional level's buckets hold no supply of any kind: MRP never assumes its output (E2E-002, E2E-021). */
const noSupply = (plan: MrpPlanView) =>
  plan.buckets.every(({ tentativeSupply, dependableSupply, proposedReceipts }) => [tentativeSupply, dependableSupply, proposedReceipts].every((figure) => figure === "0.000000"));

// Planning journeys in Prod with manual runs (spec 2026-11-03--0626UTC-mrp-end-to-end-journeys): a three-level BOM
// made one dependable level at a time (E2E-002), the BOM fallback when the preferred one is short (E2E-003), and a
// safety target that rises inside the horizon (E2E-016). A normal user runs MRP and accepts on the screen, and every
// outcome is read back through the bearer API (R07); no request or answer carries a finance field (UX-023).
describe("planning journeys: levels, BOM choice and safety targets", () => {
  // This file's own account and token: other files share the app, and users are never deleted.
  const accounts = journeyAccounts(baseUrl, adminPassword, "e2epl", "prod");
  const { masters, user } = accounts;

  /** A material of the journey's own with planning parameters at `location`: Buy or Make, a 2-day lead time, no lot rule. */
  async function material(name: string, type: "raw" | "intermediate" | "finished", procurement: "buy" | "make", location: string, baseUnit = "kg") {
    const id = (await masters.post("/materials", { type, description: `e2epl ${name}`, baseUnit })).id as string;
    await masters.post("/planning-parameters", { material: id, location, procurement, leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" });
    return id;
  }
  const bom = async (output: string, priority: number, component: string, quantity: string) =>
    (await masters.post("/boms", { output, priority, validFrom: day(-30), validThrough: null, components: [{ material: component, quantity, unit: "kg" }] })).id as string;

  /**
   * E2E-002's chain up to its second run: F ← I ← R, no stock, a customer order for 10 F. Run 1 (on the screen when
   * `onScreen`) proposes only R's requisition, which is accepted, converted and received; run 2 follows through the API.
   * Each step's document counts per material are asserted on the way.
   */
  async function threeLevels(name: string, onScreen: boolean) {
    const location = (await masters.post("/locations", { name: `e2epl ${name} plant` })).id as string;
    const supplier = (await masters.post("/suppliers", { name: `e2epl ${name} supplier` })).id as string;
    const customer = (await masters.post("/customers", { name: `e2epl ${name} retail` })).id as string;
    const raw = await material(`${name} R`, "raw", "buy", location);
    const intermediate = await material(`${name} I`, "intermediate", "make", location);
    const finished = await material(`${name} F`, "finished", "make", location);
    const iBom = await bom(intermediate, 1, raw, "2");
    const fBom = await bom(finished, 1, intermediate, "1");
    await user.post("/customer-orders", { customer, location, lines: [{ material: finished, quantity: "10", unit: "kg", requiredDate: day(14) }] });
    const supply = async () => ({ R: await supplyOf(user, raw, location), I: await supplyOf(user, intermediate, location), F: await supplyOf(user, finished, location) });
    const plans = async () => ({ R: await user.plan(raw, location), I: await user.plan(intermediate, location), F: await user.plan(finished, location) });

    // Run 1: only R, which is bought, is executable; I and F are provisional and hold no supply (MRP-047).
    const first = onScreen ? await runOnScreen(accounts.ola, baseUrl, "prod", { material: raw, location }) : (await user.run()).id;
    const run1 = await plans();
    expect(run1.R.run).toMatchObject({ id: first, channel: onScreen ? "ui" : "api" });
    expect(run1.R.proposals).toEqual([expect.objectContaining({ kind: "purchase-requisition", quantity: "20.000000", executable: true })]);
    for (const [level, plan, levelBom] of [["I", run1.I, iBom], ["F", run1.F, fBom]] as const) {
      expect(plan.proposals, level).toEqual([]);
      expect(plan.provisional, level).toEqual([expect.objectContaining({ quantity: "10.000000", bom: levelBom })]);
      expect(noSupply(plan), `${level} holds no supply`).toBe(true);
    }
    const requisition = onScreen ? await acceptOnScreen(accounts.ola, "Create requisition") : (await user.accept(first, run1.R.proposals[0].id)).id as string;
    expect(await supply()).toEqual({ R: { ...NONE, requisitions: 1 }, I: NONE, F: NONE });

    // R is procured and received: one purchase-order line and one receipt, from that requisition.
    const order = await user.post("/purchase-orders", { supplier, location, lines: [{ material: raw, quantity: "20", unit: "kg", plannedDate: day(4), requisition }] });
    await user.post("/goods-receipts", { purchaseOrder: order.id, lines: [{ line: 1, quantity: "20", unit: "kg" }] });
    expect(await supply()).toEqual({ R: { ...NONE, requisitions: 1, purchaseOrderLines: 1, receipts: 1 }, I: NONE, F: NONE });

    // Run 2: R needs nothing more, and F is still provisional, holding no supply, since I is not on hand.
    const second = await user.run();
    const run2 = await plans();
    expect(run2.R.proposals).toEqual([]);
    expect(run2.F.proposals).toEqual([]);
    expect(run2.F.provisional).toEqual([expect.objectContaining({ quantity: "10.000000", bom: fBom, blockers: ["no-feasible-bom"] })]);
    expect(noSupply(run2.F), "F holds no supply").toBe(true);
    return { location, raw, intermediate, finished, iBom, fBom, supply, plans, second: second.id, run2 };
  }

  it("E2E-002: makes F from I from R one level at a time; no step assumes a provisional level's output or leaves a duplicate supply", () => withinOneDay(async () => {
    const { location, raw, intermediate, finished, fBom, supply, plans } = await threeLevels("E2E-002", true);

    // I is made from the R on hand, through an order entered directly: MRP keeps it provisional (#369, below).
    const iOrder = await user.post("/production-orders", { output: intermediate, location, quantity: "10", unit: "kg", plannedFinish: day(12) });
    await user.post(`/production-orders/${iOrder.id}/completions`, { quantity: "10", unit: "kg", components: [{ material: raw, quantity: "20", unit: "kg" }] });
    expect(await supply()).toEqual({
      R: { ...NONE, requisitions: 1, purchaseOrderLines: 1, receipts: 1 }, I: { ...NONE, productionOrders: 1, completions: 1 }, F: NONE,
    });

    // Run 3: with I on hand, F is executable; nothing else is proposed or provisional.
    const third = await user.run();
    const run3 = await plans();
    expect([run3.R.proposals, run3.I.proposals, run3.I.provisional, run3.F.provisional]).toEqual([[], [], [], []]);
    expect(run3.F.proposals).toEqual([expect.objectContaining({ kind: "production-order", quantity: "10.000000", bom: fBom, bomRevision: 1, executable: true })]);
    const fOrder = await user.accept(third.id, run3.F.proposals[0].id);
    await user.post(`/production-orders/${fOrder.id}/completions`, { quantity: "10", unit: "kg", components: [{ material: intermediate, quantity: "10", unit: "kg" }] });
    const done = { R: { ...NONE, requisitions: 1, purchaseOrderLines: 1, receipts: 1 }, I: { ...NONE, productionOrders: 1, completions: 1 }, F: { ...NONE, productionOrders: 1, completions: 1 } };
    expect(await supply()).toEqual(done);
    expect((await user.stock(finished, location)).quantity).toBe("10.000000");

    // Run 4: the demand is covered by stock, so nothing is proposed or provisional, and no document is added.
    await user.run();
    for (const [level, plan] of Object.entries(await plans())) expect([plan.proposals, plan.provisional], level).toEqual([[], []]);
    expect(await supply()).toEqual(done);
  }));

  // E2E-002's "dependencies fulfilled in sequence": with R on hand, run 2 should make I executable. It keeps I
  // provisional (`provisional-demand`) because F, its only demand, is short of I itself (#369). Flips red when fixed.
  it.fails("E2E-002 (#369): once R is on hand, the rerun makes I's production order executable", () => withinOneDay(async () => {
    const { iBom, run2 } = await threeLevels("E2E-002 #369", false);
    expect(run2.I.provisional).toEqual([]);
    expect(run2.I.proposals).toEqual([expect.objectContaining({ kind: "production-order", quantity: "10.000000", bom: iBom, bomRevision: 1, executable: true })]);
  }));

  it("E2E-003: with only B's component on hand, MRP pins BOM B, explains A's exact shortage, and the completion posts B's output and consumption", () => withinOneDay(async () => {
    const location = (await masters.post("/locations", { name: "e2epl E2E-003 plant" })).id as string;
    const customer = (await masters.post("/customers", { name: "e2epl E2E-003 retail" })).id as string;
    const finished = await material("E2E-003 F", "finished", "make", location, "each");
    const ca = await material("E2E-003 CA", "raw", "buy", location);
    const cb = await material("E2E-003 CB", "raw", "buy", location);
    const bomA = (await masters.post("/boms", { output: finished, priority: 1, validFrom: day(-30), validThrough: null, components: [{ material: ca, quantity: "1", unit: "kg" }] })).id as string;
    const bomB = (await masters.post("/boms", { output: finished, priority: 2, validFrom: day(-30), validThrough: null, components: [{ material: cb, quantity: "1", unit: "kg" }] })).id as string;
    await user.post("/stock/corrections", { material: cb, location, quantity: "10", unit: "kg", reason: "e2epl count" });
    await user.post("/customer-orders", { customer, location, lines: [{ material: finished, quantity: "6", unit: "each", requiredDate: day(10) }] });

    const run = await runOnScreen(accounts.ola, baseUrl, "prod", { material: finished, location });
    const [proposal] = (await user.plan(finished, location)).proposals;
    expect(proposal).toMatchObject({
      kind: "production-order", quantity: "6.000000", bom: bomB, bomRevision: 1, executable: true,
      rejectedBoms: [{ bom: bomA, revision: 1, reason: "shortage", shortages: [{ material: ca, required: "6.000000", available: "0.000000", shortage: "6.000000" }] }],
    });
    // The screen explains the same rejection, with A's exact shortage of CA, under "Why this BOM".
    const why = "main [data-mrp-why-bom] button";
    await accounts.ola.waitUntil(`Boolean(${shown(why)}) && Object.keys(${shown(why)}).some((key) => key.startsWith("__reactFiber"))`);
    await accounts.ola.click(why);
    await accounts.ola.waitUntil(`Boolean(${shown("main [data-mrp-shortage]")})`);
    expect(await accounts.ola.evaluate<string>(`${shown("main [data-mrp-rejections] > li")}.firstChild.textContent`)).toBe(`BOM ${bomA} / revision 1 — Component shortage`);
    expect(await accounts.ola.evaluate<string>(`${shown("main [data-mrp-shortage]")}.textContent`)).toBe(`${ca} e2epl E2E-003 CA: needs 6 kg, dependable 0 kg, short 6 kg`);

    const accepted = await acceptOnScreen(accounts.ola, "Create production order");
    const order = await user.get(`/production-orders/${accepted}`);
    expect(order).toMatchObject({ output: finished, bom: bomB, revision: 1, quantity: "6.000000", mrpRun: run });

    const { completion } = await user.post(`/production-orders/${accepted}/completions`, { quantity: "6", unit: "each", components: [{ material: cb, quantity: "6", unit: "kg" }] });
    expect(completion.lines).toEqual([expect.objectContaining({ material: cb, expected: "6.000000", actual: "6.000000", variance: "0.000000" })]);
    expect((await user.stock(finished, location)).quantity).toBe("6.000000");
    expect((await user.stock(cb, location)).quantity).toBe("4.000000");
    expect(await user.stock(ca, location)).toMatchObject({ quantity: "0.000000", movementCount: 0 });
  }));

  it("E2E-016: a safety target of 10 rising to 30 next month gives different daily gaps and dated proposals that count customer demand once", () => withinOneDay(async () => {
    const location = (await masters.post("/locations", { name: "e2epl E2E-016 plant" })).id as string;
    const customer = (await masters.post("/customers", { name: "e2epl E2E-016 retail" })).id as string;
    const item = await material("E2E-016 M", "raw", "buy", location);
    const rise = firstOfNextMonth();
    const orderDate = new Date(Date.parse(`${rise}T00:00:00Z`) + 5 * 86_400_000).toISOString().slice(0, 10);
    await user.post("/stock/corrections", { material: item, location, quantity: "4", unit: "kg", reason: "e2epl count" });
    await masters.post("/safety-stock-targets", { material: item, location, effectiveFrom: day(0), quantity: "10" });
    await masters.post("/safety-stock-targets", { material: item, location, effectiveFrom: rise, quantity: "30" });
    await user.post("/customer-orders", { customer, location, lines: [{ material: item, quantity: "20", unit: "kg", requiredDate: orderDate }] });

    const run = await runOnScreen(accounts.ola, baseUrl, "prod", { material: item, location });
    const plan = await user.plan(item, location);
    expect(plan.run.id).toBe(run);
    const bucket = (date: string) => plan.buckets.find((row) => row.date === date)!;
    // The target is 10 until the rise and 30 from it, so the daily gaps differ. Each gap is measured on the balance the
    // plan carries in, earlier proposals included: 6 on day 0 (stock 4), and 20 at the rise, when the 6 has arrived.
    expect(plan.buckets.filter(({ date }) => date < rise).every(({ safetyTarget }) => safetyTarget === "10.000000")).toBe(true);
    expect(plan.buckets.filter(({ date }) => date >= rise).every(({ safetyTarget }) => safetyTarget === "30.000000")).toBe(true);
    const dayBefore = (date: string) => plan.buckets[plan.buckets.findIndex((row) => row.date === date) - 1];
    expect(safetyGap(bucket(day(0)))).toBe(6);
    expect(dayBefore(rise).projectedAfter).toBe("10.000000");
    expect(safetyGap({ safetyTarget: bucket(rise).safetyTarget, projectedBefore: dayBefore(rise).projectedAfter })).toBe(20);
    expect(bucket(rise)).toMatchObject({ proposedReceipts: "20.000000", projectedAfter: "30.000000" });
    // Dated proposals cover each gap and the order, and add up to demand plus the final target less stock: 20 + 30 − 4.
    expect(plan.proposals.map(({ needDate, quantity }) => [needDate, quantity])).toEqual([[day(0), "6.000000"], [rise, "20.000000"], [orderDate, "20.000000"]]);
    expect(plan.proposals.reduce((sum, { quantity }) => sum + Number(quantity), 0)).toBe(20 + 30 - 4);

    // The first dated proposal is accepted on the screen as its requisition.
    const requisition = await acceptOnScreen(accounts.ola, "Create requisition");
    expect(await user.get(`/purchase-requisitions/${requisition}`)).toMatchObject({ material: item, quantity: "6.000000", requiredDate: day(0), mrpRun: run });
  }));

  it("UX-023: every request and answer of these journeys carried no price, cost, currency, invoice, tax, payment or accounting field", () => {
    // journeyApi failed any journey whose request or answer had one; this proves the journeys went through it.
    expect(user.state.checked).toBeGreaterThan(40);
    expect(masters.state.checked).toBeGreaterThan(20);
  });
});
