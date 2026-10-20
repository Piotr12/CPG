import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const PASSWORD = "buyapi first password";

interface Requisition {
  id: string;
  quantity: string;
  converted: string;
  outstanding: string;
  status: string;
  version: number;
}

interface OrderLine {
  line: number;
  material: string;
  quantity: string;
  enteredQuantity: string;
  enteredUnit: string;
  plannedDate: string;
  requisition: string | null;
}

interface Order {
  id: string;
  supplier: string;
  location: string;
  status: string;
  version: number;
  lines: OrderLine[];
}

// Purchase requisitions and purchase orders through the API (R07): BUY-002…009, BUY-025, LFC-001,
// LFC-013, LFC-021, LFC-023, AUD-025, AUD-027, TEN-014, R05.
describe("purchase requisitions and orders through the API", () => {
  let admin: Browser;
  let adminSecret: string;
  /** A normal user's token: any signed-in account may write procurement documents. */
  let userSecret: string;
  let user: Browser;
  /** This file's own Prod masters. */
  const ids: Record<"steel" | "bolt" | "plant" | "depot" | "acme" | "gone", string> = {} as never;

  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}, secret = adminSecret) =>
    callApi(baseUrl, method, path, secret, options);
  const write = (method: string, path: string, body: unknown, secret = adminSecret) => api(method, path, { key: randomUUID(), body }, secret);
  const create = async (path: string, body: unknown) => json(await write("POST", path, body)).data.id as string;
  const requisition = async (overrides: Record<string, unknown> = {}, secret = adminSecret) => {
    const response = await write(
      "POST",
      "/api/tenants/prod/purchase-requisitions",
      { material: ids.steel, location: ids.plant, quantity: "100", unit: "kg", requiredDate: "2027-03-01", ...overrides },
      secret,
    );
    expect(response.status).toBe(200);
    return json(response).data as Requisition;
  };
  const getRequisition = async (id: string) => json(await api("GET", `/api/tenants/prod/purchase-requisitions/${id}`)).data as Requisition;
  const line = (material: string, quantity: string, unit: string, plannedDate: string, extra: Record<string, unknown> = {}) => ({
    material,
    quantity,
    unit,
    plannedDate,
    ...extra,
  });
  const order = (lines: unknown[], overrides: Record<string, unknown> = {}) => ({ supplier: ids.acme, location: ids.plant, lines, ...overrides });
  const placeOrder = async (body: unknown, secret = adminSecret) => write("POST", "/api/tenants/prod/purchase-orders", body, secret);
  const orders = async (tenant: string) => json(await api("GET", `/api/tenants/${tenant}/purchase-orders`)).data as Order[];

  beforeAll(async () => {
    admin = openBrowser();
    user = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, "buyapi-ops");
    ids.steel = await create("/api/tenants/prod/materials", { type: "raw", description: "buyapi steel", baseUnit: "kg" });
    ids.bolt = await create("/api/tenants/prod/materials", { type: "raw", description: "buyapi bolt", baseUnit: "each" });
    await write("POST", `/api/tenants/prod/materials/${ids.steel}/conversions`, { unit: "t", numerator: "1000", denominator: "1" });
    ids.plant = await create("/api/tenants/prod/locations", { name: "buyapi plant" });
    ids.depot = await create("/api/tenants/prod/locations", { name: "buyapi depot" });
    // Test holds the three demo suppliers: pad Prod past them so `gone` is Prod's alone (TEN-014).
    while (Number(await create("/api/tenants/prod/suppliers", { name: "buyapi pad" })) < 3);
    ids.acme = await create("/api/tenants/prod/suppliers", { name: "buyapi acme" });
    ids.gone = await create("/api/tenants/prod/suppliers", { name: "buyapi gone" });
    await write("POST", "/api/users", { username: "buyapi-una", password: PASSWORD });
    await signIn(user, baseUrl, PASSWORD, "buyapi-una");
    await openTokens(user, baseUrl);
    userSecret = await createToken(user, "buyapi-una-cli");
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find((token) => token.name === "buyapi-ops")!;
    await api("DELETE", `/api/tokens/${own.id}`, { key: randomUUID() });
    await Promise.all([admin.close(), user.close()]);
  });

  it("saves a direct PO Open with dated lines and no requisition, once per key, for a normal user's token (BUY-002, BUY-005, BUY-006, BUY-008, LFC-001)", async () => {
    const key = randomUUID();
    const body = order([line(ids.steel, "0.5", "t", "2027-03-03"), line(ids.bolt, "10", "each", "2027-03-05")]);

    const first = await api("POST", "/api/tenants/prod/purchase-orders", { key, body }, userSecret);
    const replay = await api("POST", "/api/tenants/prod/purchase-orders", { key, body }, userSecret);

    expect(first.status).toBe(200);
    expect(replay.replayed).toBe("true");
    const placed = json(first).data as Order;
    expect(json(replay).data).toMatchObject({ id: placed.id });
    expect((await orders("prod")).filter(({ id }) => id === placed.id)).toHaveLength(1);
    expect(placed).toMatchObject({ status: "open", supplier: ids.acme, location: ids.plant });
    expect(placed.lines).toMatchObject([
      { line: 1, material: ids.steel, quantity: "500.000000", enteredQuantity: "0.5", enteredUnit: "t", plannedDate: "2027-03-03", requisition: null },
      { line: 2, material: ids.bolt, quantity: "10.000000", plannedDate: "2027-03-05", requisition: null },
    ]);
  });

  it("refuses a line at another location than the order's, saving nothing (BUY-007)", async () => {
    const before = (await orders("prod")).length;

    const mixed = await placeOrder(order([line(ids.steel, "1", "kg", "2027-03-03"), line(ids.bolt, "1", "each", "2027-03-03", { location: ids.depot })]));

    expect(mixed.status).toBe(400);
    expect(json(mixed).error.fieldErrors).toEqual({ "lines.1.location": ["A purchase order has one location: this line is for another."] });
    expect((await orders("prod")).length).toBe(before);
  });

  it("creates an Open requisition with converted 0 (LFC-001)", async () => {
    const created = await requisition({ quantity: "100" });

    expect(created).toMatchObject({ quantity: "100.000000", converted: "0.000000", outstanding: "100.000000", status: "open", version: 1 });
    expect(await getRequisition(created.id)).toMatchObject({ id: created.id, status: "open" });
  });

  it("converts 60 of a requisition, then 40 to another supplier completes it, (BUY-003, BUY-004)", async () => {
    const source = await requisition();

    const first = json(await placeOrder(order([line(ids.steel, "60", "kg", "2027-03-04", { requisition: source.id })]))).data as Order;
    expect(first.lines[0]).toMatchObject({ quantity: "60.000000", requisition: source.id });
    expect(await getRequisition(source.id)).toMatchObject({ converted: "60.000000", outstanding: "40.000000", status: "open" });

    const second = await placeOrder(order([line(ids.steel, "40", "kg", "2027-03-06", { requisition: source.id })], { supplier: ids.gone }));
    expect(second.status).toBe(200);
    expect(await getRequisition(source.id)).toMatchObject({ converted: "100.000000", outstanding: "0.000000", status: "completed" });
  });

  it("refuses converting more than is outstanding, or a completed requisition, changing nothing", async () => {
    const source = await requisition({ quantity: "10" });

    const over = await placeOrder(order([line(ids.steel, "10.000001", "kg", "2027-03-04", { requisition: source.id })]));
    expect(over.status).toBe(409);
    expect(json(over).error.code).toBe("REQUISITION_OVER_CONVERTED");
    expect(await getRequisition(source.id)).toMatchObject({ converted: "0.000000", status: "open" });

    await placeOrder(order([line(ids.steel, "10", "kg", "2027-03-04", { requisition: source.id })]));
    const again = await placeOrder(order([line(ids.steel, "1", "kg", "2027-03-04", { requisition: source.id })]));
    expect(again.status).toBe(409);
    expect(json(again).error.code).toBe("REQUISITION_NOT_OPEN");
  });

  it("refuses an inactive supplier, and a supplier from the other tenant, for a new PO; an earlier PO stays usable (BUY-025, LFC-021, LFC-023, AUD-027, TEN-014)", async () => {
    const earlier = json(await placeOrder(order([line(ids.bolt, "1", "each", "2027-03-03")], { supplier: ids.gone }))).data as Order;
    const gone = json(await api("GET", `/api/tenants/prod/suppliers/${ids.gone}`)).data as { version: number };
    const deactivated = await write("PATCH", `/api/tenants/prod/suppliers/${ids.gone}`, { version: gone.version, active: false });
    expect(deactivated.status).toBe(200);

    const refused = await placeOrder(order([line(ids.bolt, "1", "each", "2027-03-03")], { supplier: ids.gone }));
    expect(refused.status).toBe(409);
    expect(json(refused).error.code).toBe("SUPPLIER_INACTIVE");
    // Test's suppliers are 00000001…: a Prod supplier past them is not Test's.
    const testSuppliers = new Set((json(await api("GET", "/api/tenants/test/suppliers")).data as { id: string }[]).map(({ id }) => id));
    expect(testSuppliers.has(ids.gone)).toBe(false);

    const read = json(await api("GET", `/api/tenants/prod/purchase-orders/${earlier.id}`)).data as Order;
    expect(read).toMatchObject({ supplier: ids.gone, status: "open" });
    const changed = await write("PATCH", `/api/tenants/prod/purchase-orders/${earlier.id}`, { version: read.version, lines: [{ line: 1, plannedDate: "2027-03-09" }] });
    expect(changed.status).toBe(200);
    expect((json(changed).data as Order).lines[0].plannedDate).toBe("2027-03-09");
  });

  it("refuses to deactivate a material that has an open PO line, naming the PO (LFC-013)", async () => {
    const washer = await create("/api/tenants/prod/materials", { type: "raw", description: "buyapi washer", baseUnit: "each" });
    const placed = json(await placeOrder(order([line(washer, "5", "each", "2027-03-03")]))).data as Order;
    const material = json(await api("GET", `/api/tenants/prod/materials/${washer}`)).data as { version: number };

    const refused = await write("PATCH", `/api/tenants/prod/materials/${washer}`, { version: material.version, active: false });

    expect(refused.status).toBe(409);
    expect(json(refused).error).toMatchObject({ code: "MATERIAL_IN_OPEN_ORDER", message: expect.stringContaining(`Purchase order ${placed.id} `) });
  });

  it("answers a stale version with 409 and keeps the newer change (AUD-025, API-029)", async () => {
    const source = await requisition();
    const changed = await write("PATCH", `/api/tenants/prod/purchase-requisitions/${source.id}`, { version: source.version, requiredDate: "2027-04-01" });
    expect(json(changed).data).toMatchObject({ requiredDate: "2027-04-01", version: source.version + 1 });

    const stale = await write("PATCH", `/api/tenants/prod/purchase-requisitions/${source.id}`, { version: source.version, requiredDate: "2027-05-01" });
    expect(stale.status).toBe(409);
    expect(json(stale).error.code).toBe("VERSION_CONFLICT");
    expect((await getRequisition(source.id)).version).toBe(source.version + 1);

    const placed = json(await placeOrder(order([line(ids.bolt, "1", "each", "2027-03-03")]))).data as Order;
    await write("PATCH", `/api/tenants/prod/purchase-orders/${placed.id}`, { version: placed.version, lines: [{ line: 1, plannedDate: "2027-03-20" }] });
    const staleOrder = await write("PATCH", `/api/tenants/prod/purchase-orders/${placed.id}`, { version: placed.version, lines: [{ line: 1, plannedDate: "2027-03-21" }] });
    expect(staleOrder.status).toBe(409);
    expect(json(staleOrder).error.code).toBe("VERSION_CONFLICT");
  });

  it("starts Test with a demonstration requisition and PO, and needs the Test generation to write there (D06, API-034)", async () => {
    const requisitions = json(await api("GET", "/api/tenants/test/purchase-requisitions")).data as Requisition[];
    const demo = await orders("test");

    expect(requisitions.slice(0, 2).map(({ id }) => id)).toEqual(["00000001", "00000002"]);
    expect(demo[0]).toMatchObject({ id: "00000001", status: "open" });
    expect(demo[0].lines.map(({ requisition }) => requisition)).toEqual(["00000001", null]);
    expect(requisitions[0]).toMatchObject({ converted: "60.000000", status: "open" });

    const missing = await write("POST", "/api/tenants/test/purchase-requisitions", { material: "00000001", location: "00000001", quantity: "1", unit: "kg", requiredDate: "2027-03-01" });
    expect(missing.status).toBe(428);
    expect(json(missing).error.code).toBe("GENERATION_REQUIRED");
  });

  it("doesn't find another tenant's requisition or order (TEN-014)", async () => {
    const source = await requisition();
    const placed = json(await placeOrder(order([line(ids.bolt, "1", "each", "2027-03-03")]))).data as Order;
    const testRequisitions = new Set((json(await api("GET", "/api/tenants/test/purchase-requisitions")).data as { id: string }[]).map(({ id }) => id));
    const testOrders = new Set((await orders("test")).map(({ id }) => id));

    // Test holds only its two demo requisitions and one order, so these Prod IDs are Prod's alone.
    expect(testRequisitions.has(source.id)).toBe(false);
    expect(testOrders.has(placed.id)).toBe(false);
    const requisitionRead = await api("GET", `/api/tenants/test/purchase-requisitions/${source.id}`);
    const orderRead = await api("GET", `/api/tenants/test/purchase-orders/${placed.id}`);
    expect(requisitionRead.status).toBe(404);
    expect(json(requisitionRead).error.code).toBe("REQUISITION_NOT_FOUND");
    expect(orderRead.status).toBe(404);
    expect(json(orderRead).error.code).toBe("PURCHASE_ORDER_NOT_FOUND");
  });

  it("refuses requisition and PO writes in a read-only tenant, reads still working (R05)", async () => {
    const body = { material: ids.steel, location: ids.plant, quantity: "1", unit: "kg", requiredDate: "2027-03-01" };
    expect((await write("PATCH", "/api/tenants/prod", { readOnly: true })).status).toBe(200);
    try {
      const refusedRequisition = await write("POST", "/api/tenants/prod/purchase-requisitions", body);
      const refusedOrder = await placeOrder(order([line(ids.bolt, "1", "each", "2027-03-03")]));
      for (const response of [refusedRequisition, refusedOrder]) {
        expect(response.status).toBe(409);
        expect(json(response).error.code).toBe("TENANT_READ_ONLY");
      }
      expect((await api("GET", "/api/tenants/prod/purchase-requisitions")).status).toBe(200);
    } finally {
      expect((await write("PATCH", "/api/tenants/prod", { readOnly: false })).status).toBe(200);
    }
  });
});
