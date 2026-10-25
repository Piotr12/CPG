import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { ProductionOrderDetail, VarianceReportView } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account and records: users are never deleted, and other files share the app.
const USERNAME = "vrapi-una";
const PASSWORD = "vrapi una's first password";
const ADMIN_TOKEN = "vrapi-ops";
const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

// The production variance report through the API (R07, E13-S02): PRD-013/014/015/018, API-014, UX-021, TEN-018, R05, N01, N04.
describe("the production variance report through the API", () => {
  let admin: Browser;
  let una: Browser;
  let adminSecret: string;
  /** A normal user's token: both roles read the report. */
  let unaSecret: string;
  const ids: Record<"bar" | "cocoa" | "wrapper" | "milk" | "plant" | "depot" | "done" | "running", string> = {} as never;

  const api = (method: string, path: string, secret = adminSecret, options: Parameters<typeof callApi>[4] = {}) => callApi(baseUrl, method, path, secret, options);
  const write = async (method: string, path: string, body: unknown) => {
    const response = await api(method, path, adminSecret, { key: randomUUID(), body });
    expect(response.status, `${method} ${path}`).toBe(200);
    return json(response).data;
  };
  const create = async (path: string, body: unknown) => (await write("POST", path, body)).id as string;
  const order = async (location: string, target: string) =>
    ((await write("POST", "/api/tenants/prod/production-orders", { output: ids.bar, location, quantity: target, unit: "each", plannedFinish: "2026-11-02" })) as ProductionOrderDetail).id;
  const complete = (orderId: string, output: string, cocoa: string, wrappers: string, extras: { material: string; quantity: string; unit: string }[] = []) =>
    write("POST", `/api/tenants/prod/production-orders/${orderId}/completions`, {
      quantity: output, unit: "each", components: [{ material: ids.cocoa, quantity: cocoa, unit: "kg" }, { material: ids.wrapper, quantity: wrappers, unit: "each" }, ...extras],
    });
  const report = async (query: string, secret = adminSecret, tenant = "prod") => {
    const response = await api("GET", `/api/tenants/${tenant}/reports/variance${query}`, secret);
    expect(response.status).toBe(200);
    return json(response).data as VarianceReportView;
  };
  /** This file's orders only: other files' orders share the tenant. */
  const own = (query = "") => report(`?material=${ids.bar}${query}`);

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, ADMIN_TOKEN);
    await write("POST", "/api/users", { username: USERNAME, password: PASSWORD });
    await signIn(una, baseUrl, PASSWORD, USERNAME);
    await openTokens(una, baseUrl);
    unaSecret = await createToken(una, "vrapi-una-cli");

    ids.bar = await create("/api/tenants/prod/materials", { type: "finished", description: "vrapi bar", baseUnit: "each" });
    ids.cocoa = await create("/api/tenants/prod/materials", { type: "raw", description: "vrapi cocoa", baseUnit: "kg" });
    ids.wrapper = await create("/api/tenants/prod/materials", { type: "raw", description: "vrapi wrapper", baseUnit: "each" });
    ids.milk = await create("/api/tenants/prod/materials", { type: "raw", description: "vrapi milk", baseUnit: "kg" });
    ids.plant = await create("/api/tenants/prod/locations", { name: "vrapi plant" });
    ids.depot = await create("/api/tenants/prod/locations", { name: "vrapi depot" });
    for (const location of [ids.plant, ids.depot]) {
      await write("POST", "/api/tenants/prod/planning-parameters", { material: ids.bar, location, procurement: "make", leadTimeDays: 3, minimumQuantity: "1", lotMultiple: "1" });
      for (const [material, quantity, unit] of [[ids.cocoa, "100", "kg"], [ids.wrapper, "500", "each"], [ids.milk, "10", "kg"]]) {
        await write("POST", "/api/tenants/prod/stock/corrections", { material, location, quantity, unit, reason: "vrapi opening" });
      }
    }
    await create("/api/tenants/prod/boms", {
      output: ids.bar, priority: 1, validFrom: "2026-01-01", validThrough: null,
      components: [{ material: ids.cocoa, quantity: "0.5", unit: "kg" }, { material: ids.wrapper, quantity: "2", unit: "each" }],
    });
    // The issue's example: 18 kg of cocoa against 20 kg expected, and 2 kg of milk the recipe doesn't hold.
    ids.done = await order(ids.plant, "40");
    await complete(ids.done, "40", "18", "80", [{ material: ids.milk, quantity: "2", unit: "kg" }]);
    // An Open order at the depot with a partial completion and a zero-output waste posting.
    ids.running = await order(ids.depot, "100");
    await complete(ids.running, "40", "20", "80");
    await complete(ids.running, "0", "3", "0");
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const token = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find(({ name }) => name === ADMIN_TOKEN)!;
    await api("DELETE", `/api/tokens/${token.id}`, adminSecret, { key: randomUUID() });
    await Promise.all([admin.close(), una.close()]);
  });

  it("compares target with produced and each component's expected with its actual, extra inputs and waste included", async () => {
    const view = await own();

    expect(view).toMatchObject({ asOf: today(), page: 1, pageSize: 50, total: 2 });
    expect(view.rows[0]).toEqual({
      id: ids.done, output: ids.bar, outputDescription: "vrapi bar", baseUnit: "each", location: ids.plant, locationName: "vrapi plant",
      status: "completed", bom: expect.stringMatching(/^\d{8}$/), revision: 1,
      target: "40.000000", produced: "40.000000", outputVariance: "0.000000", completions: 1, wasteCompletions: 0, reversed: [],
      components: [
        { material: ids.cocoa, description: "vrapi cocoa", baseUnit: "kg", extra: false, expected: "20.000000", actual: "18.000000", variance: "-2.000000", waste: "0.000000" },
        { material: ids.wrapper, description: "vrapi wrapper", baseUnit: "each", extra: false, expected: "80.000000", actual: "80.000000", variance: "0.000000", waste: "0.000000" },
        { material: ids.milk, description: "vrapi milk", baseUnit: "kg", extra: true, expected: "0.000000", actual: "2.000000", variance: "2.000000", waste: "0.000000" },
      ],
    });
    expect(view.rows[1]).toMatchObject({ id: ids.running, status: "open", target: "100.000000", produced: "40.000000", outputVariance: "-60.000000", completions: 2, wasteCompletions: 1 });
    expect(view.rows[1].components.map(({ material, expected, actual, variance, waste }) => [material, expected, actual, variance, waste])).toEqual([
      [ids.cocoa, "20.000000", "23.000000", "3.000000", "3.000000"],
      [ids.wrapper, "80.000000", "80.000000", "0.000000", "0.000000"],
    ]);
  });

  it("returns the same report to a normal user and to the admin (API-014, UX-021)", async () => {
    const query = `?material=${ids.bar}`;
    expect(await report(query, unaSecret)).toEqual(await report(query));
  });

  it("narrows by material, location, state and posting date, with no output variance under a range", async () => {
    const rowIds = (view: VarianceReportView) => view.rows.map(({ id }) => id);
    expect(rowIds(await report(`?material=${ids.milk}`))).toEqual([ids.done]);
    expect(rowIds(await own(`&location=${ids.depot}`))).toEqual([ids.running]);
    expect(rowIds(await own("&status=completed"))).toEqual([ids.done]);
    expect(rowIds(await own("&status=cancelled"))).toEqual([]);
    const ranged = await own(`&from=${today()}&to=${today()}`);
    expect(ranged.rows.map(({ outputVariance }) => outputVariance)).toEqual([null, null]);
    expect((await own(`&to=${yesterday()}`)).total).toBe(0);
  });

  it("holds no cost, value or capacity figure (N01, N04)", async () => {
    const [row] = (await own()).rows;
    expect(Object.keys(row).sort()).toEqual(
      ["baseUnit", "bom", "completions", "components", "id", "location", "locationName", "output", "outputDescription", "outputVariance", "produced", "reversed", "revision", "status", "target", "wasteCompletions"],
    );
    expect(Object.keys(row.components[0]).sort()).toEqual(["actual", "baseUnit", "description", "expected", "extra", "material", "variance", "waste"]);
  });

  it("never shows Prod orders in Test, and a filter the tenant doesn't have is not found (R05)", async () => {
    const outputs: string[] = [];
    for (let page = 1, pages = 1; page <= pages; page++) {
      const view = await report(`?page=${page}`, adminSecret, "test");
      outputs.push(...view.rows.map((row) => row.outputDescription));
      pages = Math.ceil(view.total / view.pageSize);
    }
    expect(outputs.filter((description) => description.startsWith("vrapi"))).toEqual([]);

    const missing = await api("GET", "/api/tenants/prod/reports/variance?material=99999999");
    expect([missing.status, json(missing).error.code]).toEqual([404, "MATERIAL_NOT_FOUND"]);
    const location = await api("GET", "/api/tenants/prod/reports/variance?location=99999999");
    expect([location.status, json(location).error.code]).toEqual([404, "LOCATION_NOT_FOUND"]);
  });

  it("refuses a range that ends before it starts, a malformed query and an unsigned caller", async () => {
    const range = await api("GET", "/api/tenants/prod/reports/variance?from=2026-10-22&to=2026-10-21");
    expect([range.status, json(range).error.code, Object.keys(json(range).error.fieldErrors)]).toEqual([400, "VALIDATION_FAILED", ["to"]]);
    expect((await api("GET", "/api/tenants/prod/reports/variance?state=open")).status).toBe(400);
    expect((await api("GET", "/api/tenants/prod/reports/variance?from=2026-02-30")).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/tenants/prod/reports/variance`)).status).toBe(401);
  });

  it("still answers while the tenant is read-only (TEN-018)", async () => {
    await write("PATCH", "/api/tenants/prod", { readOnly: true });
    try {
      expect((await report(`?material=${ids.bar}`, unaSecret)).total).toBe(2);
    } finally {
      await write("PATCH", "/api/tenants/prod", { readOnly: false });
    }
  });

  it("searches and sorts the production orders on the server, and still refuses an unknown query key (#221)", async () => {
    const list = async (query: string) => {
      const response = await api("GET", `/api/tenants/prod/production-orders?${query}`);
      expect(response.status).toBe(200);
      return (json(response).data as { id: string }[]).map(({ id }) => id);
    };

    expect(await list("q=vrapi+bar")).toEqual([ids.done, ids.running]);
    expect(await list("q=VRAPI+bar&sort=location&dir=desc")).toEqual([ids.running, ids.done]);
    expect(await list("q=vrapi+bar&page=2")).toEqual([]);

    for (const [query, field] of [["sort=material", "sort"], ["dir=up", "dir"], ["q=a+b+c+d+e+f", "q"]]) {
      const refused = await api("GET", `/api/tenants/prod/production-orders?${query}`);
      expect(refused.status).toBe(400);
      expect(Object.keys(json(refused).error.fieldErrors)).toEqual([field]);
    }
    expect((await api("GET", "/api/tenants/prod/production-orders?q=vrapi&surprise=1")).status).toBe(400);
  });
});
