import writeXlsxFile, { type Cell } from "write-excel-file/node";
import { describe, expect, inject, it } from "vitest";
import type { MrpBucketView } from "@cpg/core";
import { acceptOnScreen, day, journeyAccounts, runOnScreen, supplyOf, withinOneDay, type JourneyApi } from "./journeys";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

/** A bucket's figures that would show demand or supply on its day: all of them but the balances and the target. */
const FLOWS = ["firmDemand", "forecastDemand", "dependentDemand", "transferOut", "tentativeSupply", "dependableSupply", "atRiskSupply", "transferIn", "proposedReceipts"] as const;
const noFlows = (bucket: MrpBucketView) => FLOWS.every((figure) => bucket[figure] === "0.000000");
/** A plan's dependable supply over its whole horizon. */
const dependable = (buckets: MrpBucketView[]) => buckets.reduce((sum, { dependableSupply }) => sum + Number(dependableSupply), 0);
/** A ledger page as `[type, quantity]` pairs, newest first. */
const moves = (movements: { type: string; quantity: string }[]) => movements.map(({ type, quantity }) => [type, quantity]);

/** A stock workbook, as base64, from its data rows (spec 2026-10-20--2225UTC-stock-import); the header row is added. */
async function stockWorkbook(rows: Cell[][]): Promise<string> {
  const data = [["Material ID", "Location ID", "Physical quantity", "Unit"], ...rows];
  return (await writeXlsxFile([{ sheet: "Stock", data }]).toBuffer()).toString("base64");
}

// Correction journeys in Prod with manual runs (spec 2026-11-03--0626UTC-mrp-end-to-end-journeys): a receipt posted
// for more than arrived, reversed and posted again (E2E-007), a customer return as a reasoned positive correction
// (E2E-008), extra consumption and a counted stock workbook (E2E-012), and a reversed completion (E2E-019). Each time
// the next run plans from the corrected balance. A normal user runs MRP and accepts on the screen, and every outcome is
// read back through the bearer API (R07); no request or answer carries a finance field (UX-023).
describe("correction journeys: reversals, returns and counts feed the next run", () => {
  // This file's own account and token: other files share the app, and users are never deleted.
  const accounts = journeyAccounts(baseUrl, adminPassword, "e2eco", "prod");
  const { masters, user } = accounts;

  /** A location, supplier and customer of the journey's own, named after `name`. */
  async function place(name: string) {
    const location = (await masters.post("/locations", { name: `e2eco ${name} plant` })).id as string;
    const supplier = (await masters.post("/suppliers", { name: `e2eco ${name} supplier` })).id as string;
    const customer = (await masters.post("/customers", { name: `e2eco ${name} retail` })).id as string;
    return { location, supplier, customer };
  }
  /** A material of the journey's own with planning parameters at `location`: Buy or Make, a 2-day lead time, no lot rule. */
  async function material(name: string, type: "raw" | "finished", procurement: "buy" | "make", location: string, baseUnit = "kg") {
    const id = (await masters.post("/materials", { type, description: `e2eco ${name}`, baseUnit })).id as string;
    await masters.post("/planning-parameters", { material: id, location, procurement, leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" });
    return id;
  }
  const bom = async (output: string, component: string) =>
    (await masters.post("/boms", { output, priority: 1, validFrom: day(-30), validThrough: null, components: [{ material: component, quantity: "1", unit: "kg" }] })).id as string;
  const correct = (api: JourneyApi, item: string, location: string, quantity: string, reason: string, unit = "kg") =>
    api.post("/stock/corrections", { material: item, location, quantity, unit, reason });

  /**
   * F made from R (1 kg each), with `stock` kg of R on hand and a customer order for 10 F due `day(10)`. Run 1 goes
   * through the screen, and F's executable production order of 10 is accepted there. Returns the masters, the run and
   * the accepted order (E2E-012, E2E-019).
   */
  async function madeOnScreen(name: string, stock: string) {
    const { location, customer } = await place(name);
    const raw = await material(`${name} R`, "raw", "buy", location);
    const finished = await material(`${name} F`, "finished", "make", location, "each");
    const fBom = await bom(finished, raw);
    await correct(user, raw, location, stock, "e2eco count");
    await user.post("/customer-orders", { customer, location, lines: [{ material: finished, quantity: "10", unit: "each", requiredDate: day(10) }] });

    const run = await runOnScreen(accounts.ola, baseUrl, "prod", { material: finished, location });
    const fPlan = await user.plan(finished, location);
    expect(fPlan.run).toMatchObject({ id: run, channel: "ui", account: accounts.username });
    expect(fPlan.proposals).toEqual([expect.objectContaining({ kind: "production-order", quantity: "10.000000", bom: fBom, bomRevision: 1, executable: true })]);
    const accepted = await acceptOnScreen(accounts.ola, "Create production order");
    expect((await user.plan(finished, location)).proposals[0].document).toBe(accepted);
    const order = await user.get(`/production-orders/${accepted}`);
    expect(order).toMatchObject({ output: finished, location, bom: fBom, revision: 1, quantity: "10.000000", mrpRun: run, status: "open" });
    return { location, raw, finished, run, order };
  }

  it("E2E-007: a receipt of 100 posted when 80 arrived is reversed in full and posted again as 80; the next run keeps the open 20 as supply", () => withinOneDay(async () => {
    const { location, supplier, customer } = await place("E2E-007");
    const raw = await material("E2E-007 R", "raw", "buy", location);
    await user.post("/customer-orders", { customer, location, lines: [{ material: raw, quantity: "100", unit: "kg", requiredDate: day(10) }] });

    // Run 1, on the screen: R needs a requisition of 100, accepted there and ordered in full.
    const run = await runOnScreen(accounts.ola, baseUrl, "prod", { material: raw, location });
    const first = await user.plan(raw, location);
    expect(first.run).toMatchObject({ id: run, channel: "ui" });
    expect(first.proposals).toEqual([expect.objectContaining({ kind: "purchase-requisition", quantity: "100.000000", executable: true })]);
    const requisition = await acceptOnScreen(accounts.ola, "Create requisition");
    expect((await user.plan(raw, location)).proposals[0].document).toBe(requisition);
    expect(await user.get(`/purchase-requisitions/${requisition}`)).toMatchObject({ material: raw, quantity: "100.000000", mrpRun: run });
    const order = await user.post("/purchase-orders", { supplier, location, lines: [{ material: raw, quantity: "100", unit: "kg", plannedDate: day(8), requisition }] });

    // A receipt of 100 is posted while only 80 arrived; its line's movement is reversed in full, and 80 is received.
    const wrong = await user.post("/goods-receipts", { purchaseOrder: order.id, lines: [{ line: 1, quantity: "100", unit: "kg" }] });
    const original = wrong.lines[0].movementId as string;
    const reversal = (await user.post(`/stock/movements/${original}/reverse`, { reason: "e2eco only 80 arrived" })).movement;
    expect(reversal).toMatchObject({ quantity: "-100.000000", balanceAfter: "0.000000" });
    const right = await user.post("/goods-receipts", { purchaseOrder: order.id, lines: [{ line: 1, quantity: "80", unit: "kg" }] });

    // Stock is 80, the line has received 80, and the order stays Open for the other 20.
    expect((await user.stock(raw, location)).quantity).toBe("80.000000");
    expect(await user.get(`/purchase-orders/${order.id}`)).toMatchObject({ status: "open", lines: [expect.objectContaining({ received: "80.000000", status: "open" })] });

    // Run 2: the line's open 20 is dependable supply on its planned date, and nothing else is proposed.
    await user.run();
    const second = await user.plan(raw, location);
    expect(second.buckets.find(({ date }) => date === day(8))).toMatchObject({ dependableSupply: "20.000000" });
    expect(dependable(second.buckets)).toBe(20);
    expect(second.proposals).toEqual([]);

    // The ledger keeps the +100, its −100 reversal and the +80, each naming its receipt and the order.
    const ledger = (await user.stock(raw, location)).movements;
    expect(moves(ledger)).toEqual([["goods-receipt", "80.000000"], ["reversal", "-100.000000"], ["goods-receipt", "100.000000"]]);
    const fromOrder = (receipt: string) => ({ id: receipt, document: { type: "purchase-order", id: order.id } });
    expect(ledger[0].source).toMatchObject(fromOrder(right.id));
    expect(ledger[1]).toMatchObject({ id: reversal.id, reverses: original, source: fromOrder(wrong.id) });
    expect(ledger[2]).toMatchObject({ id: original, reversedBy: reversal.id, source: fromOrder(wrong.id) });
  }));

  it("E2E-008: a customer return is a positive correction of 5 with its reason; the next run opens with it, and no order or return document changes", () => withinOneDay(async () => {
    const { location, supplier, customer } = await place("E2E-008");
    const goods = await material("E2E-008 M", "finished", "buy", location, "each");
    const sale = await user.post("/customer-orders", { customer, location, lines: [{ material: goods, quantity: "10", unit: "each", requiredDate: day(10) }] });

    // Run 1, on the screen: the bought finished good M is requisitioned there, ordered and received.
    const run = await runOnScreen(accounts.ola, baseUrl, "prod", { material: goods, location });
    const first = await user.plan(goods, location);
    expect(first.run).toMatchObject({ id: run, channel: "ui" });
    expect(first.proposals).toEqual([expect.objectContaining({ kind: "purchase-requisition", quantity: "10.000000", executable: true })]);
    const requisition = await acceptOnScreen(accounts.ola, "Create requisition");
    expect((await user.plan(goods, location)).proposals[0].document).toBe(requisition);
    expect(await user.get(`/purchase-requisitions/${requisition}`)).toMatchObject({ material: goods, quantity: "10.000000", mrpRun: run });
    const order = await user.post("/purchase-orders", { supplier, location, lines: [{ material: goods, quantity: "10", unit: "each", plannedDate: day(8), requisition }] });
    await user.post("/goods-receipts", { purchaseOrder: order.id, lines: [{ line: 1, quantity: "10", unit: "each" }] });

    // The customer order is shipped in full and Completed.
    const shipment = await user.post("/shipments", { customerOrder: sale.id, plannedDate: day(0), lines: [{ orderLine: sale.lines[0].id, quantity: "10", unit: "each" }] });
    await user.post("/goods-issues", { shipment: shipment.id, lines: [{ line: 1, quantity: "10", unit: "each" }] });
    expect(await user.get(`/customer-orders/${sale.id}`)).toMatchObject({ status: "completed" });
    expect((await user.stock(goods, location)).quantity).toBe("0.000000");

    /** Every document of M's journey: its supply, the customer's orders, their shipments and the shipments' goods issues. */
    const documents = async () => {
      // The orders search also matches order IDs, so the customer's own are kept by their customer.
      const sales = (await user.all<{ id: string; customer: string }>("customer-orders", customer)).filter((row) => row.customer === customer);
      const shipments = (await Promise.all(sales.map(({ id }) => user.get<{ id: string }[]>(`/shipments?customerOrder=${id}`)))).flat();
      const issues = (await Promise.all(shipments.map(({ id }) => user.get<{ id: string }[]>(`/goods-issues?shipment=${id}`)))).flat();
      return { supply: await supplyOf(user, goods, location), sales, shipments, issues };
    };
    const before = await documents();
    expect(before.supply).toMatchObject({ requisitions: 1, purchaseOrderLines: 1, receipts: 1 });
    expect([before.sales.length, before.shipments.length, before.issues.length]).toEqual([1, 1, 1]);

    // The return: a positive correction of 5, with its reason, and nothing else.
    const correction = await correct(user, goods, location, "5", "Customer return", "each");
    const returned = await user.stock(goods, location);
    expect(returned.quantity).toBe("5.000000");
    expect(returned.movements[0]).toMatchObject({ id: correction.id, type: "correction", quantity: "5.000000", reason: "Customer return", source: { id: null, document: null } });

    // Run 2 opens M at exactly the returned 5, with no demand or supply on day 0.
    await user.run();
    const [today] = (await user.plan(goods, location)).buckets;
    expect(today).toMatchObject({ date: day(0), projectedBefore: "5.000000" });
    expect(noFlows(today), "no demand or supply on day 0").toBe(true);

    // The order is still Completed, and no document was added or changed: there is no return document.
    expect(await user.get(`/customer-orders/${sale.id}`)).toMatchObject({ status: "completed", lines: [expect.objectContaining({ fulfilled: "10.000000", status: "completed" })] });
    expect(await documents()).toEqual(before);
  }));

  it("E2E-012: extra consumption and a counted stock workbook change only the listed positions, keep the variance history, and run 2 opens at 85", () => withinOneDay(async () => {
    const { location, raw, finished, order } = await madeOnScreen("E2E-012", "100");
    // A third pair of the journey, never listed in the workbook.
    const other = await material("E2E-012 X", "raw", "buy", location);
    await correct(user, other, location, "7", "e2eco count");

    // The completion uses 12 R where its recipe expects 10, leaving 88.
    const { completion } = await user.post(`/production-orders/${order.id}/completions`, { quantity: "10", unit: "each", components: [{ material: raw, quantity: "12", unit: "kg" }] });
    expect(completion.lines).toEqual([expect.objectContaining({ material: raw, expected: "10.000000", actual: "12.000000", variance: "2.000000" })]);
    expect((await user.stock(raw, location)).quantity).toBe("88.000000");
    const variance = await user.get(`/reports/variance?material=${raw}`);
    expect(variance.rows).toEqual([expect.objectContaining({ id: order.id, components: [expect.objectContaining({ material: raw, expected: "10.000000", actual: "12.000000", variance: "2.000000" })] })]);
    const [fBefore, xBefore] = [await user.stock(finished, location), await user.stock(other, location)];
    expect([fBefore.quantity, xBefore.quantity]).toEqual(["10.000000", "7.000000"]);

    // A count finds 85 R: the workbook lists R at 85 and F at its balance. The dry run moves R by −3 and leaves F.
    const workbook = await stockWorkbook([[raw, location, 85, null], [finished, location, 10, null]]);
    const preview = await user.post("/stock-import/dry-run", { workbook });
    expect(preview.errors).toEqual([]);
    expect(preview.rows.map(({ record, action }: { record: string; action: string }) => [record, action])).toEqual([[`${raw}/${location}`, "update"], [`${finished}/${location}`, "unchanged"]]);
    expect(preview.rows[0].changes).toContainEqual({ field: "Movement", before: null, after: "-3.000000 kg" });
    expect((await user.stock(raw, location)).quantity).toBe("88.000000");
    expect(await user.post("/stock-import/commit", { workbook, previewToken: preview.previewToken, reason: "e2eco stock count" })).toMatchObject({ committed: true });

    // Only R changed, by −3, and the completion's movements stay in its ledger; F and the unlisted pair are untouched.
    const counted = await user.stock(raw, location);
    expect(counted.quantity).toBe("85.000000");
    expect(moves(counted.movements)).toEqual([["correction", "-3.000000"], ["production-completion", "-12.000000"], ["correction", "100.000000"]]);
    expect(counted.movements[0]).toMatchObject({ reason: "e2eco stock count", actorUsername: accounts.username });
    expect(await user.stock(finished, location)).toEqual(fBefore);
    expect(await user.stock(other, location)).toEqual(xBefore);
    // The variance history is the completion's, unchanged by the count.
    expect(await user.get(`/reports/variance?material=${raw}`)).toEqual(variance);

    // Run 2 opens R at exactly the counted 85.
    await user.run();
    expect((await user.plan(raw, location)).buckets[0]).toMatchObject({ date: day(0), projectedBefore: "85.000000" });
  }));

  it("E2E-019: a reversed completion is not stock, and the reopened order's outstanding 10 is dependable supply again, counted once", () => withinOneDay(async () => {
    const { location, raw, finished, order } = await madeOnScreen("E2E-019", "15");
    expect(order.plannedFinish).toBe(day(10));

    // The completion makes 10 F from 10 R, and is then reversed as a whole.
    const { completion } = await user.post(`/production-orders/${order.id}/completions`, { quantity: "10", unit: "each", components: [{ material: raw, quantity: "10", unit: "kg" }] });
    expect([(await user.stock(finished, location)).quantity, (await user.stock(raw, location)).quantity]).toEqual(["10.000000", "5.000000"]);
    const reversed = await user.post(`/production-orders/${order.id}/completions/${completion.id}/reverse`, { reason: "e2eco posted on the wrong order" });
    expect(reversed.order).toMatchObject({ produced: "0.000000", outstanding: "10.000000", status: "open" });

    // F is back to 0 and R to 15, and the order is Open again with 10 outstanding.
    expect([(await user.stock(finished, location)).quantity, (await user.stock(raw, location)).quantity]).toEqual(["0.000000", "15.000000"]);
    expect(await user.get(`/production-orders/${order.id}`)).toMatchObject({ status: "open", produced: "0.000000", outstanding: "10.000000" });

    // Run 2: F opens at 0, the order's 10 is dependable supply on its planned finish, once, and nothing is proposed.
    await user.run();
    const plan = await user.plan(finished, location);
    expect(plan.buckets[0]).toMatchObject({ date: day(0), projectedBefore: "0.000000" });
    expect(plan.buckets.find(({ date }) => date === order.plannedFinish)).toMatchObject({ dependableSupply: "10.000000" });
    expect(dependable(plan.buckets)).toBe(10);
    expect([plan.proposals, plan.provisional]).toEqual([[], []]);

    // F's ledger holds the completion's +10 and its reversal's −10, and nothing else.
    expect(moves((await user.stock(finished, location)).movements)).toEqual([["reversal", "-10.000000"], ["production-completion", "10.000000"]]);
  }));

  it("UX-023: every request and answer of these journeys carried no price, cost, currency, invoice, tax, payment or accounting field", () => {
    // journeyApi failed any journey whose request or answer had one; this proves the journeys went through it.
    expect(user.state.checked).toBeGreaterThan(40);
    expect(masters.state.checked).toBeGreaterThan(20);
  });
});
