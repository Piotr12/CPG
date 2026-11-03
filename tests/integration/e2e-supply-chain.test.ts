import { randomUUID } from "node:crypto";
import writeXlsxFile, { type Cell } from "write-excel-file/node";
import { describe, expect, inject, it } from "vitest";
import type { MrpProposalView } from "@cpg/core";
import { acceptOnScreen, day, journeyAccounts, runOnScreen, withinOneDay } from "./journeys";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// Cross-domain journeys in Prod with manual runs (spec 2026-11-03--0626UTC-mrp-end-to-end-journeys): demand → MRP →
// requisition → purchase order → receipt → production order → completion → goods issue (E2E-001), and an imported
// BOM chosen by MRP and pinned by the order it proposes (E2E-015). A normal user runs MRP and accepts on the screen,
// and every outcome is read back through the bearer API (R07); no request or answer carries a finance field (UX-023).
describe("supply-chain journeys from demand to shipment", () => {
  // This file's own account and token: other files share the app, and users are never deleted.
  const accounts = journeyAccounts(baseUrl, adminPassword, "e2esc", "prod");
  const { masters, user } = accounts;

  /** A material, location, supplier and customer of the journey's own, named after `name`. */
  async function ownMasters(name: string) {
    const raw = (await masters.post("/materials", { type: "raw", description: `e2esc ${name} R`, baseUnit: "kg" })).id as string;
    const finished = (await masters.post("/materials", { type: "finished", description: `e2esc ${name} F`, baseUnit: "each" })).id as string;
    const location = (await masters.post("/locations", { name: `e2esc ${name} plant` })).id as string;
    const supplier = (await masters.post("/suppliers", { name: `e2esc ${name} supplier` })).id as string;
    const customer = (await masters.post("/customers", { name: `e2esc ${name} retail` })).id as string;
    await masters.post("/planning-parameters", { material: raw, location, procurement: "buy", leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" });
    await masters.post("/planning-parameters", { material: finished, location, procurement: "make", leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" });
    return { raw, finished, location, supplier, customer };
  }

  it("E2E-001: buys R, makes F from it and ships 10 F; every posting moves stock once and is in the ledger and the audit", () => withinOneDay(async () => {
    const { raw, finished, location, supplier, customer } = await ownMasters("E2E-001");
    const bom = (await masters.post("/boms", { output: finished, priority: 1, validFrom: day(-30), validThrough: null, components: [{ material: raw, quantity: "1", unit: "kg" }] })).id as string;
    const order = await user.post("/customer-orders", { customer, location, lines: [{ material: finished, quantity: "10", unit: "each", requiredDate: day(10) }] });

    // The first run, on the screen: R has no stock, so F can only be planned provisionally, and R is bought.
    const first = await runOnScreen(accounts.ola, baseUrl, "prod", { material: raw, location });
    const rPlan = await user.plan(raw, location);
    expect(rPlan.run).toMatchObject({ id: first, channel: "ui", account: accounts.username });
    expect(rPlan.proposals).toEqual([expect.objectContaining({ kind: "purchase-requisition", quantity: "10.000000", executable: true, document: null })]);
    const fPlan = await user.plan(finished, location);
    expect(fPlan.proposals).toEqual([]);
    expect(fPlan.provisional).toEqual([expect.objectContaining({ quantity: "10.000000", bom, blockers: ["no-feasible-bom"] })]);

    const requisition = await acceptOnScreen(accounts.ola, "Create requisition");
    expect((await user.plan(raw, location)).proposals[0].document).toBe(requisition);
    expect(await user.get(`/purchase-requisitions/${requisition}`)).toMatchObject({ material: raw, quantity: "10.000000", mrpRun: first, status: "open" });

    // The requisition becomes a purchase order, and its receipt raises R.
    const purchaseOrder = await user.post("/purchase-orders", { supplier, location, lines: [{ material: raw, quantity: "10", unit: "kg", plannedDate: day(8), requisition }] });
    expect(await user.get(`/purchase-requisitions/${requisition}`)).toMatchObject({ converted: "10.000000", status: "completed" });
    const receipt = await user.post("/goods-receipts", { purchaseOrder: purchaseOrder.id, lines: [{ line: 1, quantity: "10", unit: "kg" }] });
    expect((await user.get(`/purchase-orders/${purchaseOrder.id}`)).lines[0]).toMatchObject({ received: "10.000000", status: "completed" });
    expect((await user.stock(raw, location)).quantity).toBe("10.000000");

    // The rerun, through the API: with R on hand, F's need is an executable production order pinned to its BOM.
    const second = await user.run();
    const [make] = (await user.plan(finished, location)).proposals as MrpProposalView[];
    expect(make).toMatchObject({ kind: "production-order", quantity: "10.000000", bom, bomRevision: 1, executable: true });
    expect((await user.plan(raw, location)).proposals).toEqual([]);
    const productionOrder = await user.accept(second.id, make.id);
    expect(productionOrder).toMatchObject({ output: finished, bom, revision: 1, quantity: "10.000000", mrpRun: second.id, status: "open" });

    // The completion consumes R and produces F.
    const { completion, order: completed } = await user.post(`/production-orders/${productionOrder.id}/completions`, {
      quantity: "10", unit: "each", components: [{ material: raw, quantity: "10", unit: "kg" }],
    });
    expect(completed).toMatchObject({ produced: "10.000000", status: "completed" });
    expect((await user.stock(raw, location)).quantity).toBe("0.000000");
    expect((await user.stock(finished, location)).quantity).toBe("10.000000");

    // Shipping 10 F with a goods issue brings F back down and completes the customer order.
    const shipment = await user.post("/shipments", { customerOrder: order.id, plannedDate: day(0), lines: [{ orderLine: order.lines[0].id, quantity: "10", unit: "each" }] });
    const issue = await user.post("/goods-issues", { shipment: shipment.id, lines: [{ line: 1, quantity: "10", unit: "each" }] });
    expect((await user.stock(finished, location)).quantity).toBe("0.000000");
    const shipped = await user.get(`/customer-orders/${order.id}`);
    expect(shipped).toMatchObject({ status: "completed" });
    expect(shipped.lines[0]).toMatchObject({ fulfilled: "10.000000", status: "completed" });

    // Every movement is in the ledger, newest first, each naming its document, and nothing else moved.
    const rLedger = (await user.stock(raw, location)).movements;
    expect(rLedger.map(({ type, quantity }) => [type, quantity])).toEqual([["production-completion", "-10.000000"], ["goods-receipt", "10.000000"]]);
    expect(rLedger[1].source).toMatchObject({ id: receipt.id, document: { type: "purchase-order", id: purchaseOrder.id } });
    const fLedger = (await user.stock(finished, location)).movements;
    expect(fLedger.map(({ type, quantity }) => [type, quantity])).toEqual([["goods-issue", "-10.000000"], ["production-completion", "10.000000"]]);
    expect(fLedger[1].postingId).toBe(rLedger[0].postingId);
    for (const movement of [...rLedger, ...fLedger]) expect(movement).toMatchObject({ actorUsername: accounts.username, channel: "api" });

    // And in the tenant audit, by the user: the requisition accepted on the screen, the postings over the API.
    const audited = async (type: string, id: string, action: string, channel = "api") =>
      expect((await user.audit(type, id)).find((entry) => entry.action === action), `${action} on ${type} ${id}`).toMatchObject({ actor: { username: accounts.username }, channel });
    await audited("GoodsReceipt", receipt.id, "goods-receipts.goods-receipt.posted");
    await audited("ProductionCompletion", completion.id, "production-orders.production-completion.posted");
    await audited("GoodsIssue", issue.id, "goods-issues.goods-issue.posted");
    await audited("PurchaseRequisition", requisition, "purchase-requisitions.purchase-requisition.created", "ui");
  }));

  it("E2E-015: MRP chooses a BOM imported through its temporary Import Reference, and the order it proposes pins revision 1", () => withinOneDay(async () => {
    const { raw, finished, location, customer } = await ownMasters("E2E-015");
    const reference = `E2ESC-${randomUUID().slice(0, 8).toUpperCase()}`;
    const headers: Record<string, string[]> = {
      "BOM headers": ["BOM ID", "Import reference", "Output material ID", "Priority", "Valid from", "Valid through", "Active"],
      "BOM lines": ["BOM", "Component material ID", "Quantity", "Unit"],
    };
    const sheets: Record<string, Cell[][]> = {
      "BOM headers": [[null, reference, finished, 1, day(-30), null, null]],
      "BOM lines": [[reference, raw, 2, "kg"]],
    };
    const workbook = (await writeXlsxFile(Object.entries(sheets).map(([sheet, rows]) => ({ sheet, data: [headers[sheet], ...rows] }))).toBuffer()).toString("base64");

    // Dry run, then commit: the import reference becomes a permanent BOM ID at revision 1.
    const preview = await masters.post("/import/dry-run", { workbook });
    expect(preview).toMatchObject({ committed: false, rows: [expect.objectContaining({ action: "create", reference })] });
    const committed = await masters.post("/import/commit", { workbook, previewToken: preview.previewToken });
    const bom = committed.rows[0].record as string;
    expect(bom).toMatch(/^\d{8}$/);
    expect(await masters.get(`/boms/${bom}`)).toMatchObject({ output: finished, revision: 1, components: [expect.objectContaining({ material: raw, quantity: "2.000000" })] });

    // The component is on hand, so the Make is feasible.
    await user.post("/stock/corrections", { material: raw, location, quantity: "16", unit: "kg", reason: "e2esc count" });
    await user.post("/customer-orders", { customer, location, lines: [{ material: finished, quantity: "8", unit: "each", requiredDate: day(10) }] });

    // MRP, on the screen, proposes the order through the imported BOM, and accepting it on the screen pins revision 1.
    const run = await runOnScreen(accounts.ola, baseUrl, "prod", { material: finished, location });
    const [proposal] = (await user.plan(finished, location)).proposals;
    expect(proposal).toMatchObject({ kind: "production-order", quantity: "8.000000", bom, bomRevision: 1, executable: true, rejectedBoms: [] });
    const accepted = await acceptOnScreen(accounts.ola, "Create production order");
    expect((await user.plan(finished, location)).proposals[0].document).toBe(accepted);
    expect(await user.get(`/production-orders/${accepted}`)).toMatchObject({ output: finished, location, bom, revision: 1, quantity: "8.000000", mrpRun: run });
  }));

  it("UX-023: every request and answer of these journeys carried no price, cost, currency, invoice, tax, payment or accounting field", () => {
    // journeyApi failed any journey whose request or answer had one; this proves the journeys went through it.
    expect(user.state.checked).toBeGreaterThan(40);
    expect(masters.state.checked).toBeGreaterThan(10);
  });
});
