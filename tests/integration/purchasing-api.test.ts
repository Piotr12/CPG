import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json } from "./api";
import { clickHydrated, openBrowser, type Browser } from "./browser";
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
// LFC-013, LFC-021, LFC-023, AUD-025, AUD-027, TEN-014, E2E-017, R05.
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
  /** One page of a tenant's purchase orders (100 to a page); the first when `page` is omitted. */
  const ordersPage = async (tenant: string, page?: number) =>
    json(await api("GET", `/api/tenants/${tenant}/purchase-orders${page === undefined ? "" : `?page=${page}`}`)).data as Order[];
  /** Every purchase order of a tenant, walking its pages. */
  const orders = async (tenant: string) => {
    const all: Order[] = [];
    for (let page = 1, batch = await ordersPage(tenant, page); batch.length > 0; batch = await ordersPage(tenant, ++page)) all.push(...batch);
    return all;
  };

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
    // Pad Prod past Test's suppliers (its two, plus any another file added) so `gone` is Prod's alone (TEN-014).
    const testSuppliers = (json(await api("GET", "/api/tenants/test/suppliers")).data as unknown[]).length;
    while (Number(await create("/api/tenants/prod/suppliers", { name: "buyapi pad" })) < testSuppliers);
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
    // Test's suppliers are 00000001…: the Prod supplier past them is not Test's, so a Test order naming it is refused.
    const testSuppliers = new Set((json(await api("GET", "/api/tenants/test/suppliers")).data as { id: string }[]).map(({ id }) => id));
    expect(testSuppliers.has(ids.gone)).toBe(false);
    const testOrders = (await orders("test")).length;
    const { generation } = json(await api("GET", "/api/tenants/test")).data as { generation: number };
    const foreign = await api("POST", "/api/tenants/test/purchase-orders", {
      key: randomUUID(),
      generation,
      body: { supplier: ids.gone, location: "00000001", lines: [line("00000001", "1", "kg", "2027-03-03")] },
    });
    expect(foreign.status).toBe(404);
    expect(json(foreign).error.code).toBe("SUPPLIER_NOT_FOUND");
    expect((await orders("test")).length).toBe(testOrders);

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
    expect(json(refused).error).toMatchObject({ code: "MATERIAL_IN_OPEN_ORDER", message: expect.stringContaining(`Purchase order ${placed.id} `), params: { order: placed.id } });
  });

  it("receives an Open PO after its supplier is deactivated, with its movement and audit entry, and refuses a new PO for that supplier (E2E-017)", async () => {
    const supplier = await create("/api/tenants/prod/suppliers", { name: "buyapi retired" });
    const nut = await create("/api/tenants/prod/materials", { type: "raw", description: "buyapi nut", baseUnit: "each" });
    const placing = await placeOrder(order([line(nut, "8", "each", "2027-03-03")], { supplier }));
    expect(placing.status).toBe(200);
    const placed = json(placing).data as Order;
    const { version } = json(await api("GET", `/api/tenants/prod/suppliers/${supplier}`)).data as { version: number };
    expect((await write("PATCH", `/api/tenants/prod/suppliers/${supplier}`, { version, active: false })).status).toBe(200);

    const posted = await write("POST", "/api/tenants/prod/goods-receipts", { purchaseOrder: placed.id, lines: [{ line: 1, quantity: "8", unit: "each" }] });

    expect(posted.status).toBe(200);
    const receipt = json(posted).data as { id: string };
    expect(json(await api("GET", `/api/tenants/prod/purchase-orders/${placed.id}`)).data).toMatchObject({ supplier, status: "completed" });
    const stock = json(await api("GET", `/api/tenants/prod/stock?material=${nut}&location=${ids.plant}`)).data as { quantity: string; movements: { type: string; reason: string }[] };
    expect(stock.quantity).toBe("8.000000");
    expect(stock.movements).toEqual([expect.objectContaining({ type: "goods-receipt", reason: `Goods receipt ${receipt.id} for purchase order ${placed.id}` })]);
    const audit = (json(await api("GET", "/api/tenants/prod/audit?limit=100")).data.entries as { action: string; subject: { id: string }; after: unknown }[]).find(
      (entry) => entry.action === "goods-receipts.goods-receipt.posted" && entry.subject.id === receipt.id,
    );
    expect(audit).toMatchObject({ after: { purchaseOrder: placed.id } });

    const refused = await placeOrder(order([line(nut, "1", "each", "2027-03-03")], { supplier }));
    expect(refused.status).toBe(409);
    expect(json(refused).error.code).toBe("SUPPLIER_INACTIVE");
  });

  it("refuses to deactivate a location an Open PO delivers to, then one with an Open requisition, naming each; once both are cancelled it goes (LFC-018)", async () => {
    const site = await create("/api/tenants/prod/locations", { name: "buyapi site" });
    const placed = json(await placeOrder(order([line(ids.bolt, "1", "each", "2027-03-03")], { location: site }))).data as Order;
    const need = await requisition({ location: site });
    const deactivate = async () => {
      const { version } = json(await api("GET", `/api/tenants/prod/locations/${site}`)).data as { version: number };
      return write("PATCH", `/api/tenants/prod/locations/${site}`, { version, active: false });
    };

    const byOrder = await deactivate();
    expect(byOrder.status).toBe(409);
    expect(json(byOrder).error).toMatchObject({ code: "LOCATION_HAS_PURCHASE_ORDERS", params: { order: placed.id } });
    expect((await write("POST", `/api/tenants/prod/purchase-orders/${placed.id}/cancel`, { version: placed.version })).status).toBe(200);

    const byRequisition = await deactivate();
    expect(byRequisition.status).toBe(409);
    expect(json(byRequisition).error).toMatchObject({ code: "LOCATION_HAS_REQUISITIONS", params: { requisition: need.id } });
    expect(json(await api("GET", `/api/tenants/prod/locations/${site}`)).data).toMatchObject({ active: true });
    expect((await write("POST", `/api/tenants/prod/purchase-requisitions/${need.id}/cancel`, { version: need.version })).status).toBe(200);

    const done = await deactivate();
    expect(done.status).toBe(200);
    expect(json(done).data).toMatchObject({ id: site, active: false });
  });

  it("keeps a PO readable in the API and the UI after the material of its cancelled line is deactivated, and receives its other line (MAT-029)", async () => {
    const rivet = await create("/api/tenants/prod/materials", { type: "raw", description: "buyapi rivet", baseUnit: "each" });
    const placed = json(await placeOrder(order([line(rivet, "5", "each", "2027-03-03"), line(ids.bolt, "2", "each", "2027-03-04")]))).data as Order;
    expect((await write("POST", `/api/tenants/prod/purchase-orders/${placed.id}/cancel`, { version: placed.version, lines: [1] })).status).toBe(200);
    const material = json(await api("GET", `/api/tenants/prod/materials/${rivet}`)).data as { version: number };
    expect((await write("PATCH", `/api/tenants/prod/materials/${rivet}`, { version: material.version, active: false })).status).toBe(200);

    const read = await api("GET", `/api/tenants/prod/purchase-orders/${placed.id}`);
    expect(read.status).toBe(200);
    expect(json(read).data).toMatchObject({ status: "open", lines: [{ line: 1, material: rivet, status: "cancelled" }, { line: 2, material: ids.bolt, status: "open" }] });
    await admin.open(`${baseUrl}/admin/prod/purchase-orders/${placed.id}`);
    await admin.waitUntil(`document.querySelector("main table") && !document.querySelector("main table").closest("[hidden]")`);
    const shown = await admin.evaluate<string[]>(`[...document.querySelector("main table").querySelectorAll(":scope tbody tr")].map((row) => row.cells[1].innerText.trim())`);
    expect(shown).toEqual([expect.stringContaining("buyapi rivet"), expect.stringContaining("buyapi bolt")]);

    const receipt = await write("POST", "/api/tenants/prod/goods-receipts", { purchaseOrder: placed.id, lines: [{ line: 2, quantity: "2", unit: "each" }] });
    expect(receipt.status).toBe(200);
    expect(json(await api("GET", `/api/tenants/prod/purchase-orders/${placed.id}`)).data).toMatchObject({ status: "closed-early", lines: [{ material: rivet }, { status: "completed" }] });
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

  it("starts Test with the dataset's requisitions and POs, two requisitions converted in full by the last run before this month, and needs the Test generation to write there (D06, BUY-003, API-034)", async () => {
    const requisitions = (json(await api("GET", "/api/tenants/test/purchase-requisitions")).data as Requisition[]).slice(0, 5);
    const demo = await orders("test");

    expect(requisitions.map(({ id }) => id)).toEqual(["00000001", "00000002", "00000003", "00000004", "00000005"]);
    for (const converted of requisitions.slice(0, 2)) {
      expect(converted).toMatchObject({ status: "completed", converted: converted.quantity, outstanding: "0.000000" });
      // Received early in the month: open until its receipt, completed after it.
      expect(demo.find(({ lines }) => lines.some(({ requisition }) => requisition === converted.id))).toMatchObject({ status: expect.stringMatching(/^(open|completed)$/) });
    }
    expect(requisitions.slice(2).map(({ quantity, converted, status }) => [quantity, converted, status])).toEqual([
      ["1000.000000", "0.000000", "open"],
      ["40.000000", "0.000000", "open"],
      ["30.000000", "0.000000", "open"],
    ]);
    // The history is received; the latest orders are still open.
    expect(demo[0]).toMatchObject({ id: "00000001", status: "completed" });
    expect(demo.some(({ status }) => status === "open")).toBe(true);

    const missing = await write("POST", "/api/tenants/test/purchase-requisitions", { material: "00000001", location: "00000001", quantity: "1", unit: "kg", requiredDate: "2027-03-01" });
    expect(missing.status).toBe(428);
    expect(json(missing).error.code).toBe("GENERATION_REQUIRED");
  });

  it("doesn't find another tenant's requisition or order (TEN-014)", async () => {
    // Test holds a handful of requisitions: create Prod ones until one gets an ID Test lacks.
    const testRequisitions = new Set((json(await api("GET", "/api/tenants/test/purchase-requisitions")).data as { id: string }[]).map(({ id }) => id));
    let source = await requisition();
    while (testRequisitions.has(source.id)) source = await requisition();
    // IDs run from 00000001 in each tenant, so the tenant with more orders has an ID the other lacks (one more
    // Prod order breaks a tie): the other must not find it.
    const testOrders = await orders("test");
    const prodOrders = await orders("prod");
    if (prodOrders.length === testOrders.length) prodOrders.push(json(await placeOrder(order([line(ids.steel, "1", "kg", "2027-03-03")]))).data as Order);
    const [larger, other, otherOrders] = testOrders.length > prodOrders.length ? [testOrders, "prod", prodOrders] : [prodOrders, "test", testOrders];
    const onlyOne = larger.at(-1)!.id;
    expect(otherOrders.some(({ id }) => id === onlyOne)).toBe(false);
    const requisitionRead = await api("GET", `/api/tenants/test/purchase-requisitions/${source.id}`);
    const orderRead = await api("GET", `/api/tenants/${other}/purchase-orders/${onlyOne}`);
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

  it("pages the requisition list by 100 in the API (?page=, additive) and on screen, past 100 requisitions (#187)", async () => {
    const mine = new Set<string>();
    for (let index = 0; index < 101; index++) mine.add((await requisition({ quantity: "1" })).id);
    const requisitionsPage = async (query = "") => {
      const response = await api("GET", `/api/tenants/prod/purchase-requisitions${query}`);
      expect(response.status).toBe(200);
      return json(response).data as Requisition[];
    };

    const first = await requisitionsPage();
    expect(first).toHaveLength(100);
    expect(await requisitionsPage("?page=1")).toEqual(first);
    const all = [...first];
    for (let page = 2, batch = await requisitionsPage(`?page=${page}`); batch.length > 0; batch = await requisitionsPage(`?page=${++page}`)) {
      expect(batch.length).toBeLessThanOrEqual(100);
      all.push(...batch);
    }
    const ids = all.map(({ id }) => id);
    // Every page continues the IDs of the one before, and the pages together hold every requisition once.
    expect(ids).toEqual([...new Set(ids)].sort());
    expect([...mine].every((id) => ids.includes(id))).toBe(true);
    const pages = Math.ceil(all.length / 100);
    expect(await requisitionsPage(`?page=${pages + 1}`)).toEqual([]);
    for (const bad of ["?page=0", "?page=x", "?page=1.5"]) expect((await api("GET", `/api/tenants/prod/purchase-requisitions${bad}`)).status).toBe(400);

    await user.open(`${baseUrl}/admin/prod/purchase-requisitions`);
    const nav = 'main nav[aria-label="Purchase requisition pages"]';
    await user.waitForText(`Page 1 of ${pages}`);
    expect(await user.evaluate<string[]>(`[...document.querySelectorAll('${nav} a')].map((link) => link.textContent)`)).toEqual(["Next"]);
    await clickHydrated(user, `${nav} a[href$='page=2']`);
    await user.waitForText(`Page 2 of ${pages}`);
    // Next.js keeps page 1 mounted but hidden: read the shown table's first row.
    expect(await user.evaluate<string>(`[...document.querySelectorAll("main table tbody tr")].find((row) => row.offsetParent).cells[0].textContent`)).toBe(all[100].id);
  });

  it("searches and sorts both lists on the server, and refuses a sort key they don't list (#221)", async () => {
    const rivet = await create("/api/tenants/prod/materials", { type: "raw", description: "buysq rivet", baseUnit: "each" });
    const requisitions: string[] = [];
    for (const requiredDate of ["2027-06-02", "2027-06-03", "2027-06-01"]) {
      requisitions.push((await requisition({ material: rivet, unit: "each", requiredDate })).id);
    }
    const zulu = await create("/api/tenants/prod/suppliers", { name: "buysq zulu" });
    const yankee = await create("/api/tenants/prod/suppliers", { name: "buysq yankee" });
    const orderIds: string[] = [];
    for (const supplier of [yankee, zulu]) {
      const response = await placeOrder(order([line(rivet, "5", "each", "2027-06-10")], { supplier }));
      expect(response.status).toBe(200);
      orderIds.push(json(response).data.id);
    }
    const list = async (path: string, query: string) => {
      const response = await api("GET", `/api/tenants/prod/${path}?${query}`);
      expect(response.status).toBe(200);
      return json(response).data as { id: string; requiredDate?: string; supplier?: string }[];
    };

    expect((await list("purchase-requisitions", "q=buysq")).map(({ id }) => id)).toEqual(requisitions);
    expect((await list("purchase-requisitions", "q=buysq&sort=requiredDate&dir=desc")).map(({ requiredDate }) => requiredDate)).toEqual([
      "2027-06-03", "2027-06-02", "2027-06-01",
    ]);
    expect((await list("purchase-requisitions", "q=buysq&page=2")).map(({ id }) => id)).toEqual([]);
    expect((await list("purchase-orders", "q=buysq")).map(({ id }) => id)).toEqual(orderIds);
    expect((await list("purchase-orders", "q=buysq&sort=supplier")).map(({ supplier }) => supplier)).toEqual([zulu, yankee]);
    expect((await list("purchase-orders", "q=buysq+zulu&sort=supplier&dir=desc")).map(({ supplier }) => supplier)).toEqual([zulu]);
    expect((await list("purchase-orders", "q=buysq&surprise=1")).map(({ id }) => id)).toEqual(orderIds);

    for (const path of ["purchase-requisitions", "purchase-orders"]) {
      const refused = await api("GET", `/api/tenants/prod/${path}?sort=price`);
      expect(refused.status).toBe(400);
      expect(json(refused).error).toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { sort: ["Sort by one of this list's columns."] } });
    }
  });
});
