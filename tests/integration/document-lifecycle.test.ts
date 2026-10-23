import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");
const root = "/api/tenants/prod";
const dialog = '[role="dialog"][data-state="open"]';
const userPassword = "lifecycle-integration-password";

describe("document cancellation and early closure", () => {
  let admin: Browser;
  let user: Browser;
  let secret: string;
  let userSecret: string;
  let material: string;
  let output: string;
  let location: string;
  let destination: string;
  let customer: string;
  let supplier: string;
  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}, token = secret) => callApi(baseUrl, method, path, token, options);
  const write = (path: string, body: unknown, token = userSecret) => api("POST", path, { body, key: randomUUID() }, token);
  const get = async (concept: string, id: string) => json(await api("GET", `${root}/${concept}/${id}`)).data;
  const create = async (concept: string, body: unknown, token = userSecret) => {
    const response = await write(`${root}/${concept}`, body, token);
    expect(response.status, response.text).toBe(200);
    return json(response).data;
  };
  const requisition = () => create("purchase-requisitions", { material, location, quantity: "10", unit: "kg", requiredDate: "2027-01-02" });
  const po = (lines = [{ material, quantity: "10", unit: "kg", plannedDate: "2027-01-02" }]) => create("purchase-orders", { supplier, location, lines });
  const co = () => create("customer-orders", { customer, location, lines: [1, 2].map(() => ({ material, quantity: "10", unit: "kg", requiredDate: "2027-01-02" })) });
  const production = () => create("production-orders", { output, location, quantity: "10", unit: "each", plannedFinish: "2027-01-02" });
  const transfer = () => create("transfers", { material, source: location, destination, quantity: "10", unit: "kg", plannedDispatch: "2027-01-02", plannedArrival: "2027-01-03" });
  const correct = async () => {
    const change = 100 - Number((await stock()).quantity);
    if (change !== 0) expect((await write(`${root}/stock/corrections`, { material, location, quantity: String(change), unit: "kg", reason: "Lifecycle opening stock" }, secret)).status).toBe(200);
  };
  const stock = async () => json(await api("GET", `${root}/stock?material=${material}&location=${location}`)).data;
  const open = async (concept: string, id?: string) => {
    await user.open(`${baseUrl}/admin/prod/${concept}${id ? `/${id}` : ""}`);
    await user.waitUntil('document.querySelector("main") && Object.keys(document.querySelector("main")).some((key) => key.startsWith("__reactFiber"))');
  };
  const confirm = async (name: string, expected?: string) => {
    await user.waitUntil(`[...document.querySelectorAll("main button")].some((button) => button.getAttribute("aria-label") === ${JSON.stringify(name)} && Object.keys(button).some((key) => key.startsWith("__reactFiber")))`);
    await user.clickRole("button", name);
    await user.waitFor(dialog);
    expect(await user.text(dialog)).toContain("This cannot be reopened manually.");
    if (expected) expect(await user.text(dialog)).toContain(expected);
    await user.click(`${dialog} button[type=submit]`);
    await user.waitUntil('![...document.querySelectorAll("[role=dialog]")].some((element) => element.getClientRects().length)');
  };

  beforeAll(async () => {
    admin = openBrowser(); user = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl); secret = await createToken(admin, "lifecycle-admin");
    expect((await write("/api/users", { username: "lifecycle-lee", password: userPassword }, secret)).status).toBe(200);
    await signIn(user, baseUrl, userPassword, "lifecycle-lee");
    await openTokens(user, baseUrl); userSecret = await createToken(user, "lifecycle-user");
    material = (await create("materials", { type: "raw", description: "Lifecycle steel", baseUnit: "kg" }, secret)).id;
    output = (await create("materials", { type: "finished", description: "Lifecycle cabinet", baseUnit: "each" }, secret)).id;
    location = (await create("locations", { name: "Lifecycle plant" }, secret)).id;
    destination = (await create("locations", { name: "Lifecycle warehouse" }, secret)).id;
    customer = (await create("customers", { name: "Lifecycle customer" }, secret)).id;
    supplier = (await create("suppliers", { name: "Lifecycle supplier" }, secret)).id;
    await create("planning-parameters", { material: output, location, procurement: "make", leadTimeDays: 1, minimumQuantity: "1", lotMultiple: "1" }, secret);
    await create("boms", { output, priority: 1, validFrom: "2026-01-01", validThrough: null, components: [{ material, quantity: "1", unit: "kg" }] }, secret);
    await correct();
  });
  afterAll(async () => {
    if (secret) await api("PATCH", root, { key: randomUUID(), body: { readOnly: false } });
    try {
      for (const [token, name] of [[secret, "lifecycle-admin"], [userSecret, "lifecycle-user"]]) {
        if (!token) continue;
        const own = (json(await api("GET", "/api/tokens", {}, token)).data as { id: string; name: string }[]).find((entry) => entry.name === name);
        if (own) expect((await api("DELETE", `/api/tokens/${own.id}`, { key: randomUUID() }, token)).status).toBe(200);
      }
    } finally { await Promise.all([admin?.close(), user?.close()]); }
  });

  it("cancels all five unprocessed document types, replays the key and retains a single audited transition", async () => {
    const documents = [["purchase-requisitions", await requisition()], ["purchase-orders", await po()], ["customer-orders", await co()],
      ["production-orders", await production()], ["transfers", await transfer()]] as const;
    for (const [concept, document] of documents) {
      const path = `${root}/${concept}/${document.id}/cancel`;
      const body = { version: document.version };
      expect((await api("POST", path, { body }, userSecret)).status).toBe(400);
      expect((await write(path, {}, userSecret)).status).toBe(400);
      const key = randomUUID();
      const first = await api("POST", path, { body, key }, userSecret);
      expect(first.status, first.text).toBe(200); expect(json(first).data.status).toBe("cancelled");
      const replay = await api("POST", path, { body, key }, userSecret);
      expect(replay.replayed).toBe("true"); expect(replay.text).toBe(first.text);
      const current = await get(concept, document.id);
      expect((await write(path, { version: current.version })).status).toBe(409);
      if (current.lines) expect(current.lines.every((line: { status: string; abandoned: string }) => line.status === "cancelled" && line.abandoned === "10.000000")).toBe(true);
      else expect(current).toMatchObject({ abandoned: "10.000000", outstanding: "0.000000" });
    }
    const audit = json(await api("GET", `${root}/audit`)).data;
    const events = Array.isArray(audit) ? audit : audit.entries;
    expect(events.filter((event: { action: string }) => event.action.endsWith(".cancelled"))).toHaveLength(5);
  });

  it("closes a partly converted requisition from its row and preserves the purchase order", async () => {
    const source = await requisition();
    const order = await create("purchase-orders", { supplier, location, lines: [{ material, quantity: "4", unit: "kg", plannedDate: "2027-01-02", requisition: source.id }] });
    await open("purchase-requisitions");
    await confirm(`Close Early — Purchase requisitions ${source.id}`, "6 kg");
    expect(await get("purchase-requisitions", source.id)).toMatchObject({ status: "closed-early", converted: "4.000000", abandoned: "6.000000", outstanding: "0.000000" });
    expect((await get("purchase-orders", order.id)).lines[0]).toMatchObject({ quantity: "4.000000", requisition: source.id });
  });

  it("resolves customer lines independently and closes linked shipments without reversing stock", async () => {
    await correct();
    const order = await co();
    const shipment = await create("shipments", { customerOrder: order.id, plannedDate: "2027-01-02", lines: order.lines.map((line: { id: string }) => ({ orderLine: line.id, quantity: "10", unit: "kg" })) });
    await create("goods-issues", { shipment: shipment.id, lines: [{ line: 1, quantity: "4", unit: "kg" }] });
    const partial = await get("customer-orders", order.id);
    expect((await write(`${root}/customer-orders/${order.id}/cancel`, { version: partial.version })).status).toBe(409);
    await open("customer-orders", order.id);
    await confirm(`Cancel — Customer orders ${order.id} — Line 2`, "10 kg");
    expect((await get("customer-orders", order.id)).status).toBe("open");
    await confirm(`Close Early — Customer orders ${order.id}`, "6 kg");
    const closed = await get("customer-orders", order.id);
    expect(closed.status).toBe("closed-early");
    expect(closed.lines.map((line: { status: string; fulfilled: string; abandoned: string }) => [line.status, line.fulfilled, line.abandoned]))
      .toEqual([["closed-early", "4.000000", "6.000000"], ["cancelled", "0.000000", "10.000000"]]);
    expect((await get("shipments", shipment.id)).status).toBe("completed");
    expect((await stock()).quantity).toBe("96.000000");
  });

  it("keeps a cancellation conflict visible when another editor removes the selected customer-order line", async () => {
    const order = await co();
    await open("customer-orders", order.id);
    const label = `Cancel — Customer orders ${order.id} — Line 2`;
    await user.waitUntil(`[...document.querySelectorAll("main button")].some((button) => button.getAttribute("aria-label") === ${JSON.stringify(label)} && Object.keys(button).some((key) => key.startsWith("__reactFiber")))`);
    await user.clickRole("button", label); await user.waitFor(dialog);
    const retained = order.lines[0];
    const edited = await api("PATCH", `${root}/customer-orders/${order.id}`, { key: randomUUID(), body: {
      version: order.version, customer, location,
      lines: [{ id: retained.id, material, quantity: "10", unit: "kg", requiredDate: "2027-01-02" }],
    } });
    expect(edited.status, edited.text).toBe(200);
    await user.click(`${dialog} button[type=submit]`); await user.waitFor(`${dialog} [role=alert]`);
    expect(await user.text(`${dialog} [role=alert]`)).toContain("changed");
    expect(await user.text(dialog)).toContain("Line 2");
    expect((await get("customer-orders", order.id)).lines).toHaveLength(1);
    await user.clickRole("button", "Keep open");
    await open("customer-orders", order.id);
    expect(await user.evaluate<boolean>(`[...document.querySelectorAll("main button")].some((button) => button.getAttribute("aria-label") === ${JSON.stringify(label)})`)).toBe(false);
  });

  it("preserves PO overreceipt and derives Closed Early for mixed completed/cancelled lines", async () => {
    const order = await po([1, 2].map(() => ({ material, quantity: "10", unit: "kg", plannedDate: "2027-01-02" })));
    await create("goods-receipts", { purchaseOrder: order.id, lines: [{ line: 1, quantity: "10", unit: "kg" }] });
    await create("goods-receipts", { purchaseOrder: order.id, lines: [{ line: 1, quantity: "1", unit: "kg" }] });
    const partial = await get("purchase-orders", order.id);
    expect(partial.lines[0]).toMatchObject({ status: "completed", received: "11.000000" });
    const cancelled = await write(`${root}/purchase-orders/${order.id}/cancel`, { version: partial.version, lines: [2] }, secret);
    expect(cancelled.status).toBe(200); expect(json(cancelled).data.status).toBe("closed-early");
    const another = await po();
    await create("goods-receipts", { purchaseOrder: another.id, lines: [{ line: 1, quantity: "3", unit: "kg" }] });
    await open("purchase-orders", another.id);
    await confirm(`Close Early — Purchase orders ${another.id}`, "7 kg");
    expect((await get("purchase-orders", another.id)).lines[0]).toMatchObject({ received: "3.000000", abandoned: "7.000000", outstanding: "0.000000", status: "closed-early" });
  });

  it("keeps reversal history authoritative for cancellation and closed remainders in both order types", async () => {
    await correct();
    for (const concept of ["purchase-orders", "customer-orders"]) {
      const order = concept === "purchase-orders" ? await po() : await co();
      const shipment = concept === "customer-orders" ? await create("shipments", { customerOrder: order.id, plannedDate: "2027-01-02",
        lines: [{ orderLine: order.lines[0].id, quantity: "10", unit: "kg" }] }) : null;
      const posting = concept === "purchase-orders"
        ? await create("goods-receipts", { purchaseOrder: order.id, lines: [{ line: 1, quantity: "4", unit: "kg" }] })
        : await create("goods-issues", { shipment: shipment.id, lines: [{ line: 1, quantity: "4", unit: "kg" }] });
      expect((await write(`${root}/stock/movements/${posting.lines[0].movementId}/reverse`, { reason: "Lifecycle reversal regression" })).status).toBe(200);
      const current = await get(concept, order.id);
      expect(json(await write(`${root}/${concept}/${order.id}/cancel`, { version: current.version })).error.code).toBe("DOCUMENT_PROCESSED");
      await open(concept, order.id);
      const title = concept === "purchase-orders" ? "Purchase orders" : "Customer orders";
      await confirm(`Close Early — ${title} ${order.id}`, "10 kg");
      const closed = await get(concept, order.id);
      expect(closed.status).toBe("closed-early");
      expect(closed.lines[0]).toMatchObject({ status: "closed-early", abandoned: "10.000000" });
      if (shipment) expect(await get("shipments", shipment.id)).toMatchObject({ status: "completed", lines: [{ toIssue: "0.000000" }] });
      else expect(closed.lines[0].outstanding).toBe("0.000000");
    }
  });

  it("does not restore issuable quantities when a closed customer line is reversed with an open sibling", async () => {
    await correct(); const order = await co();
    const shipment = await create("shipments", { customerOrder: order.id, plannedDate: "2027-01-02", lines: [{ orderLine: order.lines[0].id, quantity: "10", unit: "kg" }] });
    const issue = await create("goods-issues", { shipment: shipment.id, lines: [{ line: 1, quantity: "4", unit: "kg" }] });
    const partial = await get("customer-orders", order.id);
    expect((await write(`${root}/customer-orders/${order.id}/close-early`, { version: partial.version, lines: [order.lines[0].id] })).status).toBe(200);
    expect((await write(`${root}/stock/movements/${issue.lines[0].movementId}/reverse`, { reason: "Reverse after closure" })).status).toBe(200);
    expect(await get("customer-orders", order.id)).toMatchObject({ status: "open", lines: [{ status: "closed-early", fulfilled: "0.000000", abandoned: "6.000000" }, { status: "open" }] });
    expect(await get("shipments", shipment.id)).toMatchObject({ status: "completed", lines: [{ toIssue: "0.000000" }] });
    expect((await write(`${root}/goods-issues`, { shipment: shipment.id, lines: [{ line: 1, quantity: "1", unit: "kg" }] })).status).toBe(409);
    await user.setViewport(390, 844);
    try {
      await open("customer-orders", order.id);
      await user.waitFor('table[aria-label="Lines"] tbody td');
      expect(await user.evaluate<number>(`document.querySelector('table[aria-label="Lines"] tbody td').getBoundingClientRect().width`)).toBeGreaterThanOrEqual(128);
      expect(await user.evaluate<boolean>('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
      await user.clickRole("button", `Close Early — Customer orders ${order.id}`);
      await user.waitFor(dialog);
      expect(await user.evaluate<boolean>(`(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const title = dialog.querySelector('[data-slot="dialog-title"]');
        const close = dialog.querySelector('[data-slot="dialog-close"]').getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(title);
        return [...range.getClientRects()].every((rect) => rect.right <= close.left || rect.top >= close.bottom);
      })()`)).toBe(true);
      await user.clickRole("button", "Keep open");
    } finally { await user.setViewport(1280, 900); }

  });

  it("treats zero-output waste as processing and closes production without changing consumed stock", async () => {
    await correct(); const order = await production();
    await write(`${root}/production-orders/${order.id}/completions`, { quantity: "0", unit: "each", components: [{ material, quantity: "2", unit: "kg" }] });
    const partial = await get("production-orders", order.id);
    expect(partial.hasProcessing).toBe(true);
    expect(json(await write(`${root}/production-orders/${order.id}/cancel`, { version: partial.version })).error.code).toBe("DOCUMENT_PROCESSED");
    await open("production-orders", order.id);
    await confirm(`Close Early — Production orders ${order.id}`, "10 each");
    expect(await get("production-orders", order.id)).toMatchObject({ status: "closed-early", produced: "0.000000", abandoned: "10.000000", outstanding: "0.000000" });
    expect((await stock()).quantity).toBe("98.000000");
  });

  it("shows the transit refusal, then closes a loss-settled transfer on a narrow screen", async () => {
    await correct(); const order = await transfer();
    expect((await write(`${root}/transfers/${order.id}/dispatches`, { quantity: "10", unit: "kg" })).status).toBe(200);
    await user.setViewport(390, 844); await open("transfers", order.id);
    await user.clickRole("button", `Close Early — Transfers ${order.id}`); await user.waitFor(dialog);
    expect(await user.text(dialog)).toContain("10 kg still in transit");
    await user.click(`${dialog} button[type=submit]`); await user.waitFor(`${dialog} [role=alert]`);
    expect(await user.text(`${dialog} [role=alert]`)).toContain("10.000000 kg still in transit");
    expect(await user.evaluate<boolean>("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    await user.clickRole("button", "Keep open");
    expect((await write(`${root}/transfers/${order.id}/receipts`, { quantity: "8", unit: "kg" })).status).toBe(200);
    expect((await write(`${root}/transfers/${order.id}/write-offs`, { quantity: "2", unit: "kg", reason: "Lost" })).status).toBe(200);
    await open("transfers", order.id); await confirm(`Close Early — Transfers ${order.id}`, "2 kg");
    expect(await get("transfers", order.id)).toMatchObject({ status: "closed-early", received: "8.000000", writtenOff: "2.000000", abandoned: "2.000000", inTransit: "0.000000", outstanding: "0.000000" });
    expect((await stock()).quantity).toBe("90.000000"); await user.setViewport(1280, 800);
  });

  it("refuses stale versions, read-only mutations and missing/stale Test generations", async () => {
    const order = await requisition();
    expect(json(await write(`${root}/purchase-requisitions/${order.id}/cancel`, { version: order.version + 1 })).error.code).toBe("VERSION_CONFLICT");
    expect((await api("PATCH", root, { key: randomUUID(), body: { readOnly: true } })).status).toBe(200);
    try {
      expect(json(await write(`${root}/purchase-requisitions/${order.id}/cancel`, { version: order.version })).error.code).toBe("TENANT_READ_ONLY");
      await open("purchase-requisitions");
      expect(await user.evaluate<number>('[...document.querySelectorAll("main button")].filter((button) => /^(Cancel|Close Early|Change date)/.test(button.textContent)).length')).toBe(0);
    } finally { await api("PATCH", root, { key: randomUUID(), body: { readOnly: false } }); }
    const testPath = "/api/tenants/test/purchase-requisitions/99999999/cancel";
    const tenant = json(await api("GET", "/api/tenants/test")).data;
    expect((await api("POST", testPath, { key: randomUUID(), body: { version: 1 } }, userSecret)).status).toBe(428);
    expect(json(await api("POST", testPath, { key: randomUUID(), body: { version: 1 }, generation: tenant.generation + 1 }, userSecret)).error.code).toBe("GENERATION_STALE");
    expect((await api("POST", testPath, { key: randomUUID(), body: { version: 1 }, generation: tenant.generation }, userSecret)).status).toBe(404);
    expect((await get("purchase-requisitions", order.id)).status).toBe("open");
  });
});
