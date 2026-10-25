import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { CustomerOrderView, DemandReviewView, IssueView, ShipmentView } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own token and records: other files share the app.
const ADMIN_TOKEN = "drapi-ops";

const DAY_MS = 86_400_000;
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
const now = new Date();
/** The first of next month, and the 6th. */
const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
const nextMonthSixth = `${nextMonth.slice(0, 8)}06`;
/** Monthly buckets: the current month is bucket 9, the next one 10, and last month 8. */
const THIS_MONTH = 9;
const NEXT_MONTH = 10;
const sameMonth = yesterday.slice(0, 7) === today.slice(0, 7);

// The demand review through the API (#240): every figure from documents this file posts, D08 netting,
// a reversal, SU, refusals and a read-only tenant. Tenant isolation is proven in the service's tests.
describe("the demand review through the API", () => {
  let admin: Browser;
  let adminSecret: string;
  const ids: Record<"widget" | "steel" | "plant" | "retail", string> = {} as never;

  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}) => callApi(baseUrl, method, path, adminSecret, options);
  const write = async (method: string, path: string, body: unknown) => {
    const response = await api(method, path, { key: randomUUID(), body });
    expect(response.status, response.text).toBe(200);
    return json(response).data;
  };
  const create = async (path: string, body: unknown) => (await write("POST", path, body)).id as string;
  const order = (quantity: string, requiredDate: string) =>
    write("POST", "/api/tenants/prod/customer-orders", {
      customer: ids.retail, location: ids.plant, lines: [{ material: ids.widget, quantity, unit: "each", requiredDate }],
    }) as Promise<CustomerOrderView>;
  /** Ships `quantity` of the order's only line and issues it today. */
  const issue = async (placed: CustomerOrderView, quantity: string) => {
    const shipment = (await write("POST", "/api/tenants/prod/shipments", {
      customerOrder: placed.id, plannedDate: today, lines: [{ orderLine: placed.lines[0].id, quantity, unit: "each" }],
    })) as ShipmentView;
    return (await write("POST", "/api/tenants/prod/goods-issues", { shipment: shipment.id, lines: [{ line: 1, quantity, unit: "each" }] })) as IssueView;
  };
  const review = async (query: string, tenant = "prod") => {
    const response = await api("GET", `/api/tenants/${tenant}/reports/demand-review${query}`);
    expect(response.status, response.text).toBe(200);
    return json(response).data as DemandReviewView;
  };
  const figures = (view: DemandReviewView, key: string) => view.rows.find((row) => row.key === key)?.figures;

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, ADMIN_TOKEN);
    ids.widget = await create("/api/tenants/prod/materials", { type: "finished", description: "drapi widget", baseUnit: "each" });
    // 1 each = 2 SU, 1 pallet = 10 each.
    await write("POST", `/api/tenants/prod/materials/${ids.widget}/conversions`, { unit: "SU", numerator: "1", denominator: "2" });
    await write("POST", `/api/tenants/prod/materials/${ids.widget}/conversions`, { unit: "pallet", numerator: "10", denominator: "1" });
    ids.steel = await create("/api/tenants/prod/materials", { type: "raw", description: "drapi steel", baseUnit: "kg" });
    ids.plant = await create("/api/tenants/prod/locations", { name: "drapi plant" });
    ids.retail = await create("/api/tenants/prod/customers", { name: "drapi retail" });
    await write("POST", "/api/tenants/prod/stock/corrections", { material: ids.widget, location: ids.plant, quantity: "100", unit: "each", reason: "drapi count" });

    // Today: 30 ordered, 10 issued, 20 open. Another 8 issued and reversed, so open again.
    await issue(await order("30", today), "10");
    const reversed = await issue(await order("8", today), "8");
    await write("POST", `/api/tenants/prod/stock/movements/${reversed.lines[0].movementId}/reverse`, { reason: "drapi wrong shipment" });
    // Yesterday: 5 ordered, all overdue today.
    await order("5", yesterday);
    // Next month: 50 forecast on the 1st, 20 ordered on the 6th, so 30 not yet ordered (D08).
    await write("POST", "/api/tenants/prod/forecasts", { material: ids.widget, location: ids.plant, date: nextMonth, quantity: "50", unit: "each" });
    await order("20", nextMonthSixth);
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find(({ name }) => name === ADMIN_TOKEN)!;
    await api("DELETE", `/api/tokens/${own.id}`, { key: randomUUID() });
    await admin.close();
  });

  it("shows one product per location in its base unit: shipped, ordered, open, overdue today and forecast not yet ordered", async () => {
    const view = await review(`?bucket=month&material=${ids.widget}`);
    expect(view).toMatchObject({ today, bucket: "month", offset: 0, unit: "each", units: ["each", "pallet", "SU"], disabledUnits: [], excluded: [] });
    expect(view.buckets[THIS_MONTH]).toMatchObject({ current: true });
    const plant = figures(view, ids.plant)!;
    expect(plant[THIS_MONTH]).toEqual({
      shipped: "10.000000", ordered: sameMonth ? "43.000000" : "38.000000", open: "33.000000", overdue: "5.000000", forecast: "0.000000",
    });
    expect(plant[NEXT_MONTH]).toEqual({ shipped: "0.000000", ordered: "20.000000", open: "20.000000", overdue: "0.000000", forecast: "30.000000" });
    expect(view.total[NEXT_MONTH]).toEqual(plant[NEXT_MONTH]);
  });

  it("converts to the unit asked for, and shows every product together only in SU", async () => {
    const pallets = await review(`?bucket=month&material=${ids.widget}&unit=pallet`);
    expect(figures(pallets, ids.plant)![NEXT_MONTH]).toMatchObject({ open: "2.000000", forecast: "3.000000" });
    const all = await review(`?bucket=month&location=${ids.plant}&unit=pallet`);
    expect(all).toMatchObject({ unit: "SU", units: ["SU"], locations: [ids.plant] });
    expect(figures(all, ids.widget)![NEXT_MONTH]).toMatchObject({ ordered: "40.000000", open: "40.000000", forecast: "60.000000" });
  });

  it("counts by week and by day too, an overdue line today and a reversed issue as nothing shipped", async () => {
    for (const bucket of ["week", "day"]) {
      const view = await review(`?bucket=${bucket}&material=${ids.widget}`);
      const current = view.buckets.findIndex((candidate) => candidate.current);
      expect(figures(view, ids.plant)![current], bucket).toMatchObject({ shipped: "10.000000", open: "33.000000", overdue: "5.000000" });
    }
  });

  it("still answers on a read-only tenant: it writes nothing", async () => {
    await write("PATCH", "/api/tenants/prod", { readOnly: true });
    try {
      expect(figures(await review(`?bucket=month&material=${ids.widget}`), ids.plant)![NEXT_MONTH].forecast).toBe("30.000000");
    } finally {
      await write("PATCH", "/api/tenants/prod", { readOnly: false });
    }
  });

  it("refuses a product that isn't finished, an unknown parameter and an offset out of range", async () => {
    const raw = await api("GET", `/api/tenants/prod/reports/demand-review?material=${ids.steel}`);
    expect([raw.status, json(raw).error.code, json(raw).error.fieldErrors]).toEqual([400, "VALIDATION_FAILED", { material: ["Choose finished products only."] }]);
    expect((await api("GET", "/api/tenants/prod/reports/demand-review?materials=1")).status).toBe(400);
    expect((await api("GET", "/api/tenants/prod/reports/demand-review?offset=21")).status).toBe(400);
  });
});
