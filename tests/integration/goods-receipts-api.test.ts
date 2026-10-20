import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { AuditPage, OrderView, PostedReceiptView, ReceiptView, StockView } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const PASSWORD = "grapi first password";
const today = () => new Date().toISOString().slice(0, 10);

// Goods receipts through the API (R07, E09-S02): BUY-010…016, BUY-020…024, INV-002, INV-010,
// AUD-018, AUD-030, LFC-002, LFC-003, LFC-009, MAT-031, API-021, R05.
describe("goods receipts through the API", () => {
  let admin: Browser;
  let user: Browser;
  let adminSecret: string;
  /** A normal user's token: any signed-in account may post receipts. */
  let userSecret: string;
  const ids: Record<"steel" | "bolt" | "plant" | "depot" | "acme", string> = {} as never;

  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}, secret = adminSecret) =>
    callApi(baseUrl, method, path, secret, options);
  const write = (method: string, path: string, body: unknown, secret = adminSecret) => api(method, path, { key: randomUUID(), body }, secret);
  const create = async (path: string, body: unknown) => json(await write("POST", path, body)).data.id as string;
  /** An Open order to acme at the plant: 100 kg of steel planned a week ago and 10 bolts, or the lines given. */
  const placeOrder = async (lines?: unknown[]) => {
    const response = await write("POST", "/api/tenants/prod/purchase-orders", {
      supplier: ids.acme,
      location: ids.plant,
      lines: lines ?? [
        { material: ids.steel, quantity: "100", unit: "kg", plannedDate: "2026-10-13" },
        { material: ids.bolt, quantity: "10", unit: "each", plannedDate: "2026-10-14" },
      ],
    });
    expect(response.status).toBe(200);
    return json(response).data as OrderView;
  };
  const getOrder = async (id: string) => json(await api("GET", `/api/tenants/prod/purchase-orders/${id}`)).data as OrderView;
  const receive = (purchaseOrder: string, lines: unknown[], secret = adminSecret, key = randomUUID()) =>
    api("POST", "/api/tenants/prod/goods-receipts", { key, body: { purchaseOrder, lines } }, secret);
  const stockOf = async (material: string, location = ids.plant) =>
    (json(await api("GET", `/api/tenants/prod/stock?material=${material}&location=${location}`)).data as StockView).quantity;
  /** Fresh materials, so each test reads its own stock from zero. */
  const freshMaterials = async () => {
    ids.steel = await create("/api/tenants/prod/materials", { type: "raw", description: "grapi steel", baseUnit: "kg" });
    await write("POST", `/api/tenants/prod/materials/${ids.steel}/conversions`, { unit: "t", numerator: "1000", denominator: "1" });
    ids.bolt = await create("/api/tenants/prod/materials", { type: "raw", description: "grapi bolt", baseUnit: "each" });
  };

  beforeAll(async () => {
    admin = openBrowser();
    user = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, "grapi-ops");
    ids.plant = await create("/api/tenants/prod/locations", { name: "grapi plant" });
    ids.depot = await create("/api/tenants/prod/locations", { name: "grapi depot" });
    ids.acme = await create("/api/tenants/prod/suppliers", { name: "grapi acme" });
    await write("POST", "/api/users", { username: "grapi-una", password: PASSWORD });
    await signIn(user, baseUrl, PASSWORD, "grapi-una");
    await openTokens(user, baseUrl);
    userSecret = await createToken(user, "grapi-una-cli");
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find((token) => token.name === "grapi-ops")!;
    await api("DELETE", `/api/tokens/${own.id}`, { key: randomUUID() });
    await Promise.all([admin.close(), user.close()]);
  });

  it("raises stock and the line's received on partial, repeated receipts, keeping the order Open, for a normal user's token (BUY-010, BUY-011, INV-002, LFC-002)", async () => {
    await freshMaterials();
    await write("POST", "/api/tenants/prod/stock/corrections", { material: ids.steel, location: ids.depot, quantity: "7", unit: "kg", reason: "Count" });
    const order = await placeOrder();

    const first = await receive(order.id, [{ line: 1, quantity: "30", unit: "kg" }], userSecret);
    expect(first.status).toBe(200);
    expect(json(first).data).toMatchObject({ purchaseOrder: order.id, location: ids.plant, warnings: [], lines: [{ line: 1, material: ids.steel, quantity: "30.000000" }] });
    expect(await stockOf(ids.steel)).toBe("30.000000");
    expect((await getOrder(order.id)).lines[0]).toMatchObject({ received: "30.000000", outstanding: "70.000000", status: "open" });

    expect((await receive(order.id, [{ line: 1, quantity: "50", unit: "kg" }], userSecret)).status).toBe(200);
    expect(await getOrder(order.id)).toMatchObject({ status: "open", lines: [{ received: "80.000000", outstanding: "20.000000" }, { received: "0.000000" }] });
    expect(await stockOf(ids.steel)).toBe("80.000000");
    // Only the target material at the target location moved.
    expect(await stockOf(ids.steel, ids.depot)).toBe("7.000000");
    expect(await stockOf(ids.bolt)).toBe("0.000000");
  });

  it("posts several lines of one order atomically, and nothing when one line fails (BUY-012, AUD-018)", async () => {
    await freshMaterials();
    const order = await placeOrder([
      { material: ids.steel, quantity: "50", unit: "kg", plannedDate: "2026-10-13" },
      { material: ids.bolt, quantity: "10", unit: "each", plannedDate: "2026-10-14" },
    ]);

    const refused = await receive(order.id, [{ line: 1, quantity: "20", unit: "kg" }, { line: 2, quantity: "5", unit: "box" }]);
    expect(refused.status).toBe(400);
    expect(Object.keys(json(refused).error.fieldErrors)).toEqual(["lines.1.unit"]);
    expect(await stockOf(ids.steel)).toBe("0.000000");
    expect((await getOrder(order.id)).lines.map(({ received }) => received)).toEqual(["0.000000", "0.000000"]);

    const posted = await receive(order.id, [{ line: 1, quantity: "0.02", unit: "t" }, { line: 2, quantity: "5", unit: "each" }]);
    expect(posted.status).toBe(200);
    expect(await stockOf(ids.steel)).toBe("20.000000");
    expect(await stockOf(ids.bolt)).toBe("5.000000");
    expect((await getOrder(order.id)).lines.map(({ received }) => received)).toEqual(["20.000000", "5.000000"]);
  });

  it("refuses a receipt with a line from another order (BUY-013)", async () => {
    await freshMaterials();
    const [first, second] = [await placeOrder(), await placeOrder()];

    const mixed = await receive(first.id, [{ line: 1, quantity: "1", unit: "kg" }, { line: 2, quantity: "1", unit: "each", purchaseOrder: second.id }]);

    expect(mixed.status).toBe(400);
    expect(json(mixed).error.fieldErrors).toMatchObject({ "lines.1.purchaseOrder": ["A goods receipt covers one purchase order: this line is from another."] });
    expect(await stockOf(ids.steel)).toBe("0.000000");
  });

  it("leaves a short delivery Open, completes on an exact receipt, and accepts an excess with a warning (BUY-014, BUY-015, BUY-016, LFC-003, LFC-009)", async () => {
    await freshMaterials();
    const short = await placeOrder([{ material: ids.steel, quantity: "100", unit: "kg", plannedDate: "2026-10-13" }]);
    await receive(short.id, [{ line: 1, quantity: "95", unit: "kg" }]);
    expect(await getOrder(short.id)).toMatchObject({ status: "open", lines: [{ outstanding: "5.000000" }] });

    const exact = await placeOrder([{ material: ids.steel, quantity: "100", unit: "kg", plannedDate: "2026-10-13" }]);
    await receive(exact.id, [{ line: 1, quantity: "100", unit: "kg" }]);
    expect(await getOrder(exact.id)).toMatchObject({ status: "completed", lines: [{ status: "completed", outstanding: "0.000000" }] });

    const twoLines = await placeOrder();
    await receive(twoLines.id, [{ line: 1, quantity: "110", unit: "kg" }]);
    // Line 1 is complete, line 2 isn't: the header stays Open (LFC-009).
    expect(await getOrder(twoLines.id)).toMatchObject({ status: "open", lines: [{ status: "completed", outstanding: "0.000000" }, { status: "open" }] });
    const over = await receive(twoLines.id, [{ line: 2, quantity: "12", unit: "each" }]);
    expect((json(over).data as PostedReceiptView).warnings).toEqual([{ code: "OVER_RECEIPT", line: 2, excess: "2.000000" }]);
    expect(await getOrder(twoLines.id)).toMatchObject({ status: "completed", lines: [{ received: "110.000000" }, { received: "12.000000", outstanding: "0.000000" }] });

    const closed = await receive(exact.id, [{ line: 1, quantity: "1", unit: "kg" }]);
    expect(closed.status).toBe(409);
    expect(json(closed).error.code).toBe("PURCHASE_ORDER_NOT_OPEN");
  });

  it("dates the receipt and its movement today, keeps the planned date, and audits with its own timestamp (INV-010, AUD-030, INV-012)", async () => {
    await freshMaterials();
    const order = await placeOrder();

    const receipt = json(await receive(order.id, [{ line: 1, quantity: "30", unit: "kg" }])).data as PostedReceiptView;

    expect(receipt.businessDate).toBe(today());
    expect((await getOrder(order.id)).lines[0].plannedDate).toBe("2026-10-13");
    const [movement] = (json(await api("GET", `/api/tenants/prod/stock?material=${ids.steel}&location=${ids.plant}`)).data as StockView).movements;
    expect(movement).toMatchObject({ type: "goods-receipt", businessDate: today(), reason: `Goods receipt ${receipt.id} for purchase order ${order.id}` });
    const audit = (json(await api("GET", "/api/tenants/prod/audit?limit=100")).data as AuditPage).entries.find(
      (entry) => entry.action === "goods-receipts.goods-receipt.posted" && entry.subject.id === receipt.id,
    )!;
    expect(audit).toMatchObject({ channel: "api", after: { purchaseOrder: order.id, businessDate: today() } });
    expect(new Date(audit.occurredAt).getTime()).toBeGreaterThan(Date.now() - 600_000);

    expect((await api("GET", `/api/tenants/prod/goods-receipts?purchaseOrder=${order.id}`)).text).toContain(receipt.id);
    expect(json(await api("GET", `/api/tenants/prod/goods-receipts/${receipt.id}`)).data as ReceiptView).toMatchObject({ id: receipt.id, purchaseOrder: order.id });
    const missing = await api("GET", "/api/tenants/test/goods-receipts/99999999");
    expect(missing.status).toBe(404);
    expect(json(missing).error.code).toBe("GOODS_RECEIPT_NOT_FOUND");
  });

  it("refuses supplier, location and a received line's material, unit or quantity, and keeps planned dates editable (BUY-020…024, MAT-031)", async () => {
    await freshMaterials();
    const unposted = await placeOrder();
    // MAT-031: a material on an order line, with no posting yet, keeps its base unit (the bolt has no conversion to remove first).
    const bolt = json(await api("GET", `/api/tenants/prod/materials/${ids.bolt}`)).data as { version: number };
    const unit = await write("PATCH", `/api/tenants/prod/materials/${ids.bolt}`, { version: bolt.version, baseUnit: "pcs" });
    expect(unit.status).toBe(409);
    expect(json(unit).error.code).toBe("BASE_UNIT_IN_USE");

    await receive(unposted.id, [{ line: 1, quantity: "80", unit: "kg" }]);
    const { version } = await getOrder(unposted.id);
    const patch = (body: Record<string, unknown>) => write("PATCH", `/api/tenants/prod/purchase-orders/${unposted.id}`, { version, ...body });
    const refusals = [
      await patch({ supplier: ids.acme, lines: [{ line: 1, plannedDate: "2026-10-20" }] }),
      await patch({ location: ids.depot, lines: [{ line: 1, plannedDate: "2026-10-20" }] }),
      await patch({ lines: [{ line: 1, plannedDate: "2026-10-20", material: ids.bolt }] }),
      await patch({ lines: [{ line: 1, plannedDate: "2026-10-20", unit: "t" }] }),
      await patch({ lines: [{ line: 1, plannedDate: "2026-10-20", quantity: "79" }] }),
    ];
    expect(refusals.map(({ status }) => status)).toEqual([400, 400, 400, 400, 400]);
    expect(await getOrder(unposted.id)).toMatchObject({ supplier: ids.acme, location: ids.plant, lines: [{ material: ids.steel, quantity: "100.000000", received: "80.000000", plannedDate: "2026-10-13" }, {}] });

    const moved = await patch({ lines: [{ line: 1, plannedDate: "2026-10-27" }] });
    expect(moved.status).toBe(200);
    expect((json(moved).data as OrderView).lines[0].plannedDate).toBe("2026-10-27");
    expect((json(await api("GET", "/api/tenants/prod/audit?limit=100")).data as AuditPage).entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "purchase-orders.purchase-order.updated", subject: expect.objectContaining({ id: unposted.id }), after: { line1PlannedDate: "2026-10-27" } })]),
    );
  });

  it("returns the original receipt for a retry with the same key and body, posting once (API-021)", async () => {
    await freshMaterials();
    const order = await placeOrder();
    const key = randomUUID();

    const first = await receive(order.id, [{ line: 1, quantity: "30", unit: "kg" }], adminSecret, key);
    const replay = await receive(order.id, [{ line: 1, quantity: "30", unit: "kg" }], adminSecret, key);

    expect(replay.replayed).toBe("true");
    expect(json(replay).data.id).toBe(json(first).data.id);
    expect(await stockOf(ids.steel)).toBe("30.000000");
    expect((await getOrder(order.id)).lines[0].received).toBe("30.000000");
  });

  it("refuses a receipt in a read-only tenant with no movement, reads still working (R05)", async () => {
    await freshMaterials();
    const order = await placeOrder();
    expect((await write("PATCH", "/api/tenants/prod", { readOnly: true })).status).toBe(200);
    try {
      const refused = await receive(order.id, [{ line: 1, quantity: "30", unit: "kg" }], userSecret);
      expect(refused.status).toBe(409);
      expect(json(refused).error.code).toBe("TENANT_READ_ONLY");
      expect((await api("GET", `/api/tenants/prod/goods-receipts?purchaseOrder=${order.id}`)).text).toBe('{"ok":true,"data":[]}');
    } finally {
      expect((await write("PATCH", "/api/tenants/prod", { readOnly: false })).status).toBe(200);
    }
    expect(await stockOf(ids.steel)).toBe("0.000000");
  });
});
