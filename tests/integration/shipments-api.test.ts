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
// INV-003, INV-005, INV-010, INV-011, INV-021, AUD-026, AUD-030, LFC-002, LFC-003, LFC-010, TEN-017,
// API-020, API-021.
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

  it("posts one issue and one movement for a keyed request, and returns the original for a retry with the same key and body (API-020, API-021)", async () => {
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
  });
});
