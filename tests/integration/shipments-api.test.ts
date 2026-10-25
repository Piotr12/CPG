import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { AuditPage, CustomerOrderView, IssueView, ShipmentView, StockView } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const PASSWORD = "shapi first password";
const today = () => new Date().toISOString().slice(0, 10);

// Shipments and goods issues through the API (R07, E08-S02): SAL-006…013, SAL-018, SAL-020…022,
// SAL-024, SAL-025, INV-003, INV-005, INV-007, INV-010, INV-011, INV-017, INV-021, AUD-026, AUD-030, LFC-002, LFC-003,
// LFC-010, LFC-020, TEN-017, API-020, API-021. Shipment edit and cancel (#147, E08-S05).
describe("shipments and goods issues through the API", () => {
  let admin: Browser;
  let user: Browser;
  let adminSecret: string;
  /** A normal user's token: both roles ship and issue. */
  let userSecret: string;
  const ids: Record<"widget" | "gadget" | "plant" | "depot" | "retail", string> = {} as never;

  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}, secret = adminSecret) =>
    callApi(baseUrl, method, path, secret, options);
  const write = (method: string, path: string, body: unknown, secret = adminSecret) => api(method, path, { key: randomUUID(), body }, secret);
  const create = async (path: string, body: unknown) => json(await write("POST", path, body)).data.id as string;
  /** An Open order for retail at the plant: lines A and B of `quantities` widgets and gadgets. */
  const placeOrder = async (a = "50", b = "30") => {
    const response = await write("POST", "/api/tenants/prod/customer-orders", {
      customer: ids.retail,
      location: ids.plant,
      lines: [
        { material: ids.widget, quantity: a, unit: "each", requiredDate: "2026-11-04" },
        { material: ids.gadget, quantity: b, unit: "each", requiredDate: "2026-11-08" },
      ],
    });
    expect(response.status).toBe(200);
    return json(response).data as CustomerOrderView;
  };
  const getOrder = async (id: string) => json(await api("GET", `/api/tenants/prod/customer-orders/${id}`)).data as CustomerOrderView;
  /** A shipment of `quantities` (default: each line's whole quantity) of the order's lines. */
  const ship = async (order: CustomerOrderView, quantities = order.lines.map(({ quantity }) => quantity), secret = adminSecret) => {
    const response = await write(
      "POST",
      "/api/tenants/prod/shipments",
      { customerOrder: order.id, plannedDate: "2026-11-03", lines: order.lines.map(({ id }, index) => ({ orderLine: id, quantity: quantities[index], unit: "each" })) },
      secret,
    );
    expect(response.status).toBe(200);
    return json(response).data as ShipmentView;
  };
  const issue = (shipment: string, lines: unknown[], secret = adminSecret, key = randomUUID()) =>
    api("POST", "/api/tenants/prod/goods-issues", { key, body: { shipment, lines } }, secret);
  const stockOf = async (material: string, location = ids.plant) =>
    (json(await api("GET", `/api/tenants/prod/stock?material=${material}&location=${location}`)).data as StockView).quantity;
  const count = (material: string, quantity: string, location = ids.plant) =>
    write("POST", "/api/tenants/prod/stock/corrections", { material, location, quantity, unit: "each", reason: "Count" });
  /** Fresh materials with `widgets` and `gadgets` on hand at the plant, so each test reads its own stock. */
  const freshMaterials = async (widgets = "100", gadgets = "100") => {
    ids.widget = await create("/api/tenants/prod/materials", { type: "finished", description: "shapi widget", baseUnit: "each" });
    ids.gadget = await create("/api/tenants/prod/materials", { type: "finished", description: "shapi gadget", baseUnit: "each" });
    await count(ids.widget, widgets);
    await count(ids.gadget, gadgets);
  };

  beforeAll(async () => {
    admin = openBrowser();
    user = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, "shapi-ops");
    ids.plant = await create("/api/tenants/prod/locations", { name: "shapi plant" });
    ids.depot = await create("/api/tenants/prod/locations", { name: "shapi depot" });
    ids.retail = await create("/api/tenants/prod/customers", { name: "shapi retail" });
    await write("POST", "/api/users", { username: "shapi-una", password: PASSWORD });
    await signIn(user, baseUrl, PASSWORD, "shapi-una");
    await openTokens(user, baseUrl);
    userSecret = await createToken(user, "shapi-una-cli");
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find((token) => token.name === "shapi-ops")!;
    await api("DELETE", `/api/tokens/${own.id}`, { key: randomUUID() });
    await Promise.all([admin.close(), user.close()]);
  });

  it("ships both lines of one order without moving stock, and refuses a line of another order (SAL-006, SAL-007, SAL-008, SAL-009)", async () => {
    await freshMaterials();
    const [order, other] = [await placeOrder(), await placeOrder()];

    const shipment = await ship(order, undefined, userSecret);

    expect(shipment).toMatchObject({
      customerOrder: order.id,
      location: ids.plant,
      status: "open",
      lines: [
        { line: 1, orderLine: order.lines[0].id, material: ids.widget, quantity: "50.000000", issued: "0.000000", toIssue: "50.000000" },
        { line: 2, orderLine: order.lines[1].id, material: ids.gadget, quantity: "30.000000", issued: "0.000000", toIssue: "30.000000" },
      ],
    });
    expect(await stockOf(ids.widget)).toBe("100.000000");
    expect((await getOrder(order.id)).lines.map(({ fulfilled }) => fulfilled)).toEqual(["0.000000", "0.000000"]);

    const mixed = await write("POST", "/api/tenants/prod/shipments", {
      customerOrder: order.id,
      plannedDate: "2026-11-03",
      lines: [
        { orderLine: order.lines[0].id, quantity: "1", unit: "each" },
        { orderLine: other.lines[1].id, quantity: "1", unit: "each", customerOrder: other.id },
        { orderLine: other.lines[0].id, quantity: "1", unit: "each" },
      ],
    });
    expect(mixed.status).toBe(400);
    expect(json(mixed).error.fieldErrors).toEqual({
      "lines.1.customerOrder": ["A shipment covers one customer order: this line is from another."],
      "lines.2.orderLine": ["This order has no such line."],
    });
    expect((json(await api("GET", `/api/tenants/prod/shipments?customerOrder=${order.id}`)).data as ShipmentView[]).map(({ id }) => id)).toEqual([shipment.id]);
    expect(json(await api("GET", `/api/tenants/prod/shipments/${shipment.id}`)).data).toMatchObject({ id: shipment.id, customerOrder: order.id });
  });

  it("fulfils only the issued line and lowers only its stock at the order's location, accumulating repeated issues (SAL-010, SAL-011, INV-003, LFC-002)", async () => {
    await freshMaterials();
    await count(ids.widget, "9", ids.depot);
    const order = await placeOrder("60");
    const shipment = await ship(order);

    const first = await issue(shipment.id, [{ line: 1, quantity: "20", unit: "each" }], userSecret);
    expect(first.status).toBe(200);
    expect(json(first).data).toMatchObject({ shipment: shipment.id, customerOrder: order.id, location: ids.plant, lines: [{ line: 1, material: ids.widget, quantity: "20.000000" }] });
    expect(await getOrder(order.id)).toMatchObject({ status: "open", lines: [{ fulfilled: "20.000000" }, { fulfilled: "0.000000" }] });
    expect(await stockOf(ids.widget)).toBe("80.000000");
    expect(await stockOf(ids.gadget)).toBe("100.000000");
    expect(await stockOf(ids.widget, ids.depot)).toBe("9.000000");

    expect((await issue(shipment.id, [{ line: 1, quantity: "25", unit: "each" }], userSecret)).status).toBe(200);
    expect(await getOrder(order.id)).toMatchObject({ status: "open", lines: [{ fulfilled: "45.000000", status: "open" }, { status: "open" }] });
    expect((json(await api("GET", `/api/tenants/prod/shipments/${shipment.id}`)).data as ShipmentView).lines[0]).toMatchObject({ issued: "45.000000", toIssue: "15.000000" });
  });

  it("refuses an over-issue whatever the stock, and the exact final issues complete the line, the order and the shipment (SAL-012, SAL-013, SAL-018, LFC-003, LFC-010)", async () => {
    await freshMaterials();
    const order = await placeOrder("60");
    const fifteen = await ship(order, ["15", "30"]);
    await expect(issue(fifteen.id, [{ line: 1, quantity: "16", unit: "each" }]).then(({ status }) => status)).resolves.toBe(400);
    const shipment = await ship(order);
    await issue(shipment.id, [{ line: 1, quantity: "50", unit: "each" }]);

    const over = await issue(shipment.id, [{ line: 1, quantity: "11", unit: "each" }]);
    expect(over.status).toBe(400);
    expect(json(over).error.fieldErrors).toEqual({ "lines.0.quantity": [expect.stringContaining("more than is still to issue")] });
    expect((await getOrder(order.id)).lines[0].fulfilled).toBe("50.000000");
    expect(await stockOf(ids.widget)).toBe("50.000000");

    expect((await issue(shipment.id, [{ line: 1, quantity: "10", unit: "each" }])).status).toBe(200);
    expect(await getOrder(order.id)).toMatchObject({ status: "open", lines: [{ fulfilled: "60.000000", status: "completed" }, { status: "open" }] });
    expect((await issue(shipment.id, [{ line: 2, quantity: "30", unit: "each" }])).status).toBe(200);
    expect(await getOrder(order.id)).toMatchObject({ status: "completed", lines: [{ status: "completed" }, { status: "completed" }] });
    // Nothing is left on the order: both its shipments are Completed.
    expect((json(await api("GET", `/api/tenants/prod/shipments?customerOrder=${order.id}`)).data as ShipmentView[]).map(({ status }) => status)).toEqual(["completed", "completed"]);
    const closed = await issue(shipment.id, [{ line: 2, quantity: "1", unit: "each" }]);
    expect(closed.status).toBe(409);
    expect(json(closed).error.code).toBe("SHIPMENT_NOT_OPEN");
  });

  it("ships and issues an Open order after its customer is deactivated, while a new order for that customer is refused (SAL-025, LFC-020)", async () => {
    await freshMaterials();
    const customer = json(await write("POST", "/api/tenants/prod/customers", { name: "shapi leaving" })).data as { id: string; version: number };
    const placed = await write("POST", "/api/tenants/prod/customer-orders", {
      customer: customer.id,
      location: ids.plant,
      lines: [{ material: ids.widget, quantity: "40", unit: "each", requiredDate: "2026-11-04" }],
    });
    expect(placed.status).toBe(200);
    const order = json(placed).data as CustomerOrderView;
    expect((await write("PATCH", `/api/tenants/prod/customers/${customer.id}`, { active: false, version: customer.version })).status).toBe(200);

    const shipment = await ship(order, ["40"], userSecret);
    expect((await issue(shipment.id, [{ line: 1, quantity: "15", unit: "each" }], userSecret)).status).toBe(200);

    expect(await getOrder(order.id)).toMatchObject({ customer: customer.id, status: "open", lines: [{ fulfilled: "15.000000", status: "open" }] });
    expect(await stockOf(ids.widget)).toBe("85.000000");
    const refused = await write("POST", "/api/tenants/prod/customer-orders", {
      customer: customer.id,
      location: ids.plant,
      lines: [{ material: ids.widget, quantity: "1", unit: "each", requiredDate: "2026-11-04" }],
    });
    expect(refused.status).toBe(409);
    expect(json(refused).error.code).toBe("CUSTOMER_INACTIVE");
  });

  it("leaves a completed order Completed and fulfilled after a reasoned positive correction returns its goods (SAL-024, INV-017, N02)", async () => {
    await freshMaterials();
    const order = await placeOrder("60");
    const shipment = await ship(order);
    expect((await issue(shipment.id, [{ line: 1, quantity: "60", unit: "each" }, { line: 2, quantity: "30", unit: "each" }])).status).toBe(200);
    const completed = await getOrder(order.id);
    expect(completed).toMatchObject({ status: "completed", lines: [{ fulfilled: "60.000000" }, { fulfilled: "30.000000" }] });

    const correction = await write(
      "POST",
      "/api/tenants/prod/stock/corrections",
      { material: ids.widget, location: ids.plant, quantity: "5", unit: "each", reason: "Physical customer return" },
      userSecret,
    );
    expect(correction.status).toBe(200);

    expect(await stockOf(ids.widget)).toBe("45.000000");
    expect(await getOrder(order.id)).toEqual(completed);
    expect((json(await api("GET", `/api/tenants/prod/goods-issues?shipment=${shipment.id}`)).data as IssueView[])).toHaveLength(1);
  });

  it("refuses an issue beyond the stock naming available and requested, and lets one of two racing issues commit (INV-005, INV-021, AUD-026)", async () => {
    await freshMaterials("10");
    const order = await placeOrder("60");
    const shipment = await ship(order);

    const short = await issue(shipment.id, [{ line: 1, quantity: "11", unit: "each" }]);
    expect(short.status).toBe(409);
    expect(json(short).error).toMatchObject({ code: "INSUFFICIENT_STOCK", params: { available: "10.000000", requested: "11.000000", unit: "each" } });
    expect(await stockOf(ids.widget)).toBe("10.000000");
    expect((await getOrder(order.id)).lines[0].fulfilled).toBe("0.000000");

    const raced = await Promise.all([1, 2].map(() => issue(shipment.id, [{ line: 1, quantity: "7", unit: "each" }])));
    expect(raced.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(json(raced.find(({ status }) => status === 409)!).error.code).toBe("INSUFFICIENT_STOCK");
    expect(await stockOf(ids.widget)).toBe("3.000000");
    expect((await getOrder(order.id)).lines[0].fulfilled).toBe("7.000000");
    expect(json(await api("GET", `/api/tenants/prod/goods-issues?shipment=${shipment.id}`)).data).toHaveLength(1);
  });

  it("lets one of two sessions racing issues of two order lines win the stock both need, with one audit entry and the ledger never below zero (E2E-006)", async () => {
    await freshMaterials("10");
    // Two outstanding order lines for 7 each, on two orders, each shipped.
    const orders = [await placeOrder("7", "1"), await placeOrder("7", "1")];
    const shipments = [await ship(orders[0], undefined, adminSecret), await ship(orders[1], undefined, userSecret)];

    // Independent sessions: the admin's token and the normal user's.
    const raced = await Promise.all([
      issue(shipments[0].id, [{ line: 1, quantity: "7", unit: "each" }], adminSecret),
      issue(shipments[1].id, [{ line: 1, quantity: "7", unit: "each" }], userSecret),
    ]);
    expect(raced.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(json(raced.find(({ status }) => status === 409)!).error).toMatchObject({ code: "INSUFFICIENT_STOCK", params: { available: "3.000000", requested: "7.000000" } });
    const winner = json(raced.find(({ status }) => status === 200)!).data as IssueView;

    const ledger = json(await api("GET", `/api/tenants/prod/stock?material=${ids.widget}&location=${ids.plant}`)).data as StockView;
    expect(ledger.quantity).toBe("3.000000");
    // Oldest first: the count, then the one issue; the running balance never goes below zero.
    const movements = [...ledger.movements].reverse();
    expect(movements.map(({ type, quantity }) => [type, quantity])).toEqual([["correction", "10.000000"], ["goods-issue", "-7.000000"]]);
    expect(movements.reduce((balances, { quantity }) => [...balances, (balances.at(-1) ?? 0) + Number(quantity)], [] as number[])).toEqual([10, 3]);
    const issued = (json(await api("GET", "/api/tenants/prod/audit?limit=100")).data as AuditPage).entries.filter(
      (entry) => entry.action === "goods-issues.goods-issue.posted" && shipments.some(({ id }) => entry.after?.shipment === id),
    );
    expect(issued.map(({ subject }) => subject.id)).toEqual([winner.id]);
    expect((await Promise.all(orders.map(async ({ id }) => (await getOrder(id)).lines[0].fulfilled))).sort()).toEqual(["0.000000", "7.000000"]);
  });

  it("refuses a normal user's BOM edit through their token, then posts their goods issue attributed to their account and token (E2E-014)", async () => {
    await freshMaterials();
    const steel = await create("/api/tenants/prod/materials", { type: "raw", description: "shapi steel", baseUnit: "each" });
    const recipe = { output: ids.widget, priority: 1, validFrom: "2026-01-01", validThrough: null, components: [{ material: steel, quantity: "2", unit: "each" }] };
    const bom = json(await write("POST", "/api/tenants/prod/boms", recipe)).data as { id: string; version: number };
    const before = json(await api("GET", `/api/tenants/prod/boms/${bom.id}`)).data;

    const edit = await write("PATCH", `/api/tenants/prod/boms/${bom.id}`, { version: bom.version, components: [{ material: steel, quantity: "3", unit: "each" }] }, userSecret);
    expect(edit.status).toBe(403);
    expect(json(edit).error.code).toBe("FORBIDDEN");
    expect(json(await api("GET", `/api/tenants/prod/boms/${bom.id}`)).data).toEqual(before);

    const order = await placeOrder();
    const shipment = await ship(order);
    const posted = await issue(shipment.id, [{ line: 1, quantity: "5", unit: "each" }], userSecret);
    expect(posted.status, posted.text).toBe(200);
    const id = (json(posted).data as IssueView).id;
    expect(await stockOf(ids.widget)).toBe("95.000000");
    const entries = (json(await api("GET", "/api/tenants/prod/audit?limit=100")).data as AuditPage).entries;
    expect(entries.filter((entry) => entry.action === "goods-issues.goods-issue.posted" && entry.subject.id === id)).toEqual([
      expect.objectContaining({ channel: "api", actor: expect.objectContaining({ username: "shapi-una" }), token: expect.objectContaining({ name: "shapi-una-cli" }) }),
    ]);
    // The refused edit wrote nothing. By type and ID: every kind numbers its records from 00000001.
    expect(entries.filter(({ subject }) => subject.type === "Bom" && subject.id === bom.id).map(({ action }) => action)).toEqual(["boms.bom.created"]);
  });

  it("lets an issue of exactly the stock on hand take the balance to zero (INV-007)", async () => {
    await freshMaterials("10");
    const order = await placeOrder("60");
    const shipment = await ship(order);

    expect((await issue(shipment.id, [{ line: 1, quantity: "10", unit: "each" }])).status).toBe(200);

    expect(await stockOf(ids.widget)).toBe("0.000000");
    expect((await getOrder(order.id)).lines[0].fulfilled).toBe("10.000000");
  });

  it("dates the issue and its movement today whatever date is sent, keeps the required date, and audits with its own timestamp (INV-010, INV-011, AUD-030)", async () => {
    await freshMaterials();
    const order = await placeOrder();
    const shipment = await ship(order);

    const response = await api("POST", "/api/tenants/prod/goods-issues", {
      key: randomUUID(),
      body: { shipment: shipment.id, businessDate: "2099-01-01", lines: [{ line: 1, quantity: "5", unit: "each" }] },
    });

    const posted = json(response).data as IssueView;
    expect(posted.businessDate).toBe(today());
    const [movement] = (json(await api("GET", `/api/tenants/prod/stock?material=${ids.widget}&location=${ids.plant}`)).data as StockView).movements;
    expect(movement).toMatchObject({ type: "goods-issue", quantity: "-5.000000", businessDate: today(), reason: `Goods issue ${posted.id} for shipment ${shipment.id}, customer order ${order.id}` });
    expect((await getOrder(order.id)).lines[0].requiredDate).toBe("2026-11-04");
    const entries = (json(await api("GET", "/api/tenants/prod/audit?limit=100")).data as AuditPage).entries;
    const audit = entries.find((entry) => entry.action === "goods-issues.goods-issue.posted" && entry.subject.id === posted.id)!;
    expect(audit).toMatchObject({ channel: "api", after: { shipment: shipment.id, customerOrder: order.id, businessDate: today() } });
    expect(new Date(audit.occurredAt).getTime()).toBeGreaterThan(Date.now() - 600_000);
    expect(entries).toEqual(expect.arrayContaining([expect.objectContaining({ action: "customer-orders.customer-order.fulfilled", subject: expect.objectContaining({ id: order.id }) })]));
    expect(json(await api("GET", `/api/tenants/prod/goods-issues/${posted.id}`)).data).toMatchObject({ id: posted.id, shipment: shipment.id });
    const missing = await api("GET", "/api/tenants/test/goods-issues/99999999");
    expect(missing.status).toBe(404);
    expect(json(missing).error.code).toBe("GOODS_ISSUE_NOT_FOUND");
  });

  it("locks a delivered line's material and date, the header location, and its quantity below the delivered (SAL-020, SAL-021, SAL-022)", async () => {
    await freshMaterials();
    const order = await placeOrder("60");
    const shipment = await ship(order);
    await issue(shipment.id, [{ line: 1, quantity: "40", unit: "each" }]);
    const current = await getOrder(order.id);
    const patch = (line: Record<string, string>, location = ids.plant) =>
      write("PATCH", `/api/tenants/prod/customer-orders/${order.id}`, {
        version: current.version,
        customer: ids.retail,
        location,
        lines: current.lines.map(({ id, material, enteredQuantity, enteredUnit, requiredDate }, index) => ({
          id, material, quantity: enteredQuantity, unit: enteredUnit, requiredDate, ...(index === 0 ? line : {}),
        })),
      });

    const below = await patch({ quantity: "39" });
    expect(below.status).toBe(400);
    expect(Object.keys(json(below).error.fieldErrors)).toEqual(["lines.0.quantity"]);
    const locked = [await patch({ material: ids.gadget }), await patch({ requiredDate: "2026-11-05" }), await patch({}, ids.depot)];
    expect(locked.map((response) => [response.status, json(response).error.code])).toEqual([
      [409, "CUSTOMER_ORDER_LOCKED"],
      [409, "CUSTOMER_ORDER_LOCKED"],
      [409, "CUSTOMER_ORDER_LOCKED"],
    ]);
    expect(await getOrder(order.id)).toEqual(current);
  });

  it("refuses an issue in a read-only tenant with no movement or order change, reads still working (TEN-017)", async () => {
    await freshMaterials();
    const order = await placeOrder();
    const shipment = await ship(order);
    expect((await write("PATCH", "/api/tenants/prod", { readOnly: true })).status).toBe(200);
    try {
      const refused = await issue(shipment.id, [{ line: 1, quantity: "5", unit: "each" }], userSecret);
      expect(refused.status).toBe(409);
      expect(json(refused).error.code).toBe("TENANT_READ_ONLY");
      expect((await api("GET", `/api/tenants/prod/goods-issues?shipment=${shipment.id}`)).text).toBe('{"ok":true,"data":[]}');
    } finally {
      expect((await write("PATCH", "/api/tenants/prod", { readOnly: false })).status).toBe(200);
    }
    expect(await stockOf(ids.widget)).toBe("100.000000");
    expect((await getOrder(order.id)).lines[0].fulfilled).toBe("0.000000");
  });

  it("posts one issue, one movement and one audit entry for a keyed request, and returns the original for a retry with the same key and body (API-020, API-021, E2E-013)", async () => {
    await freshMaterials();
    const order = await placeOrder();
    const shipment = await ship(order);
    const key = randomUUID();

    const first = await issue(shipment.id, [{ line: 1, quantity: "10", unit: "each" }], adminSecret, key);
    const replay = await issue(shipment.id, [{ line: 1, quantity: "10", unit: "each" }], adminSecret, key);

    expect(first.status).toBe(200);
    expect(replay.replayed).toBe("true");
    expect(json(replay).data.id).toBe(json(first).data.id);
    expect(await stockOf(ids.widget)).toBe("90.000000");
    expect((await getOrder(order.id)).lines[0].fulfilled).toBe("10.000000");
    expect(json(await api("GET", `/api/tenants/prod/goods-issues?shipment=${shipment.id}`)).data).toHaveLength(1);
    // The ledger and the audit hold the issue once: the retry wrote neither again.
    const ledger = json(await api("GET", `/api/tenants/prod/stock?material=${ids.widget}&location=${ids.plant}`)).data as StockView;
    expect(ledger.movements.filter(({ type }) => type === "goods-issue").map(({ quantity }) => quantity)).toEqual(["-10.000000"]);
    const posted = (json(await api("GET", "/api/tenants/prod/audit?limit=100")).data as AuditPage).entries.filter(
      (entry) => entry.action === "goods-issues.goods-issue.posted" && entry.subject.id === json(first).data.id,
    );
    expect(posted).toHaveLength(1);
  });

  /** The audit entries of `action` on shipment `id`, newest first. */
  const shipmentAudit = async (action: string, id: string) =>
    (json(await api("GET", "/api/tenants/prod/audit?limit=100")).data as AuditPage).entries.filter((entry) => entry.action === action && entry.subject.id === id);

  it("edits an Open shipment at its version: refuses a stale one and a line below what it issued, adds and removes lines, completes it at exactly what was issued, and replays a same-key retry without a second audit entry (#147)", async () => {
    await freshMaterials();
    const order = await placeOrder("50", "30");
    const shipment = await ship(order, ["40", "10"], userSecret);
    expect(shipment).toMatchObject({ version: 1, lines: [{ posted: false }, { posted: false }] });
    expect((await issue(shipment.id, [{ line: 1, quantity: "30", unit: "each" }])).status).toBe(200);
    const loaded = json(await api("GET", `/api/tenants/prod/shipments/${shipment.id}`)).data as ShipmentView;
    expect(loaded).toMatchObject({ version: 2, lines: [{ issued: "30.000000", posted: true }, { posted: false }] });
    const [a, b] = order.lines;
    const patch = (version: number, lines: unknown[], key = randomUUID()) =>
      api("PATCH", `/api/tenants/prod/shipments/${shipment.id}`, { key, body: { version, plannedDate: "2026-11-10", lines } }, userSecret);

    const stale = await patch(1, [{ orderLine: a.id, quantity: "40", unit: "each" }, { orderLine: b.id, quantity: "10", unit: "each" }]);
    expect([stale.status, json(stale).error.code]).toEqual([409, "VERSION_CONFLICT"]);
    const below = await patch(2, [{ orderLine: a.id, quantity: "20", unit: "each" }, { orderLine: b.id, quantity: "10", unit: "each" }]);
    expect([below.status, json(below).error.fieldErrors]).toEqual([400, { "lines.0.quantity": ["This is less than this line has already issued."] }]);
    const lost = await patch(2, [{ orderLine: b.id, quantity: "10", unit: "each" }]);
    expect([lost.status, json(lost).error]).toEqual([409, expect.objectContaining({ code: "SHIPMENT_LINE_ISSUED", params: { line: "1" } })]);

    // Line 2 goes, so line 1 at exactly its issued 30 leaves nothing to issue: the shipment completes.
    const key = randomUUID();
    const done = await patch(2, [{ orderLine: a.id, quantity: "30", unit: "each" }], key);
    expect(done.status).toBe(200);
    expect(json(done).data).toMatchObject({ plannedDate: "2026-11-10", status: "completed", lines: [{ line: 1, quantity: "30.000000", toIssue: "0.000000" }] });
    const replay = await patch(2, [{ orderLine: a.id, quantity: "30", unit: "each" }], key);
    expect(replay.replayed).toBe("true");
    expect(json(replay).data).toEqual(json(done).data);
    const [updated, ...more] = await shipmentAudit("shipments.shipment.updated", shipment.id);
    expect(more).toEqual([]);
    expect(updated).toMatchObject({ channel: "api", before: { plannedDate: "2026-11-03" }, after: { plannedDate: "2026-11-10", lines: `1: ${ids.widget} 30.000000 each` } });
    expect(await shipmentAudit("shipments.shipment.completed", shipment.id)).toHaveLength(1);
    // Nothing moved: only the issue did.
    expect(await stockOf(ids.widget)).toBe("70.000000");
    expect((await getOrder(order.id)).lines.map(({ fulfilled }) => fulfilled)).toEqual(["30.000000", "0.000000"]);

    const closed = await patch(json(done).data.version, [{ orderLine: a.id, quantity: "40", unit: "each" }]);
    expect([closed.status, json(closed).error.code]).toEqual([409, "SHIPMENT_NOT_OPEN"]);
  });

  it("cancels a shipment nothing was issued against, which then takes no issue; refuses one whose issue was reversed, and any write in a read-only tenant (#147)", async () => {
    await freshMaterials();
    const order = await placeOrder();
    const [unissued, reversed] = [await ship(order, ["5", "5"]), await ship(order, ["5", "5"])];
    const cancel = (id: string, version: number, secret = userSecret) => api("POST", `/api/tenants/prod/shipments/${id}/cancel`, { key: randomUUID(), body: { version } }, secret);

    expect((await write("PATCH", "/api/tenants/prod", { readOnly: true })).status).toBe(200);
    try {
      const refused = await cancel(unissued.id, 1);
      expect([refused.status, json(refused).error.code]).toEqual([409, "TENANT_READ_ONLY"]);
    } finally {
      expect((await write("PATCH", "/api/tenants/prod", { readOnly: false })).status).toBe(200);
    }
    const cancelled = await cancel(unissued.id, 1);
    expect(cancelled.status).toBe(200);
    expect(json(cancelled).data).toMatchObject({ status: "cancelled", version: 2 });
    expect(await shipmentAudit("shipments.shipment.cancelled", unissued.id)).toMatchObject([{ before: { status: "open" }, after: { status: "cancelled" } }]);
    const issueRefused = await issue(unissued.id, [{ line: 1, quantity: "1", unit: "each" }]);
    expect([issueRefused.status, json(issueRefused).error.code]).toEqual([409, "SHIPMENT_NOT_OPEN"]);

    const posted = json(await issue(reversed.id, [{ line: 1, quantity: "5", unit: "each" }])).data as IssueView;
    expect((await write("POST", `/api/tenants/prod/stock/movements/${posted.lines[0].movementId}/reverse`, { reason: "Wrong shipment" })).status).toBe(200);
    const current = json(await api("GET", `/api/tenants/prod/shipments/${reversed.id}`)).data as ShipmentView;
    const issued = await cancel(reversed.id, current.version);
    expect([issued.status, json(issued).error.code]).toEqual([409, "SHIPMENT_ISSUED"]);
    expect(await stockOf(ids.widget)).toBe("100.000000");
    expect((await getOrder(order.id)).lines.map(({ fulfilled }) => fulfilled)).toEqual(["0.000000", "0.000000"]);
  });

  it("searches and sorts the customer orders on the server, and still refuses an unknown query key (#221)", async () => {
    const widget = await create("/api/tenants/prod/materials", { type: "finished", description: "shsq widget", baseUnit: "each" });
    const zulu = await create("/api/tenants/prod/customers", { name: "shsq zulu" });
    const yankee = await create("/api/tenants/prod/customers", { name: "shsq yankee" });
    const orderIds: string[] = [];
    for (const customer of [yankee, zulu]) {
      const response = await write("POST", "/api/tenants/prod/customer-orders", {
        customer, location: ids.plant, lines: [{ material: widget, quantity: "5", unit: "each", requiredDate: "2026-11-04" }],
      });
      expect(response.status).toBe(200);
      orderIds.push(json(response).data.id);
    }
    const list = async (query: string) => {
      const response = await api("GET", `/api/tenants/prod/customer-orders?${query}`);
      expect(response.status).toBe(200);
      return json(response).data as CustomerOrderView[];
    };

    expect((await list("q=shsq")).map(({ id }) => id)).toEqual(orderIds);
    expect((await list("q=shsq&sort=customer")).map(({ customer }) => customer)).toEqual([zulu, yankee]);
    expect((await list("q=shsq&sort=id&dir=desc")).map(({ id }) => id)).toEqual([...orderIds].reverse());
    expect((await list("q=SHSQ+yank")).map(({ customer }) => customer)).toEqual([yankee]);

    for (const [query, field] of [["sort=quantity", "sort"], ["dir=up", "dir"]]) {
      const refused = await api("GET", `/api/tenants/prod/customer-orders?${query}`);
      expect(refused.status).toBe(400);
      expect(Object.keys(json(refused).error.fieldErrors)).toEqual([field]);
    }
    expect((await api("GET", "/api/tenants/prod/customer-orders?q=shsq&surprise=1")).status).toBe(400);
  });
});
