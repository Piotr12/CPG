import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { AuditPage, StockView, StockMovementView } from "@cpg/core";
import { openBrowser, type Browser } from "./browser";
import { signInAs, signInAsAdmin, hydrated, choosePreference, restoreDefaultPreferences } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const PASSWORD = "stock integration password";
async function api<T = Record<string, unknown>>(method: string, endpoint: string, secret: string, body?: unknown, key: string = randomUUID(), generation?: number) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method, headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", "idempotency-key": key, ...(generation === undefined ? {} : { "dataset-generation": String(generation) }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, replayed: response.headers.get("idempotent-replayed"), body: await response.json() as { ok: boolean; data: T; error: { code: string; message: string } } };
}

describe("physical stock and reasoned corrections (#80)", () => {
  let admin: Browser; let operator: Browser;
  let adminSecret: string; let operatorSecret: string;
  let material: string; let location: string;
  const pairPath = () => `/admin/prod/stock?material=${material}&location=${location}`;
  const stock = () => api<StockView>("GET", `/api/tenants/prod/stock?material=${material}&location=${location}`, adminSecret);
  const correction = (quantity: string, extra = {}, secret = adminSecret, key?: string) => api<StockMovementView>("POST", "/api/tenants/prod/stock/corrections", secret, { material, location, quantity, unit: "each", reason: "Stock count", ...extra }, key);
  const ownAudit = async () => (await api<AuditPage>("GET", "/api/tenants/prod/audit?limit=100", adminSecret)).body.data.entries.filter((row) => row.action === "stock.movement.posted" && row.after?.material === material && row.after?.location === location);
  const patchMaster = async (resource: string, id: string, changes: object) => {
    const version = (await api<{ version: number }>("GET", `/api/tenants/prod/${resource}/${id}`, adminSecret)).body.data.version;
    return api("PATCH", `/api/tenants/prod/${resource}/${id}`, adminSecret, { version, ...changes });
  };
  async function createProdOnly(resource: "materials" | "locations", body: object) {
    const testIds = new Set((await api<{ id: string }[]>("GET", `/api/tenants/test/${resource}`, adminSecret)).body.data.map((row) => row.id));
    for (let i = 0; i <= testIds.size; i += 1) {
      const created = await api<{ id: string }>("POST", `/api/tenants/prod/${resource}`, adminSecret, body);
      expect(created.status).toBe(200);
      if (!testIds.has(created.body.data.id)) return created.body.data.id;
    }
    throw new Error("No Prod-only ID created");
  }
  async function openCorrection(browser: Browser) {
    await browser.open(`${baseUrl}${pairPath()}`);
    await browser.waitFor("[data-stock-balance]");
    await browser.waitUntil(hydrated(`document.querySelector("main button:not([type=submit])")`));
    await browser.clickRole("button", "Post correction");
    await browser.waitFor("[role=dialog]");
  }
  beforeAll(async () => {
    admin = openBrowser(); operator = openBrowser();
    await signInAsAdmin(admin, baseUrl, inject("adminPassword"));
    await openTokens(admin, baseUrl); adminSecret = await createToken(admin, "stock-admin-ops");
    material = await createProdOnly("materials", { type: "raw", description: "stock-api bolts", baseUnit: "each" });
    location = await createProdOnly("locations", { name: "stock-api warehouse" });
    expect((await api("POST", `/api/tenants/prod/materials/${material}/conversions`, adminSecret, { unit: "case", numerator: "12", denominator: "1" })).status).toBe(200);
    expect((await api("POST", "/api/users", adminSecret, { username: "stock-operator", password: PASSWORD })).status).toBe(200);
    await signInAs(operator, baseUrl, "stock-operator", PASSWORD);
    await openTokens(operator, baseUrl); operatorSecret = await createToken(operator, "stock-user-ops");
  });
  afterAll(async () => {
    if (adminSecret) {
      await api("PATCH", "/api/tenants/prod", adminSecret, { readOnly: false });
      for (const secret of [adminSecret, operatorSecret].filter(Boolean)) {
        const tokens = (await api<{ id: string; name: string }[]>("GET", "/api/tokens", secret)).body.data;
        for (const token of tokens.filter((row) => row.name.startsWith("stock-"))) await api("DELETE", `/api/tokens/${token.id}`, secret);
      }
    }
    await Promise.all([admin?.close(), operator?.close()]);
  });

  it("reads zero, posts converted opening stock once per key with source/date/actor and separate audit (INV-001/013/015/016/023)", async () => {
    expect((await stock()).body.data).toMatchObject({ quantity: "0.000000", movements: [], baseUnit: "each" });
    const key = randomUUID();
    const first = await correction("2", { unit: "case", reason: "Opening balance", date: "1900-01-01" }, adminSecret, key);
    const replay = await correction("2", { unit: "case", reason: "Opening balance", date: "1900-01-01" }, adminSecret, key);
    expect(first.status).toBe(200); expect(replay.replayed).toBe("true"); expect(replay.body.data.id).toBe(first.body.data.id);
    expect(first.body.data).toMatchObject({ quantity: "24.000000", enteredQuantity: "2.000000", enteredUnit: "case", numerator: "12", denominator: "1", type: "correction", actorUsername: "admin", balanceAfter: "24.000000", businessDate: new Date().toISOString().slice(0, 10) });
    expect(first.body.data.postingId).toMatch(/^[a-f0-9-]{36}$/);
    const returned = await correction("0.5", { reason: "Physical customer return", date: "2099-01-01" }, operatorSecret);
    expect(returned.status).toBe(200); expect(returned.body.data).toMatchObject({ quantity: "0.500000", balanceAfter: "24.500000", actorUsername: "stock-operator", businessDate: new Date().toISOString().slice(0, 10) });
    const audit = await ownAudit();
    expect(audit).toHaveLength(2);
    expect(audit).toEqual(expect.arrayContaining([expect.objectContaining({ before: { quantity: "0.000000" }, after: expect.objectContaining({ movement: "24.000000", quantity: "24.000000", reason: "Opening balance" }), channel: "api", sessionId: null, token: expect.objectContaining({ name: "stock-admin-ops" }) })]));
    expect((await stock()).body.data.movements).toHaveLength(2);
  });

  it("rejects negative stock and a missing reason atomically, with no cross-tenant access (INV-006/014/019)", async () => {
    const before = (await stock()).body.data; const audit = await ownAudit();
    const negative = await correction("-25");
    expect(negative.status).toBe(409); expect(negative.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(negative.body.error.message).toContain("available 24.500000 each");
    expect((await correction("1", { reason: " " })).body.error.code).toBe("VALIDATION_FAILED");
    expect((await api("POST", "/api/tenants/test/stock/corrections", operatorSecret, { material, location, quantity: "1", unit: "each", reason: "Wrong scope" }, randomUUID(), 1)).body.error.code).toBe("MATERIAL_NOT_FOUND");
    expect((await api("GET", `/api/tenants/test/stock?material=${material}&location=${location}`, operatorSecret)).status).toBe(404);
    expect((await stock()).body.data).toEqual(before); expect(await ownAudit()).toEqual(audit);
  });

  it("posts through the normal user's UI, retains errors and fits a narrow viewport", async () => {
    await openCorrection(operator);
    await operator.fillLabel("Signed quantity", "-0.5"); await operator.fillLabel("Reason", "UI physical count");
    await operator.click("[role=dialog] button[type=submit]"); await operator.waitUntil(`!document.querySelector("[role=dialog]")`);
    await operator.waitUntil(`document.querySelector("[data-stock-balance]")?.textContent === "24 each"`);
    expect((await stock()).body.data.quantity).toBe("24.000000");
    expect(await ownAudit()).toEqual(expect.arrayContaining([expect.objectContaining({ actor: expect.objectContaining({ username: "stock-operator" }), channel: "ui", sessionId: expect.any(String), after: expect.objectContaining({ movement: "-0.500000" }) })]));
    await openCorrection(operator); await operator.fillLabel("Signed quantity", "-25"); await operator.fillLabel("Reason", "Too many");
    await operator.click("[role=dialog] button[type=submit]"); await operator.waitFor("[role=dialog] [role=alert]");
    expect(await operator.text("[role=alert]")).toContain("available 24.000000 each");
    await operator.clickRole("button", "Cancel"); await operator.waitUntil(`!document.querySelector("[role=dialog]")`);
    await operator.setViewport(390, 844);
    await operator.open(`${baseUrl}${pairPath()}`); await operator.waitFor("[data-stock-balance]");
    expect(await operator.evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth`)).toBe(true);
    expect(await operator.text("main")).toContain("UI physical count");
    await operator.setViewport(1280, 900);
  });

  it("shows demo openings and Polish help, and blocks both roles when read-only (INV-022, D06)", async () => {
    await admin.open(`${baseUrl}/admin/test/stock`); await admin.waitFor("[data-stock-balance]");
    expect(await admin.text("main")).toContain("Demonstration opening balance");
    expect(await admin.text("[data-stock-balance]")).toBe("500 kg");
    try {
      await choosePreference(admin, "pl");
      await admin.open(`${baseUrl}/admin/prod/stock?material=${material}&location=${location}`); await admin.waitForText("Zapas — Prod");
      expect(await admin.text("main")).toContain("Zaksięguj korektę");
      await admin.open(`${baseUrl}/help?q=korekty`); await admin.waitForText("Zapas fizyczny i korekty");
    } finally { await restoreDefaultPreferences(admin, baseUrl, inject("adminPassword")); }
    const before = (await stock()).body.data;
    await api("PATCH", "/api/tenants/prod", adminSecret, { readOnly: true });
    try {
      for (const secret of [adminSecret, operatorSecret]) expect((await correction("1", {}, secret)).body.error.code).toBe("TENANT_READ_ONLY");
      await operator.open(`${baseUrl}${pairPath()}`); await operator.waitFor("[data-stock-balance]");
      expect(await operator.evaluate<boolean>(`[...document.querySelectorAll("main button")].some((b) => b.textContent === "Post correction")`)).toBe(false);
      expect((await stock()).body.data).toEqual(before);
    } finally { await api("PATCH", "/api/tenants/prod", adminSecret, { readOnly: false }); }
  });

  it("locks material type/unit after history and prevents nonzero deactivation until stock is zero (MAT-010/012, LFC-012/016)", async () => {
    expect((await patchMaster("materials", material, { type: "finished" })).body.error.code).toBe("MATERIAL_HAS_MOVEMENTS");
    expect((await patchMaster("materials", material, { baseUnit: "kg" })).body.error.code).toBe("MATERIAL_HAS_MOVEMENTS");
    expect((await patchMaster("materials", material, { active: false })).body.error.code).toBe("STOCK_NOT_EMPTY");
    expect((await patchMaster("locations", location, { active: false })).body.error.code).toBe("STOCK_NOT_EMPTY");
    expect((await correction("-24")).status).toBe(200);
    expect((await patchMaster("materials", material, { baseUnit: "kg" })).body.error.code).toBe("MATERIAL_HAS_MOVEMENTS");
    expect((await patchMaster("locations", location, { active: false })).status).toBe(200);
    expect((await correction("1")).body.error.code).toBe("LOCATION_INACTIVE");
    expect((await patchMaster("materials", material, { active: false })).status).toBe(200);
    expect((await correction("1")).body.error.code).toBe("MATERIAL_INACTIVE");
    expect((await stock()).body.data.quantity).toBe("0.000000");
  });
});
