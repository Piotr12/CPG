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
  const transfer = (quantity = "10") => create("transfers", { material, source: location, destination, quantity, unit: "kg", plannedDispatch: "2027-01-02", plannedArrival: "2027-01-03" });
  const correct = async () => {
    const change = 100 - Number((await stock()).quantity);
    if (change !== 0) expect((await write(`${root}/stock/corrections`, { material, location, quantity: String(change), unit: "kg", reason: "Lifecycle opening stock" }, secret)).status).toBe(200);
  };
  const stock = async (at = location) => json(await api("GET", `${root}/stock?material=${material}&location=${at}`)).data;
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
    // Other files cancel Prod documents too: count only this test's own, once each.
    const cancelled = (concept: string, id: string) =>
      events.filter((event: { action: string; subject: { id: string } }) => event.action === `${concept}.${concept.slice(0, -1)}.cancelled` && event.subject.id === id);
    for (const [concept, document] of documents) expect(cancelled(concept, document.id), concept).toHaveLength(1);
  });

  it("posts a goods issue of stock an open production order needs, with no reservation in the way, and the order then shows the shortage (UX-026)", async () => {
    await correct();
    // A production order needing every kg on hand: 100 each at 1 kg each.
    const made = await create("production-orders", { output, location, quantity: "100", unit: "each", plannedFinish: "2027-01-02" });
    expect((await get("production-orders", made.id)).components).toEqual([
      expect.objectContaining({ material, required: "100.000000", available: "100.000000", shortage: "0.000000" }),
    ]);
    try {
      const order = await co();
      const shipment = await create("shipments", { customerOrder: order.id, plannedDate: "2027-01-02", lines: [{ orderLine: order.lines[0].id, quantity: "10", unit: "kg" }] });

      const issued = await write(`${root}/goods-issues`, { shipment: shipment.id, lines: [{ line: 1, quantity: "10", unit: "kg" }] });
      expect(issued.status, issued.text).toBe(200);
      expect((await stock()).quantity).toBe("90.000000");
      // The order still plans the whole 100 and now shows the 10 kg the issue took; the next MRP run
      // reports it as a shortage (slice 3, #14).
      expect(await get("production-orders", made.id)).toMatchObject({
        status: "open", outstanding: "100.000000",
        components: [expect.objectContaining({ material, required: "100.000000", available: "90.000000", shortage: "10.000000" })],
      });
    } finally {
      // The later tests plan from this file's stock: leave no open order needing it.
      expect((await write(`${root}/production-orders/${made.id}/cancel`, { version: (await get("production-orders", made.id)).version })).status).toBe(200);
    }
  });

  // Customer orders and transfers are closed over the API above and in production-transfer-reversals.test.ts (#192).
  it("closes a part-received purchase order, a part-converted requisition and a part-made production order early over the API, audited once, refusing the stale version", async () => {
    await correct();
    const order = await po();
    await create("goods-receipts", { purchaseOrder: order.id, lines: [{ line: 1, quantity: "4", unit: "kg" }] });
    const source = await requisition();
    await create("purchase-orders", { supplier, location, lines: [{ material, quantity: "4", unit: "kg", plannedDate: "2027-01-02", requisition: source.id }] });
    const made = await production();
    expect((await write(`${root}/production-orders/${made.id}/completions`, { quantity: "4", unit: "each", components: [{ material, quantity: "4", unit: "kg" }] })).status).toBe(200);

    for (const [concept, id, subjectType, remainder] of [
      ["purchase-orders", order.id, "PurchaseOrder", { lines: [{ status: "closed-early", received: "4.000000", abandoned: "6.000000" }] }],
      ["purchase-requisitions", source.id, "PurchaseRequisition", { converted: "4.000000", abandoned: "6.000000", outstanding: "0.000000" }],
      ["production-orders", made.id, "ProductionOrder", { produced: "4.000000", abandoned: "6.000000", outstanding: "0.000000" }],
    ] as const) {
      const path = `${root}/${concept}/${id}/close-early`;
      const loaded = await get(concept, id);
      const closed = await write(path, { version: loaded.version });
      expect(closed.status, closed.text).toBe(200);
      expect(json(closed).data, concept).toMatchObject({ id, status: "closed-early", ...remainder });
      expect(await get(concept, id), concept).toMatchObject({ status: "closed-early", ...remainder });

      const stale = await write(path, { version: loaded.version });
      expect(stale.status, concept).toBe(409);
      expect(json(stale).error.code, concept).toBe("VERSION_CONFLICT");

      const entries = json(await api("GET", `${root}/audit?subjectType=${subjectType}&subjectId=${id}`)).data.entries as {
        action: string; channel: string; actor: { username: string }; token: { name: string } | null; after: Record<string, unknown> | null;
      }[];
      const closures = entries.filter(({ action }) => action === `${concept}.${concept.slice(0, -1)}.closed-early`);
      expect(closures, concept).toHaveLength(1);
      expect(closures[0], concept).toMatchObject({ channel: "api", actor: { username: "lifecycle-lee" }, token: { name: "lifecycle-user" } });
    }
  });

  it("closes a partly converted requisition from its row and preserves the purchase order", async () => {
    const source = await requisition();
    const order = await create("purchase-orders", { supplier, location, lines: [{ material, quantity: "4", unit: "kg", plannedDate: "2027-01-02", requisition: source.id }] });
    // The newest requisition is on the list's last page, which a page past it shows (#187).
    await open("purchase-requisitions?page=1000000");
    await confirm(`Close requisition early… — Purchase requisitions ${source.id}`, "6 kg");
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
    await confirm(`Cancel line… — Customer orders ${order.id} — Line 2`, "10 kg");
    expect((await get("customer-orders", order.id)).status).toBe("open");
    await confirm(`Close order early… — Customer orders ${order.id}`, "6 kg");
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
    const label = `Cancel line… — Customer orders ${order.id} — Line 2`;
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

  it("preserves PO overreceipt and derives Closed Early for mixed completed/cancelled lines, keeping received stock (BUY-017)", async () => {
    const order = await po([1, 2].map(() => ({ material, quantity: "10", unit: "kg", plannedDate: "2027-01-02" })));
    await create("goods-receipts", { purchaseOrder: order.id, lines: [{ line: 1, quantity: "10", unit: "kg" }] });
    await create("goods-receipts", { purchaseOrder: order.id, lines: [{ line: 1, quantity: "1", unit: "kg" }] });
    const partial = await get("purchase-orders", order.id);
    expect(partial.lines[0]).toMatchObject({ status: "completed", received: "11.000000" });
    const cancelled = await write(`${root}/purchase-orders/${order.id}/cancel`, { version: partial.version, lines: [2] }, secret);
    expect(cancelled.status).toBe(200); expect(json(cancelled).data.status).toBe("closed-early");
    const another = await po();
    const before = (await stock()).quantity;
    await create("goods-receipts", { purchaseOrder: another.id, lines: [{ line: 1, quantity: "3", unit: "kg" }] });
    const received = (await stock()).quantity;
    expect(Number(received) - Number(before)).toBe(3);
    await open("purchase-orders", another.id);
    await confirm(`Close order early… — Purchase orders ${another.id}`, "7 kg");
    expect((await get("purchase-orders", another.id)).lines[0]).toMatchObject({ received: "3.000000", abandoned: "7.000000", outstanding: "0.000000", status: "closed-early" });
    expect((await stock()).quantity).toBe(received);
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
      await confirm(`Close order early… — ${title} ${order.id}`, "10 kg");
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
      await user.clickRole("button", `Close order early… — Customer orders ${order.id}`);
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
    await confirm(`Close order early… — Production orders ${order.id}`, "10 each");
    expect(await get("production-orders", order.id)).toMatchObject({ status: "closed-early", produced: "0.000000", abandoned: "10.000000", outstanding: "0.000000" });
    expect((await stock()).quantity).toBe("98.000000");
  });

  it("plans only the outstanding quantity, and nothing once production is closed early (LFC-004, PRD-029)", async () => {
    await correct();
    const order = await create("production-orders", { output, location, quantity: "200", unit: "each", plannedFinish: "2027-01-02" });
    expect((await write(`${root}/production-orders/${order.id}/completions`, { quantity: "40", unit: "each", components: [{ material, quantity: "40", unit: "kg" }] })).status).toBe(200);
    // Shown callouts only: Next.js keeps earlier pages mounted but hidden.
    const callouts = () => user.evaluate<string[]>('[...document.querySelectorAll("main [data-slot=callout]")].filter((element) => element.offsetParent).map((element) => `${element.dataset.tone}: ${element.textContent}`)');
    const requirements = () => user.evaluate<string[]>(`[...document.querySelectorAll('main table[aria-label="Pinned component requirements and current stock"] tbody td')].filter((cell) => cell.closest("table").offsetParent).map((cell) => cell.textContent)`);
    const partial = await get("production-orders", order.id);
    // 160 still to make at 1 kg each, against the 60 kg left after the completion.
    expect(partial).toMatchObject({ status: "open", produced: "40.000000", outstanding: "160.000000",
      components: [expect.objectContaining({ material, required: "160.000000", available: "60.000000", shortage: "100.000000" })] });
    await open("production-orders", order.id);
    await user.waitForText("1 component short");
    expect(await callouts()).toEqual(["warning: 1 component shortYou can still create this plan; stock is checked when a completion is posted."]);
    expect(await requirements()).toEqual([`${material} Lifecycle steel`, "160 kg", "60 kg", "100 kg"]);
    await confirm(`Close order early… — Production orders ${order.id}`, "160 each");
    await user.waitForText("This order is Closed Early, so it needs no more components.");
    expect(await callouts()).toEqual(["neutral: This order is Closed Early, so it needs no more components."]);
    expect(await requirements()).toEqual([`${material} Lifecycle steel`, "0 kg", "60 kg", "0 kg"]);
    expect(await get("production-orders", order.id)).toMatchObject({ status: "closed-early", outstanding: "0.000000", shortages: [],
      components: [expect.objectContaining({ material, required: "0.000000", shortage: "0.000000" })] });
    expect((await stock()).quantity).toBe("60.000000");
  });

  it("refuses Close Early with 10 of 60 kg in transit after 50 received, then closes the 55/5 loss early on a narrow screen (TRF-012, E2E-009)", async () => {
    await correct(); const order = await transfer("60");
    expect([(await stock()).quantity, (await stock(destination)).quantity]).toEqual(["100.000000", "0.000000"]);
    expect((await write(`${root}/transfers/${order.id}/dispatches`, { quantity: "60", unit: "kg" })).status).toBe(200);
    expect((await write(`${root}/transfers/${order.id}/receipts`, { quantity: "50", unit: "kg" })).status).toBe(200);
    await user.setViewport(390, 844); await open("transfers", order.id);
    await user.clickRole("button", `Close transfer early… — Transfers ${order.id}`); await user.waitFor(dialog);
    expect(await user.text(dialog)).toContain("10 kg still in transit");
    await user.click(`${dialog} button[type=submit]`); await user.waitFor(`${dialog} [role=alert]`);
    expect(await user.text(`${dialog} [role=alert]`)).toContain("Receive or write off the 10.000000 kg still in transit first.");
    expect(await user.evaluate<boolean>("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    await user.clickRole("button", "Keep open");
    expect(await get("transfers", order.id)).toMatchObject({ status: "open", dispatched: "60.000000", received: "50.000000", inTransit: "10.000000" });

    expect((await write(`${root}/transfers/${order.id}/receipts`, { quantity: "5", unit: "kg" })).status).toBe(200);
    const writtenOff = await write(`${root}/transfers/${order.id}/write-offs`, { quantity: "5", unit: "kg", reason: "Lifecycle crate lost" });
    expect(writtenOff.status).toBe(200);
    const loss = json(writtenOff).data.posting.id as string;
    // Every dispatched unit is accounted for, yet the loss keeps the transfer from Completed.
    expect(await get("transfers", order.id)).toMatchObject({ status: "open", inTransit: "0.000000" });
    await open("transfers", order.id); await confirm(`Close transfer early… — Transfers ${order.id}`, "5 kg");
    const closed = await get("transfers", order.id);
    expect(closed).toMatchObject({ status: "closed-early", quantity: "60.000000", dispatched: "60.000000", received: "55.000000", writtenOff: "5.000000",
      abandoned: "5.000000", inTransit: "0.000000", outstanding: "0.000000" });
    expect([(await stock()).quantity, (await stock(destination)).quantity]).toEqual(["40.000000", "55.000000"]);
    // The loss in the transfer's ledger, and its audit entry naming that posting.
    expect((closed.postings as { id: string }[]).find(({ id }) => id === loss)).toMatchObject({ kind: "write-off", reason: "Lifecycle crate lost",
      legs: [{ place: "transit", location: null, quantity: "-5.000000" }] });
    const audit = (json(await api("GET", "/api/tenants/prod/audit?limit=100")).data.entries as { action: string; subject: { id: string }; after: Record<string, unknown> }[])
      .filter((entry) => entry.subject.id === order.id && entry.action === "transfers.transfer.written-off");
    expect(audit).toEqual([expect.objectContaining({ after: expect.objectContaining({ posting: loss, moved: "5.000000", reason: "Lifecycle crate lost" }) })]);
    await user.setViewport(1280, 800);
  });

  it("refuses stale versions, read-only mutations and missing/stale Test generations", async () => {
    const order = await requisition();
    expect(json(await write(`${root}/purchase-requisitions/${order.id}/cancel`, { version: order.version + 1 })).error.code).toBe("VERSION_CONFLICT");
    expect((await api("PATCH", root, { key: randomUUID(), body: { readOnly: true } })).status).toBe(200);
    try {
      expect(json(await write(`${root}/purchase-requisitions/${order.id}/cancel`, { version: order.version })).error.code).toBe("TENANT_READ_ONLY");
      // This test's Open requisition is the newest, on the last page, which a page past it shows (#187).
      await open("purchase-requisitions?page=1000000");
      const row = `[...document.querySelectorAll("main tbody tr")].find((row) => row.offsetParent && row.cells[0].textContent === ${JSON.stringify(order.id)})`;
      await user.waitUntil(`!!${row}`);
      expect(await user.evaluate<number>(`${row}.querySelectorAll("button").length`)).toBe(0);
    } finally { await api("PATCH", root, { key: randomUUID(), body: { readOnly: false } }); }
    const testPath = "/api/tenants/test/purchase-requisitions/99999999/cancel";
    const tenant = json(await api("GET", "/api/tenants/test")).data;
    expect((await api("POST", testPath, { key: randomUUID(), body: { version: 1 } }, userSecret)).status).toBe(428);
    expect(json(await api("POST", testPath, { key: randomUUID(), body: { version: 1 }, generation: tenant.generation + 1 }, userSecret)).error.code).toBe("GENERATION_STALE");
    expect((await api("POST", testPath, { key: randomUUID(), body: { version: 1 }, generation: tenant.generation }, userSecret)).status).toBe(404);
    expect((await get("purchase-requisitions", order.id)).status).toBe("open");
  });
});
