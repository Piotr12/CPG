import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { StockReportView, StockView, TransferView } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account and records: users are never deleted, and other files share the app.
const USERNAME = "srapi-una";
const PASSWORD = "srapi una's first password";
const ADMIN_TOKEN = "srapi-ops";

// The current stock report through the API (R07, E13-S01): UX-017, INV-009, INV-012, API-014, UX-021, TEN-018, R05.
describe("the stock report through the API", () => {
  let admin: Browser;
  let una: Browser;
  let adminSecret: string;
  /** A normal user's token: both roles read the report. */
  let unaSecret: string;
  let transfer: string;
  const ids: Record<"steel" | "bolt" | "plant" | "depot", string> = {} as never;

  const api = (method: string, path: string, secret = adminSecret, options: Parameters<typeof callApi>[4] = {}) => callApi(baseUrl, method, path, secret, options);
  const write = (method: string, path: string, body: unknown) => api(method, path, adminSecret, { key: randomUUID(), body });
  const create = async (path: string, body: unknown) => json(await write("POST", path, body)).data.id as string;
  const correct = (material: string, location: string, quantity: string, unit = "kg") =>
    write("POST", "/api/tenants/prod/stock/corrections", { material, location, quantity, unit, reason: "srapi count" });
  const report = async (query: string, secret = adminSecret, tenant = "prod") => {
    const response = await api("GET", `/api/tenants/${tenant}/reports/stock${query}`, secret);
    expect(response.status).toBe(200);
    return json(response).data as StockReportView;
  };
  /** Each row as material/location and its three figures. */
  const figures = (view: StockReportView) => view.rows.map((row) => [`${row.material}/${row.location}`, row.quantity, row.inTransitFrom, row.inTransitTo]);

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, ADMIN_TOKEN);
    expect((await write("POST", "/api/users", { username: USERNAME, password: PASSWORD })).status).toBe(200);
    await signIn(una, baseUrl, PASSWORD, USERNAME);
    await openTokens(una, baseUrl);
    unaSecret = await createToken(una, "srapi-una-cli");

    ids.steel = await create("/api/tenants/prod/materials", { type: "raw", description: "srapi steel", baseUnit: "kg" });
    ids.bolt = await create("/api/tenants/prod/materials", { type: "raw", description: "srapi bolt", baseUnit: "each" });
    ids.plant = await create("/api/tenants/prod/locations", { name: "srapi plant" });
    ids.depot = await create("/api/tenants/prod/locations", { name: "srapi depot" });
    await correct(ids.steel, ids.plant, "100");
    const planned = await write("POST", "/api/tenants/prod/transfers", {
      material: ids.steel, source: ids.plant, destination: ids.depot, quantity: "50", unit: "kg", plannedDispatch: "2026-10-19", plannedArrival: "2026-10-22",
    });
    transfer = (json(planned).data as TransferView).id;
    expect((await write("POST", `/api/tenants/prod/transfers/${transfer}/dispatches`, { quantity: "30", unit: "kg" })).status).toBe(200);
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find(({ name }) => name === ADMIN_TOKEN)!;
    await api("DELETE", `/api/tokens/${own.id}`, adminSecret, { key: randomUUID() });
    await Promise.all([admin.close(), una.close()]);
  });

  it("shows on-hand and in transit apart: the source lower with transit out, the destination unchanged with transit in (UX-017, INV-009)", async () => {
    const view = await report(`?material=${ids.steel}`);

    expect(view).toMatchObject({ asOf: new Date().toISOString().slice(0, 10), page: 1, pageSize: 100, total: 2 });
    expect(view.rows).toEqual([
      {
        material: ids.steel, materialDescription: "srapi steel", materialActive: true, baseUnit: "kg",
        location: ids.plant, locationName: "srapi plant", locationActive: true, quantity: "70.000000", inTransitFrom: "30.000000", inTransitTo: "0.000000",
      },
      {
        material: ids.steel, materialDescription: "srapi steel", materialActive: true, baseUnit: "kg",
        location: ids.depot, locationName: "srapi depot", locationActive: true, quantity: "0.000000", inTransitFrom: "0.000000", inTransitTo: "30.000000",
      },
    ]);
  });

  it("returns the same report to a normal user and to the admin (API-014, UX-021)", async () => {
    const query = `?material=${ids.steel}`;
    expect(await report(query, unaSecret)).toEqual(await report(query));
  });

  it("narrows by location and by material, and shows all-zero rows only when asked", async () => {
    expect(figures(await report(`?location=${ids.depot}`))).toEqual([[`${ids.steel}/${ids.depot}`, "0.000000", "0.000000", "30.000000"]]);
    await correct(ids.bolt, ids.plant, "4", "each");
    await correct(ids.bolt, ids.plant, "-4", "each");

    expect((await report(`?material=${ids.bolt}`)).rows).toEqual([]);
    expect(figures(await report(`?material=${ids.bolt}&includeZero=true`))).toEqual([[`${ids.bolt}/${ids.plant}`, "0.000000", "0.000000", "0.000000"]]);
  });

  it("drills into the pair's signed ledger, each movement with its source document (INV-012)", async () => {
    const ledger = json(await api("GET", `/api/tenants/prod/stock?material=${ids.steel}&location=${ids.plant}`, unaSecret)).data as StockView;

    expect(ledger).toMatchObject({ page: 1, movementCount: 2, quantity: "70.000000", inTransitFrom: "30.000000" });
    expect(ledger.movements.map(({ type, quantity, reason, source }) => ({ type, quantity, reason, source }))).toEqual([
      { type: "transfer-dispatch", quantity: "-30.000000", reason: expect.stringContaining(transfer), source: { id: transfer, document: { type: "transfer", id: transfer } } },
      { type: "correction", quantity: "100.000000", reason: "srapi count", source: { id: null, document: null } },
    ]);
  });

  it("never shows Prod rows in Test, and a filter the tenant doesn't have is not found (R05)", async () => {
    const descriptions: string[] = [];
    for (let page = 1, pages = 1; page <= pages; page++) {
      const view = await report(`?includeZero=true&page=${page}`, adminSecret, "test");
      descriptions.push(...view.rows.map((row) => row.materialDescription));
      pages = Math.ceil(view.total / view.pageSize);
    }
    expect(descriptions.filter((description) => description.startsWith("srapi"))).toEqual([]);

    const missing = await api("GET", "/api/tenants/prod/reports/stock?material=99999999");
    expect([missing.status, json(missing).error.code]).toEqual([404, "MATERIAL_NOT_FOUND"]);
  });

  it("refuses a malformed query and an unsigned caller", async () => {
    const malformed = await api("GET", "/api/tenants/prod/reports/stock?page=0");
    expect([malformed.status, json(malformed).error.code]).toEqual([400, "VALIDATION_FAILED"]);
    expect((await api("GET", "/api/tenants/prod/reports/stock?materials=1")).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/tenants/prod/reports/stock`)).status).toBe(401);
  });

  it("still answers while the tenant is read-only (TEN-018)", async () => {
    expect((await write("PATCH", "/api/tenants/prod", { readOnly: true })).status).toBe(200);
    try {
      expect(figures(await report(`?material=${ids.steel}&location=${ids.plant}`, unaSecret))).toEqual([[`${ids.steel}/${ids.plant}`, "70.000000", "30.000000", "0.000000"]]);
    } finally {
      expect((await write("PATCH", "/api/tenants/prod", { readOnly: false })).status).toBe(200);
    }
  });
});
