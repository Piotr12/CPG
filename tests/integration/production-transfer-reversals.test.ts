import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { CompletionReversalResult, CompletionResult, CompletionView, ProductionOrderDetail, StockView, TransferDetailView, TransferReversalResult, TransferView, VarianceReportView } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin, signedInAndHydrated } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const suffix = randomUUID().slice(0, 8);
const username = `reversal92-${suffix}`;
const password = "reversal 92 normal user password";
const today = () => new Date().toISOString().slice(0, 10);
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
/** The button in the first row of the shown table named `table` whose text includes `row`. */
const rowButton = (table: string, row: string) => `(() => {
  const shown = [...document.querySelectorAll("main table")].find((t) => t.getAttribute("aria-label") === ${JSON.stringify(table)} && !t.closest("[hidden]"));
  return shown && [...shown.querySelectorAll("tbody tr")].find((r) => r.innerText.includes(${JSON.stringify(row)}))?.querySelector("button");
})()`;
const closed = `!document.querySelector("[role=dialog]") && !document.querySelector("[data-slot=dialog-overlay]")`;
const dialog = "[role=dialog][data-state=open]";

type Body<T> = { ok: boolean; data: T; error: { code: string; params?: Record<string, string> } };

// E11-S03: both roles reverse a whole completion and each kind of transfer posting, in the API and in a real browser.
describe("production completion and transfer posting reversals (#92)", () => {
  let admin: Browser;
  let operator: Browser;
  let adminSecret: string;
  let operatorSecret: string;
  const ids: Record<"bar" | "cocoa" | "wrapper" | "plant" | "depot", string> = {} as never;

  async function api<T>(method: string, path: string, body?: unknown, secret = adminSecret, key: string | undefined = randomUUID(), generation?: number) {
    const response = await callApi(baseUrl, method, path, secret, { body, key: method === "GET" ? undefined : key, generation });
    return { ...response, body: json(response) as Body<T> };
  }
  const ok = async <T>(method: string, path: string, body?: unknown, secret = adminSecret) => {
    const response = await api<T>(method, `/api/tenants/prod/${path}`, body, secret);
    expect(response.status, response.text).toBe(200);
    return response.body.data;
  };
  const physical = async (material: string, location = ids.plant) => (await ok<StockView>("GET", `stock?material=${material}&location=${location}`)).quantity;
  const order = (target: string) => ok<ProductionOrderDetail>("POST", "production-orders", { output: ids.bar, location: ids.plant, quantity: target, unit: "each", plannedFinish: "2026-11-02" });
  const complete = (orderId: string, output: string, cocoa: string, wrappers: string, acceptOverproduction = false) =>
    ok<CompletionResult>("POST", `production-orders/${orderId}/completions`, {
      quantity: output, unit: "each", components: [{ material: ids.cocoa, quantity: cocoa, unit: "kg" }, { material: ids.wrapper, quantity: wrappers, unit: "each" }],
      ...(acceptOverproduction ? { acceptOverproduction: true } : {}),
    });
  const correct = (material: string, quantity: string, location = ids.plant) =>
    ok("POST", "stock/corrections", { material, location, quantity, unit: material === ids.cocoa ? "kg" : "each", reason: `${username} count` });
  const transfer = (quantity: string) =>
    ok<TransferView>("POST", "transfers", { material: ids.cocoa, source: ids.plant, destination: ids.depot, quantity, unit: "kg", plannedDispatch: "2026-10-19", plannedArrival: "2026-10-22" });
  const post = (id: string, kind: "dispatches" | "receipts" | "write-offs", quantity: string) =>
    ok<{ posting: { id: string } }>("POST", `transfers/${id}/${kind}`, { quantity, unit: "kg", ...(kind === "write-offs" ? { reason: "Lost on the road" } : {}) });
  const completionReverse = (orderId: string, completion: string) => `/api/tenants/prod/production-orders/${orderId}/completions/${completion}/reverse`;
  const postingReverse = (id: string, posting: string) => `/api/tenants/prod/transfers/${id}/postings/${posting}/reverse`;

  beforeAll(async () => {
    [admin, operator] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, inject("adminPassword"));
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, `${username}-admin`);
    expect((await api("POST", "/api/users", { username, password })).status).toBe(200);
    await signIn(operator, baseUrl, password, username);
    await operator.waitUntil(signedInAndHydrated(username));
    await openTokens(operator, baseUrl);
    operatorSecret = await createToken(operator, `${username}-operator`);
    const master = async (kind: string, body: unknown) => (await ok<{ id: string }>("POST", kind, body)).id;
    ids.bar = await master("materials", { type: "finished", description: `${username} bar`, baseUnit: "each" });
    ids.cocoa = await master("materials", { type: "raw", description: `${username} cocoa`, baseUnit: "kg" });
    ids.wrapper = await master("materials", { type: "raw", description: `${username} wrapper`, baseUnit: "each" });
    ids.plant = await master("locations", { name: `${username} plant` });
    ids.depot = await master("locations", { name: `${username} depot` });
    await ok("POST", "planning-parameters", { material: ids.bar, location: ids.plant, procurement: "make", leadTimeDays: 3, minimumQuantity: "1", lotMultiple: "1" });
    await ok("POST", "boms", { output: ids.bar, priority: 1, validFrom: "2026-01-01", validThrough: null,
      components: [{ material: ids.cocoa, quantity: "0.5", unit: "kg" }, { material: ids.wrapper, quantity: "2", unit: "each" }] });
    await correct(ids.cocoa, "500");
    await correct(ids.wrapper, "1000");
  });

  afterAll(async () => {
    if (adminSecret) {
      await api("PATCH", "/api/tenants/prod", { readOnly: false });
      for (const secret of [adminSecret, operatorSecret].filter(Boolean)) {
        const tokens = (await api<{ id: string; name: string }[]>("GET", "/api/tokens", undefined, secret)).body.data;
        for (const token of tokens.filter(({ name }) => name.startsWith(username))) await api("DELETE", `/api/tokens/${token.id}`, undefined, secret);
      }
    }
    await Promise.all([admin?.close(), operator?.close()]);
  });

  it("reverses one completion of two atomically once, refusing short output, partial and read-only requests, and the variance report drops it (REV-011/012/014/017/019)", async () => {
    const planned = await order("50");
    await complete(planned.id, "40", "20", "80");
    const second = (await complete(planned.id, "25", "12.5", "50", true)).completion;
    expect((await ok<ProductionOrderDetail>("GET", `production-orders/${planned.id}`)).status).toBe("completed");
    await correct(ids.bar, "-41");
    const before = [await physical(ids.bar), await physical(ids.cocoa), await physical(ids.wrapper)];

    const short = await api("POST", completionReverse(planned.id, second.id), { reason: "Entered twice" }, operatorSecret);
    expect(short.status).toBe(409);
    expect(short.body.error).toMatchObject({ code: "INSUFFICIENT_STOCK", params: { material: ids.bar, available: "24.000000", requested: "25.000000" } });
    expect((await api("POST", completionReverse(planned.id, second.id), { reason: "Partial", quantity: "5" })).body.error.code).toBe("VALIDATION_FAILED");
    expect([await physical(ids.bar), await physical(ids.cocoa), await physical(ids.wrapper)]).toEqual(before);
    expect((await ok<ProductionOrderDetail>("GET", `production-orders/${planned.id}`)).produced).toBe("65.000000");

    await correct(ids.bar, "1");
    expect((await api("PATCH", "/api/tenants/prod", { readOnly: true })).status).toBe(200);
    try {
      expect((await api("POST", completionReverse(planned.id, second.id), { reason: "Entered twice" }, operatorSecret)).body.error.code).toBe("TENANT_READ_ONLY");
    } finally {
      await api("PATCH", "/api/tenants/prod", { readOnly: false });
    }
    const key = randomUUID();
    const reversed = await api<CompletionReversalResult>("POST", completionReverse(planned.id, second.id), { reason: "Entered twice" }, operatorSecret, key);
    expect(reversed.status).toBe(200);
    expect(reversed.body.data.order).toMatchObject({ produced: "40.000000", status: "open", outstanding: "10.000000" });
    expect(reversed.body.data.movements.map(({ material, quantity, businessDate }) => [material, quantity, businessDate])).toEqual([
      [ids.bar, "-25.000000", today()], [ids.cocoa, "12.500000", today()], [ids.wrapper, "50.000000", today()],
    ]);
    const replay = await api("POST", completionReverse(planned.id, second.id), { reason: "Entered twice" }, operatorSecret, key);
    expect(replay.replayed).toBe("true");
    expect(replay.text).toBe(reversed.text);
    const again = await api("POST", completionReverse(planned.id, second.id), { reason: "Again" });
    expect(again.body.error).toMatchObject({ code: "PRODUCTION_COMPLETION_ALREADY_REVERSED", params: { reversal: reversed.body.data.movements[0].postingId } });
    expect(await physical(ids.bar)).toBe("0.000000");
    const history = await ok<CompletionView[]>("GET", `production-orders/${planned.id}/completions`);
    expect(history.map(({ id, reversal }) => [id, reversal?.reason ?? null])).toEqual([[second.id, "Entered twice"], [history[1].id, null]]);
    // The variance report, read by the user who reversed it, counts the 40 only and lists the 25 as reversed (#145).
    const variance = await ok<VarianceReportView>("GET", `reports/variance?material=${ids.bar}`, undefined, operatorSecret);
    const row = variance.rows.find(({ id }) => id === planned.id)!;
    expect(row).toMatchObject({ status: "open", target: "50.000000", produced: "40.000000", outputVariance: "-10.000000", completions: 1, wasteCompletions: 0, reversed: [second.id] });
    expect(row.components.map(({ material, expected, actual }) => [material, expected, actual])).toEqual([
      [ids.cocoa, "20.000000", "20.000000"], [ids.wrapper, "80.000000", "80.000000"],
    ]);
    // A completed Test order whose ID Prod doesn't have (Test's tiny dataset holds 100+ production orders, far more
    // than this suite makes in Prod): Prod must neither find it nor reverse its completion.
    const allOrders = async (tenant: string) => {
      const all: { id: string; status: string }[] = [];
      for (let page = 1; all.length === (page - 1) * 100; page += 1) {
        all.push(...(await api<{ id: string; status: string }[]>("GET", `/api/tenants/${tenant}/production-orders?page=${page}`)).body.data);
      }
      return all;
    };
    const prodIds = new Set((await allOrders("prod")).map(({ id }) => id));
    const candidate = (await allOrders("test")).findLast(({ id, status }) => status === "completed" && !prodIds.has(id));
    expect(candidate, "a completed Test production order with an ID Prod lacks").toBeDefined();
    const testOrder = candidate!.id;
    const [testCompletion] = (await api<CompletionView[]>("GET", `/api/tenants/test/production-orders/${testOrder}/completions`)).body.data;
    expect((await api("GET", `/api/tenants/prod/production-orders/${testOrder}`)).status).toBe(404);
    expect((await api("POST", completionReverse(testOrder, testCompletion.id), { reason: "Wrong tenant" }, operatorSecret)).status).toBe(404);
    expect((await api<CompletionView[]>("GET", `/api/tenants/test/production-orders/${testOrder}/completions`)).body.data[0]).toEqual(testCompletion);
  });

  it("unwinds a transfer receipts and write-offs first, reopening it from Closed Early, then its dispatch (TRF-019/020/021/025/027)", async () => {
    const moved = await transfer("60");
    const dispatch = (await post(moved.id, "dispatches", "60")).posting;
    const receipt = (await post(moved.id, "receipts", "50")).posting;
    const blocked = await api("POST", postingReverse(moved.id, dispatch.id), { reason: "Wrong route" }, operatorSecret);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({ code: "TRANSFER_REVERSAL_ORDER", params: { transfer: moved.id, received: "50.000000", writtenOff: "0.000000", unit: "kg" } });
    const loss = (await post(moved.id, "write-offs", "10")).posting;
    const detail = await ok<TransferDetailView>("GET", `transfers/${moved.id}`);
    const closed = await ok<TransferView>("POST", `transfers/${moved.id}/close-early`, { version: detail.version });
    expect(closed).toMatchObject({ status: "closed-early", abandoned: "10.000000", inTransit: "0.000000" });

    const found = await ok<TransferReversalResult>("POST", `transfers/${moved.id}/postings/${loss.id}/reverse`, { reason: "Pallet found" }, operatorSecret);
    expect(found.transfer).toMatchObject({ status: "open", abandoned: "0.000000", writtenOff: "0.000000", inTransit: "10.000000" });
    expect(found.reversal.legs).toEqual([{ place: "transit", location: null, quantity: "10.000000", before: "0.000000", after: "10.000000" }]);
    const back = await ok<TransferReversalResult>("POST", `transfers/${moved.id}/postings/${receipt.id}/reverse`, { reason: "Received on the wrong transfer" });
    expect(back.transfer).toMatchObject({ received: "0.000000", inTransit: "60.000000" });
    expect(await physical(ids.cocoa, ids.depot)).toBe("0.000000");
    const cocoaBefore = await physical(ids.cocoa);
    const undone = await ok<TransferReversalResult>("POST", `transfers/${moved.id}/postings/${dispatch.id}/reverse`, { reason: "Wrong route" });
    expect(undone.transfer).toMatchObject({ dispatched: "0.000000", inTransit: "0.000000", status: "open" });
    expect(Number(await physical(ids.cocoa)) - Number(cocoaBefore)).toBe(60);
    const final = await ok<TransferDetailView>("GET", `transfers/${moved.id}`);
    expect(final.reversals.map(({ kind }) => kind)).toEqual(["dispatch", "receipt", "write-off"]);
    expect(final.postings.every(({ reversedBy, canReverse }) => reversedBy !== null && !canReverse)).toBe(true);
    expect((await api("POST", `/api/tenants/prod/transfers/${moved.id}/cancel`, { version: final.version })).body.error.code).toBe("DOCUMENT_PROCESSED");
  });

  it("lets a normal user reverse a completion from its history, at phone width", async () => {
    const planned = await order("10");
    const posted = (await complete(planned.id, "10", "5", "20")).completion;
    await operator.setViewport(360, 800);
    try {
      await operator.open(`${baseUrl}/admin/prod/production-orders/${planned.id}`);
      await operator.waitUntil(ready(rowButton("Completions", posted.id)));
      await operator.evaluate(`(${rowButton("Completions", posted.id)}).click()`);
      await operator.waitFor(dialog);
      const text = await operator.text(dialog);
      expect(text).toContain(`Reverse completion ${posted.id}?`);
      expect(text).toContain("-10 each");
      expect(text).toContain("+5 kg");
      expect(text).toContain("+20 each");
      expect(await operator.evaluate<number>(`document.querySelectorAll('${dialog} input, ${dialog} textarea').length`)).toBe(1);
      expect(await operator.evaluate<boolean>("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
      await operator.fillLabel("Reason", "Posted on the wrong order");
      await operator.clickRole("button", "Reverse completion");
      await operator.waitUntil(closed);
      await operator.waitForText("Posted on the wrong order");
    } finally {
      await operator.setViewport(1280, 900);
    }
    expect(await ok<ProductionOrderDetail>("GET", `production-orders/${planned.id}`)).toMatchObject({ produced: "0.000000", status: "open" });
  });

  it("lets a normal user reverse a transfer receipt from the ledger once its dispatch shows it must wait", async () => {
    const moved = await transfer("20");
    await post(moved.id, "dispatches", "20");
    await post(moved.id, "receipts", "20");
    await operator.open(`${baseUrl}/admin/prod/transfers/${moved.id}`);
    await operator.waitForText("Reverse receipts and write-offs first");
    await operator.waitUntil(ready(rowButton("Ledger", "Receipt")));
    await operator.evaluate(`(${rowButton("Ledger", "Receipt")}).click()`);
    await operator.waitFor(dialog);
    expect(await operator.text(dialog)).toContain("Reverse this receipt?");
    await operator.fillLabel("Reason", "Received on the wrong transfer");
    await operator.clickRole("button", "Reverse in full");
    await operator.waitUntil(closed);
    await operator.waitForText("Receipt reversal");
    expect(await ok<TransferView>("GET", `transfers/${moved.id}`)).toMatchObject({ status: "open", received: "0.000000", inTransit: "20.000000" });
  });
});
