import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { CustomerOrderView, IssueView, LedgerMovementView, OrderView, ReceiptView, ShipmentView, StockMovementView, StockReversalView, StockView } from "@cpg/core";
import { openBrowser, type Browser } from "./browser";
import { hydrated, signInAs, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";
import { callApi, json } from "./api";
const baseUrl = inject("baseUrl");
const password = "reversal-integration-password";
const username = `reversal-${randomUUID().slice(0, 8)}`;

describe("full stock reversals (#91)", () => {
  let admin: Browser; let operator: Browser; let adminSecret: string; let operatorSecret: string;
  let material: string; let location: string; let purchase: OrderView; let order: CustomerOrderView; let shipment: ShipmentView; let receipt: ReceiptView; let issue: IssueView;
  async function api<T>(method: string, endpoint: string, body?: unknown, secret = adminSecret, key = randomUUID(), generation?: number) {
    const response = await callApi(baseUrl, method, endpoint, secret, { body, key, generation });
    return { ...response, body: json(response) as { ok: boolean; data: T; error: { code: string; params?: Record<string, string> } } };
  }
  const get = async <T>(path: string) => { const response = await api<T>("GET", `/api/tenants/prod/${path}`); expect(response.status).toBe(200); return response.body.data; };
  const create = async <T>(path: string, body: unknown) => { const response = await api<T>("POST", `/api/tenants/prod/${path}`, body); expect(response.status).toBe(200); return response.body.data; };
  const stock = () => get<StockView>(`stock?material=${material}&location=${location}`);
  const correct = (quantity: string, reason: string) => create<StockMovementView>("stock/corrections", { material, location, quantity, unit: "each", reason });
  const reversePath = (id: string, tenant = "prod") => `/api/tenants/${tenant}/stock/movements/${id}/reverse`;
  beforeAll(async () => {
    admin = openBrowser(); operator = openBrowser();
    await signInAsAdmin(admin, baseUrl, inject("adminPassword")); await openTokens(admin, baseUrl); adminSecret = await createToken(admin, `${username}-admin`);
    expect((await api("POST", "/api/users", { username, password })).status).toBe(200);
    await signInAs(operator, baseUrl, username, password); await openTokens(operator, baseUrl); operatorSecret = await createToken(operator, `${username}-operator`);
    material = (await create<{ id: string }>("materials", { type: "raw", description: `${username} bolts`, baseUnit: "each" })).id;
    location = (await create<{ id: string }>("locations", { name: `${username} warehouse` })).id;
    const supplier = (await create<{ id: string }>("suppliers", { name: `${username} supplier` })).id;
    const customer = (await create<{ id: string }>("customers", { name: `${username} customer` })).id;
    purchase = await create<OrderView>("purchase-orders", { supplier, location, lines: [{ material, quantity: "100", unit: "each", plannedDate: "2026-11-01" }] });
    receipt = await create<ReceiptView>("goods-receipts", { purchaseOrder: purchase.id, lines: [{ line: 1, quantity: "100", unit: "each" }] });
    order = await create<CustomerOrderView>("customer-orders", { customer, location, lines: [{ material, quantity: "80", unit: "each", requiredDate: "2026-11-01" }] });
    shipment = await create<ShipmentView>("shipments", { customerOrder: order.id, plannedDate: "2026-11-01", lines: [{ orderLine: order.lines[0].id, quantity: "80", unit: "each" }] });
    issue = await create<IssueView>("goods-issues", { shipment: shipment.id, lines: [{ line: 1, quantity: "80", unit: "each" }] });
  });
  afterAll(async () => {
    if (adminSecret) {
      await api("PATCH", "/api/tenants/prod", { readOnly: false });
      for (const secret of [adminSecret, operatorSecret].filter(Boolean)) {
        const response = await api<{ id: string; name: string }[]>("GET", "/api/tokens", undefined, secret);
        for (const token of response.body.data.filter(({ name }) => name.startsWith(username))) await api("DELETE", `/api/tokens/${token.id}`, undefined, secret);
      }
    }
    await Promise.all([admin?.close(), operator?.close()]);
  });
  it("refuses shortages and wrong-scope/partial requests without changing history, then completes REV-021 at exactly 10", async () => {
    const original = receipt.lines[0].movementId!;
    const before = await stock(); expect(before.quantity).toBe("20.000000");
    const shortage = await api("POST", reversePath(original), { reason: "Wrong receipt" });
    expect(shortage.status).toBe(409); expect(shortage.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect((await api("POST", reversePath(original), { reason: "Partial", quantity: "20" })).body.error.code).toBe("VALIDATION_FAILED");
    // Test's current generation: a file that ran before may have reset Test.
    const { generation } = (await api<{ generation: number }>("GET", "/api/tenants/test", undefined, operatorSecret)).body.data;
    expect((await api("POST", reversePath(original, "test"), { reason: "Wrong tenant" }, operatorSecret, randomUUID(), generation)).status).toBe(404);
    expect((await api("GET", `/api/tenants/test/stock/movements/${original}`, undefined, operatorSecret)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/tenants/prod/stock/movements/${original}`)).status).toBe(401);
    expect(await stock()).toEqual(before);
    const temporary = await correct("80", "Temporary stock for receipt correction");
    const key = randomUUID();
    const reversed = await api<StockReversalView>("POST", reversePath(original), { reason: "Wrong receipt" }, operatorSecret, key);
    expect(reversed.status).toBe(200); expect(reversed.body.data.movement).toMatchObject({ quantity: "-100.000000", balanceAfter: "0.000000", businessDate: new Date().toISOString().slice(0, 10) });
    const replay = await api<StockReversalView>("POST", reversePath(original), { reason: "Wrong receipt" }, operatorSecret, key);
    expect(replay.replayed).toBe("true"); expect(replay.text).toBe(reversed.text);
    const again = await api("POST", reversePath(original), { reason: "Again" });
    expect(again.body.error).toMatchObject({ code: "STOCK_ALREADY_REVERSED", params: { reversal: reversed.body.data.movement.id } });
    expect((await api("POST", reversePath(reversed.body.data.movement.id), { reason: "Undo inverse" })).body.error.code).toBe("STOCK_REVERSAL_UNSUPPORTED");
    // The line stays posted after the full reversal (#138): its order closes early, never cancels.
    expect(await get<OrderView>(`purchase-orders/${purchase.id}`)).toMatchObject({ status: "open", lines: [{ received: "0.000000", posted: true }] });
    await admin.open(`${baseUrl}/admin/prod/purchase-orders/${purchase.id}`); await admin.waitForText("Close Early");
    const actions = `[...document.querySelectorAll("main button[aria-label]")].map((button) => button.getAttribute("aria-label").split(" — ")[0])`;
    expect((await admin.evaluate<string[]>(actions)).filter((label) => label === "Cancel" || label === "Close Early")).toEqual(["Close Early", "Close Early"]);
    await create("goods-receipts", { purchaseOrder: purchase.id, lines: [{ line: 1, quantity: "90", unit: "each" }] });
    expect((await api("POST", reversePath(temporary.id), { reason: "Remove temporary stock" })).status).toBe(200);
    expect((await stock()).quantity).toBe("10.000000");
    expect(await get<ReceiptView>(`goods-receipts/${receipt.id}`)).toMatchObject({ lines: [{ quantity: "100.000000", reversedBy: reversed.body.data.movement.id }] });
    expect(await get<LedgerMovementView>(`stock/movements/${reversed.body.data.movement.id}`)).toMatchObject({ reverses: original, source: { id: receipt.id, document: { type: "purchase-order", id: purchase.id } } });
  });
  it("lets an operator reverse an issue from its shipment and preserves identity locks when fulfilment returns to zero", async () => {
    await operator.open(`${baseUrl}/admin/prod/shipments/${shipment.id}`); await operator.waitForText("Goods issues");
    await operator.waitUntil(hydrated(`document.querySelector("main button")`));
    await operator.clickRole("button", "Reverse"); await operator.waitFor("[role=dialog]");
    expect(await operator.text("[role=dialog]")).toContain("80 each");
    expect(await operator.evaluate<number>(`document.querySelectorAll('[role=dialog] input').length`)).toBe(1);
    await operator.fillLabel("Reason", "Delivery did not leave"); await operator.clickRole("button", "Reverse full quantity");
    await operator.waitUntil(`!document.querySelector("[role=dialog]")`); await operator.waitForText("View reversal");
    expect((await stock()).quantity).toBe("90.000000");
    const reopened = await get<CustomerOrderView>(`customer-orders/${order.id}`);
    expect(reopened).toMatchObject({ status: "open", lines: [{ fulfilled: "0.000000", posted: true }] });
    expect(await get<ShipmentView>(`shipments/${shipment.id}`)).toMatchObject({ status: "open", lines: [{ issued: "0.000000" }] });
    const edit = { customer: reopened.customer, location: reopened.location, version: reopened.version, lines: [{ id: reopened.lines[0].id, material, quantity: "80", unit: "each", requiredDate: "2026-11-02" }] };
    expect((await api("PATCH", `/api/tenants/prod/customer-orders/${order.id}`, edit)).body.error.code).toBe("CUSTOMER_ORDER_LOCKED");
    await operator.clickRole("link", "View reversal"); await operator.waitForText("Selected movement");
    expect(await operator.text("main")).toContain("View original");
    expect((await get<IssueView>(`goods-issues/${issue.id}`)).lines[0]).toMatchObject({ quantity: "80.000000", reversedBy: expect.any(String) });
  });
  it("lets an administrator reverse a correction in a narrow dialog and retains a read-only refusal", async () => {
    const correction = await correct("-2", "Reversal UI correction");
    const url = `${baseUrl}/admin/prod/stock?material=${material}&location=${location}&movement=${correction.id}`;
    await admin.setViewport(360, 800); await admin.open(url); await admin.waitForText("Selected movement");
    await admin.waitUntil(hydrated(`document.querySelector('section[aria-label="Selected movement"] button')`));
    await admin.click('section[aria-label="Selected movement"] button'); await admin.waitFor("[role=dialog]");
    expect(await admin.evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth`)).toBe(true);
    await admin.fillLabel("Reason", "Mistaken count");
    expect((await api("PATCH", "/api/tenants/prod", { readOnly: true })).status).toBe(200);
    try {
      await admin.clickRole("button", "Reverse full quantity"); await admin.waitFor("[role=dialog] [role=alert]");
      expect(await admin.evaluate<string>(`document.querySelector('[role=dialog] input[name=reason]').value`)).toBe("Mistaken count");
      expect((await api("POST", reversePath(correction.id), { reason: "Read-only" }, operatorSecret)).body.error.code).toBe("TENANT_READ_ONLY");
    } finally { await api("PATCH", "/api/tenants/prod", { readOnly: false }); }
    await admin.clickRole("button", "Reverse full quantity"); await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    expect((await stock()).quantity).toBe("90.000000"); await admin.setViewport(1280, 900);
    const test = (await api<{ generation: number }>("GET", "/api/tenants/test")).body.data;
    expect((await api("POST", reversePath(correction.id, "test"), { reason: "Stale" }, operatorSecret, randomUUID(), test.generation + 1)).body.error.code).toBe("GENERATION_STALE");
  });
  it("lets an operator reverse a goods receipt from its purchase order, reopening the order", async () => {
    const before = (await stock()).quantity;
    const completed = await create<OrderView>("purchase-orders", { supplier: purchase.supplier, location, lines: [{ material, quantity: "30", unit: "each", plannedDate: "2026-11-01" }] });
    const posted = await create<ReceiptView>("goods-receipts", { purchaseOrder: completed.id, lines: [{ line: 1, quantity: "30", unit: "each" }] });
    expect(await get<OrderView>(`purchase-orders/${completed.id}`)).toMatchObject({ status: "completed", lines: [{ received: "30.000000" }] });
    expect(Number((await stock()).quantity) - Number(before)).toBe(30);
    await operator.open(`${baseUrl}/admin/prod/purchase-orders/${completed.id}`); await operator.waitForText("Goods receipts");
    await operator.waitUntil(hydrated(`[...document.querySelectorAll("main button")].find((button) => button.textContent === "Reverse")`));
    await operator.clickRole("button", "Reverse"); await operator.waitFor("[role=dialog]");
    expect(await operator.text("[role=dialog]")).toContain("30 each");
    await operator.fillLabel("Reason", "Delivered to the wrong site"); await operator.clickRole("button", "Reverse full quantity");
    await operator.waitUntil(`!document.querySelector("[role=dialog]")`); await operator.waitForText("View reversal");
    expect((await stock()).quantity).toBe(before);
    expect(await get<OrderView>(`purchase-orders/${completed.id}`)).toMatchObject({ status: "open", lines: [{ received: "0.000000", status: "open" }] });
    expect((await get<ReceiptView>(`goods-receipts/${posted.id}`)).lines[0]).toMatchObject({ quantity: "30.000000", reversedBy: expect.any(String) });
  });
});
