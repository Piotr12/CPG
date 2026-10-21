import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { AuditEntryView, CustomerOrderView } from "@cpg/core";
import { callApi, json } from "./api";
import { clickHydrated, openBrowser, type Browser } from "./browser";
import { signInAs, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");
const USER = "orders-una";
const PASSWORD = "orders una first password";
const ROOT = "/api/tenants/prod/customer-orders";
const field = (name: string) => `[role=dialog] [name='${name}']`;
const edit = (order: CustomerOrderView) => ({ version: order.version, customer: order.customer, location: order.location,
  lines: order.lines.map(({ id, material, enteredQuantity, enteredUnit, requiredDate }) => ({ id, material, quantity: enteredQuantity, unit: enteredUnit, requiredDate })) });

describe("customer orders through the UI and API", () => {
  let admin: Browser; let user: Browser;
  let adminSecret: string; let userSecret: string;
  let customer: { id: string; version: number }; let location: { id: string; version: number };
  let material: string; let steel: string; let uiOrder: CustomerOrderView;
  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}, secret = adminSecret) => callApi(baseUrl, method, path, secret, options);
  const write = (method: string, path: string, body: unknown, secret = adminSecret) => api(method, path, { key: randomUUID(), body }, secret);
  const getOrder = async (id: string) => json(await api("GET", `${ROOT}/${id}`)).data as CustomerOrderView;
  const orders = async () => json(await api("GET", ROOT)).data as CustomerOrderView[];
  const input = () => ({ customer: customer.id, location: location.id, lines: [{ material, quantity: "2", unit: "case", requiredDate: "2027-01-04" }] });
  const openCreate = async () => {
    await user.open(`${baseUrl}/admin/prod/customer-orders`);
    await clickHydrated(user, "main button"); await user.waitFor("[role=dialog]");
    await user.select(field("customer"), customer.id); await user.select(field("location"), location.id);
    await user.select(field("lines.0.material"), material); await user.fill(field("lines.0.quantity"), "60");
    expect(await user.fillDate(field("lines.0.requiredDate"), "2027-01-04")).toBe("2027-01-04");
  };
  beforeAll(async () => {
    [admin, user] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword); await openTokens(admin, baseUrl); adminSecret = await createToken(admin, "orders-ops");
    expect((await write("POST", "/api/users", { username: USER, password: PASSWORD })).status).toBe(200);
    customer = json(await write("POST", "/api/tenants/prod/customers", { name: "orders customer" })).data;
    location = json(await write("POST", "/api/tenants/prod/locations", { name: "orders warehouse" })).data;
    material = json(await write("POST", "/api/tenants/prod/materials", { type: "finished", description: "orders cabinet", baseUnit: "each" })).data.id;
    steel = json(await write("POST", "/api/tenants/prod/materials", { type: "raw", description: "orders steel", baseUnit: "kg" })).data.id;
    expect((await write("POST", `/api/tenants/prod/materials/${material}/conversions`, { unit: "case", numerator: "12", denominator: "1" })).status).toBe(200);
    await signInAs(user, baseUrl, USER, PASSWORD); await openTokens(user, baseUrl); userSecret = await createToken(user, "orders-cli");
  });
  afterAll(async () => {
    if (adminSecret) {
      await write("PATCH", "/api/tenants/prod", { readOnly: false });
      const token = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find(({ name }) => name === "orders-ops");
      if (token) await write("DELETE", `/api/tokens/${token.id}`, {});
    }
    await Promise.all([admin?.close(), user?.close()]);
  });

  it("lets a normal user create two dated material lines with one header location, Open and fulfilled zero (SAL-002, SAL-003, SAL-005, LFC-001)", async () => {
    const stock = async () => json(await api("GET", `/api/tenants/prod/stock?material=${material}&location=${location.id}`)).data;
    const beforeStock = await stock();
    expect(beforeStock).toMatchObject({ quantity: "0.000000", movements: [] });
    await openCreate(); await user.clickRole("button", "Add line");
    await user.select(field("lines.1.material"), steel); await user.fill(field("lines.1.quantity"), "2");
    expect(await user.fillDate(field("lines.1.requiredDate"), "2027-01-08")).toBe("2027-01-08");
    await user.click("[role=dialog] button[type=submit]"); await user.waitUntil(`!document.querySelector("[role=dialog]")`);
    const own = (await orders()).filter((order) => order.customer === customer.id); expect(own).toHaveLength(1); uiOrder = own[0];
    expect(uiOrder).toMatchObject({ customer: customer.id, location: location.id, status: "open", lines: [
      { material, quantity: "60.000000", requiredDate: "2027-01-04", status: "open", fulfilled: "0.000000" },
      { material: steel, quantity: "2.000000", requiredDate: "2027-01-08", status: "open", fulfilled: "0.000000" },
    ] });
    expect(await stock()).toEqual(beforeStock);
    await user.open(`${baseUrl}/admin/prod/customer-orders/${uiOrder.id}`); await user.waitForText("60 each"); await user.waitForText("2027-01-08");
    await user.setViewport(390, 844);
    expect(await user.evaluate<boolean>(`(() => { const button = [...document.querySelectorAll("main button")].find((el) => el.textContent === "Edit order"); const r = button.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth; })()`)).toBe(true);
    await user.setViewport(1280, 900);
  });

  it("lets the admin edit an undelivered quantity and records before/after plus UI session (AUD-001, AUD-002, AUD-006)", async () => {
    await admin.open(`${baseUrl}/admin/prod/customer-orders/${uiOrder.id}`); await clickHydrated(admin, "main button");
    await admin.fill(field("lines.0.quantity"), "80"); await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`); await admin.waitForText("80 each");
    const updated = await getOrder(uiOrder.id); expect(updated.version).toBe(uiOrder.version + 1); expect(updated.lines[0].quantity).toBe("80.000000");
    const audit = json(await api("GET", "/api/tenants/prod/audit?limit=100")).data;
    const entries = audit.entries as AuditEntryView[];
    const entry = entries.find(({ action, subject }) => action === "customer-orders.customer-order.updated" && subject.id === uiOrder.id)!;
    expect(entry).toMatchObject({ channel: "ui", sessionId: expect.any(String), before: { lines: expect.stringContaining('"quantity":"60.000000"') }, after: { lines: expect.stringContaining('"quantity":"80.000000"') } });
    uiOrder = updated;
  });

  it("retains the opening version after a UI conflict until the user reloads the edit", async () => {
    await user.open(`${baseUrl}/admin/prod/customer-orders/${uiOrder.id}`); await clickHydrated(user, "main button");
    await user.fill(field("lines.0.quantity"), "81");
    const changes = edit(await getOrder(uiOrder.id)); changes.lines[0].quantity = "90";
    const external = await write("PATCH", `${ROOT}/${uiOrder.id}`, changes); expect(external.status).toBe(200);
    await user.click("[role=dialog] button[type=submit]");
    await user.waitUntil(`document.querySelector("[role=dialog] [role=alert]") || !document.querySelector("[role=dialog]")`);
    expect(await user.evaluate<string | null>(`document.querySelector("[role=dialog] [role=alert]")?.textContent ?? null`)).toMatch(/changed/);
    expect(await user.evaluate<string>(`document.querySelector(${JSON.stringify(field("lines.0.quantity"))}).value`)).toBe("81");
    await user.click("[role=dialog] button[type=submit]");
    await user.waitUntil(`document.querySelector("[role=dialog] [role=alert]") || !document.querySelector("[role=dialog]")`);
    expect((await getOrder(uiOrder.id)).lines[0].quantity).toBe("90.000000");
    await user.clickRole("button", "Cancel");
    await user.waitUntil(`!document.querySelector("[role=dialog], [data-slot=dialog-overlay]")`);
    await clickHydrated(user, "main button");
    expect(await user.evaluate<string>(`document.querySelector(${JSON.stringify(field("lines.0.quantity"))}).value`)).toBe("90");
    await user.press("Escape"); uiOrder = await getOrder(uiOrder.id);
  });

  it("has keyed API parity for both roles, exact conversions, strict line location, stale-version refusals and the creator's account in the audit (SAL-004, AUD-001, AUD-025, R07)", async () => {
    const createdIds: string[] = [];
    for (const secret of [adminSecret, userSecret]) {
      const key = randomUUID(); const body = input();
      const first = await api("POST", ROOT, { key, body }, secret); const replay = await api("POST", ROOT, { key, body }, secret);
      expect(first.status).toBe(200); expect(replay.replayed).toBe("true"); expect(replay.text).toBe(first.text);
      const order = json(first).data as CustomerOrderView; createdIds.push(order.id); expect(order.lines[0]).toMatchObject({ quantity: "24.000000", enteredQuantity: "2", enteredUnit: "case", numerator: "12" });
      const changes = edit(order); changes.lines[0].quantity = "3";
      expect((await write("PATCH", `${ROOT}/${order.id}`, changes, secret)).status).toBe(200);
      const stale = await write("PATCH", `${ROOT}/${order.id}`, edit(order), secret); expect(stale.status).toBe(409); expect(json(stale).error.code).toBe("VERSION_CONFLICT");
      expect((await getOrder(order.id)).lines[0].quantity).toBe("36.000000");
    }
    // The normal user's create entry names their account, with the API channel and their token (AUD-001).
    const created = json(await api("GET", `/api/tenants/prod/audit?subjectType=CustomerOrder&subjectId=${createdIds[1]}`)).data.entries as AuditEntryView[];
    expect(created.filter(({ action }) => action === "customer-orders.customer-order.created")).toEqual([
      expect.objectContaining({ actor: expect.objectContaining({ username: USER }), channel: "api", sessionId: null, token: expect.objectContaining({ name: "orders-cli" }), before: null }),
    ]);
    expect(json(await api("POST", ROOT, { body: input() }, userSecret)).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    const cross = await write("POST", ROOT, { ...input(), lines: [{ ...input().lines[0], location: location.id }] }, userSecret);
    expect(cross.status).toBe(400);
    expect((await api("GET", `${ROOT}?page=2`)).status).toBe(200);
    expect(json(await api("GET", `${ROOT}?page=2`)).data).toEqual([]);
    expect((await api("GET", `${ROOT}?page=0`)).status).toBe(400);
    await user.open(`${baseUrl}/admin/prod/customer-orders?page=2`);
    await user.waitForText("Customer orders — Prod");
    expect(await user.text("main")).toContain(uiOrder.id);
    const before = (await orders()).length;
    for (const body of [{ ...input(), customer: "99999999" }, { ...input(), lines: [{ ...input().lines[0], material: "99999999" }] }])
      expect((await write("POST", ROOT, body, userSecret)).status).toBe(404);
    expect(await orders()).toHaveLength(before);
    // Test starts with the dataset's two years of orders, many pages of them, the latest still open.
    const allPages = async (tenant: string) => {
      const all: CustomerOrderView[] = [];
      for (let page = 1; ; page += 1) {
        const rows = json(await api("GET", `/api/tenants/${tenant}/customer-orders?page=${page}`)).data as CustomerOrderView[];
        all.push(...rows);
        if (rows.length < 100) return all;
      }
    };
    const demo = await allPages("test");
    expect(demo[0].id).toBe("00000001");
    expect(demo.length).toBeGreaterThan(100);
    expect(demo.some(({ status }) => status === "open")).toBe(true);
    // Test holds more orders than Prod, so its last order's ID is one Prod lacks: Prod must not find it.
    const prodIds = new Set((await allPages("prod")).map(({ id }) => id));
    expect(createdIds.every((id) => prodIds.has(id))).toBe(true);
    const testOnly = demo.at(-1)!.id;
    expect(prodIds.has(testOnly)).toBe(false);
    expect((await api("GET", `${ROOT}/${testOnly}`, {}, userSecret)).status).toBe(404);
    const noGeneration = await write("POST", "/api/tenants/test/customer-orders", { customer: "00000001", location: "00000001", lines: [{ material: "00000005", quantity: "1", unit: "each", requiredDate: "2027-01-01" }] });
    expect(noGeneration.status).toBe(428); expect(json(noGeneration).error.code).toBe("GENERATION_REQUIRED");
  });

  it("keeps a stale open dialog's read-only explanation and refuses UI/API writes without order or audit changes (TEN-015)", async () => {
    await openCreate(); const before = await orders();
    const beforeAudit = json(await api("GET", "/api/tenants/prod/audit?limit=100")).data.entries;
    try {
      expect((await write("PATCH", "/api/tenants/prod", { readOnly: true })).status).toBe(200);
      await user.click("[role=dialog] button[type=submit]"); await user.waitFor("[role=dialog] [role=alert]");
      expect(await user.text("[role=dialog] [role=alert]")).toMatch(/read-only/);
      for (const secret of [adminSecret, userSecret]) expect(json(await write("POST", ROOT, input(), secret)).error.code).toBe("TENANT_READ_ONLY");
      expect(await orders()).toEqual(before); expect(json(await api("GET", "/api/tenants/prod/audit?limit=100")).data.entries).toEqual(beforeAudit);
    } finally { await write("PATCH", "/api/tenants/prod", { readOnly: false }); }
    await user.press("Escape");
  });

  it("allows customer deactivation while keeping the order editable, blocks new selection and material demand deactivation (LFC-014)", async () => {
    expect((await write("PATCH", `/api/tenants/prod/customers/${customer.id}`, { active: false, version: customer.version })).status).toBe(200);
    expect(json(await write("POST", ROOT, input(), userSecret)).error.code).toBe("CUSTOMER_INACTIVE");
    const changes = edit(await getOrder(uiOrder.id)); changes.lines[0].quantity = "81";
    expect((await write("PATCH", `${ROOT}/${uiOrder.id}`, changes, userSecret)).status).toBe(200);
    const master = json(await api("GET", `/api/tenants/prod/materials/${material}`)).data;
    const blocked = await write("PATCH", `/api/tenants/prod/materials/${material}`, { active: false, version: master.version });
    expect(blocked.status).toBe(409); expect(json(blocked).error).toMatchObject({ code: "MATERIAL_HAS_CUSTOMER_DEMAND", message: expect.stringContaining("Customer order") });
    await user.open(`${baseUrl}/admin/prod/customer-orders/${uiOrder.id}`); await clickHydrated(user, "main button");
    expect(await user.evaluate<string>(`document.querySelector(${JSON.stringify(field("customer"))}).selectedOptions[0].textContent`)).toContain("Inactive");
    await user.press("Escape");
  });
  it("keeps API pages bounded and lets a user navigate a collection beyond 100 orders", async () => {
    const created = await write("POST", "/api/tenants/prod/customers", { name: "orders pagination " + "long customer name ".repeat(4) });
    expect(created.status).toBe(200);
    const customer = json(created).data;
    for (let index = 0; index < 101; index++) expect((await write("POST", ROOT, { ...input(), customer: customer.id })).status).toBe(200);
    const first = await orders(); const second = json(await api("GET", `${ROOT}?page=2`)).data as CustomerOrderView[];
    expect(first).toHaveLength(100); expect(second.length).toBeGreaterThan(0); expect(second.length).toBeLessThan(100);
    expect(first.at(-1)!.id < second[0].id).toBe(true);
    await user.open(`${baseUrl}/admin/prod/customer-orders`);
    await user.waitForText("Page 1 of 2"); await clickHydrated(user, "main a[href$='page=2']");
    await user.waitForText("Page 2 of 2"); expect(await user.text("main")).toContain(second[0].id);
    await user.setViewport(390, 844);
    expect(await user.evaluate<number>("document.documentElement.scrollWidth")).toBe(390);
    await clickHydrated(user, "main a[href$='page=1']"); await user.waitForText("Page 1 of 2");
    await user.setViewport(1280, 900);
  });

});
