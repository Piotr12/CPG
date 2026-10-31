import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MrpLatestView, MrpPlanView, MrpRunView } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signInAs, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account, token and records: other files share the app, and users are never deleted.
const ULA = "mrpapi-ula";
const ULA_PASSWORD = "mrpapi ula's first password";
const ADMIN_TOKEN = "mrpapi-admin";

/** A day `days` after the server's UTC today, as the run plans from it. */
const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
/** The `date`th of next month (UTC): the 2nd and the 4th are always days 2–34 of the run, and in one calendar month. */
const nextMonth = (date: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, date)).toISOString().slice(0, 10);
};

// E14-S02 through the bearer API (R07): a keyed POST runs MRP for every location of a tenant, and a GET
// reads the latest run with its results. Read-only and stale generations refuse a run (RUN-021, TEN-019).
describe("MRP runs through the API", () => {
  let admin: Browser;
  let ula: Browser;
  let adminSecret: string;
  let ulaSecret: string;
  const pair = { material: "", location: "" };

  const api = (method: string, path: string, secret = adminSecret, options?: { key?: string; body?: unknown; generation?: number }) =>
    callApi(baseUrl, method, path, secret, options);
  const write = (path: string, body: unknown, secret = adminSecret, generation?: number) => api("POST", path, secret, { key: randomUUID(), body, generation });
  const created = async (path: string, body: unknown) => {
    const response = await write(path, body);
    expect(response.status, response.text).toBe(200);
    return json(response).data as { id: string };
  };
  const generation = async () => (json(await api("GET", "/api/tenants/test")).data as { generation: number }).generation;
  const runIn = (tenant: "test" | "prod", secret = adminSecret, key = randomUUID(), generationSent?: number) =>
    api("POST", `/api/tenants/${tenant}/mrp/runs`, secret, { key, body: {}, generation: generationSent });
  const latest = (tenant: "test" | "prod", query = "") => api("GET", `/api/tenants/${tenant}/mrp/runs/latest${query}`);
  const latestRun = async (tenant: "test" | "prod") => (json(await latest(tenant)).data as MrpLatestView).run;
  const setReadOnly = (readOnly: boolean) => api("PATCH", "/api/tenants/prod", adminSecret, { key: randomUUID(), body: { readOnly } });
  /** One of this file's pairs in the latest Prod run, paging with the run's ID so every page is of that run. */
  async function ourPlan(run: MrpRunView, target = pair): Promise<MrpPlanView | undefined> {
    for (let page = 1; ; page += 1) {
      const response = await latest("prod", `?page=${page}&run=${run.id}`);
      expect(response.status, response.text).toBe(200);
      const { plans } = json(response).data as MrpLatestView;
      const found = plans.find(({ material, location }) => material === target.material && location === target.location);
      if (found || plans.length === 0) return found;
    }
  }

  beforeAll(async () => {
    [admin, ula] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, ADMIN_TOKEN);
    expect((await write("/api/users", { username: ULA, password: ULA_PASSWORD })).status).toBe(200);
    await signInAs(ula, baseUrl, ULA, ULA_PASSWORD);
    await openTokens(ula, baseUrl);
    ulaSecret = await createToken(ula, "mrpapi-ula-cli");
    // Physical 5 and an Open line of 20 three days from now (INV-008, MRP-008).
    pair.material = (await created("/api/tenants/prod/materials", { type: "finished", description: "mrpapi cabinet", baseUnit: "each" })).id;
    pair.location = (await created("/api/tenants/prod/locations", { name: "mrpapi plant" })).id;
    const customer = (await created("/api/tenants/prod/customers", { name: "mrpapi retail" })).id;
    await created("/api/tenants/prod/stock/corrections", { material: pair.material, location: pair.location, quantity: "5", unit: "each", reason: "mrpapi count" });
    await created("/api/tenants/prod/customer-orders", {
      customer,
      location: pair.location,
      lines: [{ material: pair.material, quantity: "20", unit: "each", requiredDate: day(3) }],
    });
  });
  afterAll(async () => {
    try {
      if (adminSecret) {
        // Later files write to Prod, and expect the admin to hold no tokens.
        expect((await setReadOnly(false)).status).toBe(200);
        const own = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find(({ name }) => name === ADMIN_TOKEN)!;
        expect((await api("DELETE", `/api/tokens/${own.id}`, adminSecret, { key: randomUUID() })).status).toBe(200);
      }
    } finally {
      await Promise.all([admin, ula].map((browser) => browser.close()));
    }
  });

  it("runs MRP with a normal user's token and stores a negative projection while stock stays at 5 (INV-008, MRP-008, RUN-002)", async () => {
    const response = await runIn("prod", ulaSecret);
    expect(response.status, response.text).toBe(200);
    const run = json(response).data as MrpRunView;

    expect(run).toMatchObject({ account: ULA, channel: "api", mode: "manual", startDate: day(0), endDate: day(89), horizonDays: 90 });
    expect(await latestRun("prod")).toEqual(run);
    const plan = await ourPlan(run);
    expect(plan?.buckets).toHaveLength(90);
    expect(plan?.buckets[0]).toMatchObject({ date: day(0), projectedBefore: "5.000000", shortage: "0.000000" });
    expect(plan?.buckets[3]).toMatchObject({ date: day(3), firmDemand: "20.000000", projectedBefore: "-15.000000", shortage: "15.000000" });
    const stock = json(await api("GET", `/api/tenants/prod/reports/stock?material=${pair.material}&location=${pair.location}`)).data as { rows: { quantity: string }[] };
    expect(stock.rows.map(({ quantity }) => quantity)).toEqual(["5.000000"]);
  });

  it("plans the forecast left after its month's orders and every day's safety target, as stored by the run (#275, DEM-002, D08)", async () => {
    const material = (await created("/api/tenants/prod/materials", { type: "finished", description: "mrpapi shelf", baseUnit: "each" })).id;
    const location = (await created("/api/tenants/prod/locations", { name: "mrpapi depot" })).id;
    const customer = (await created("/api/tenants/prod/customers", { name: "mrpapi wholesale" })).id;
    await created("/api/tenants/prod/safety-stock-targets", { material, location, effectiveFrom: day(0), quantity: "30" });
    await created("/api/tenants/prod/forecasts", { material, location, date: nextMonth(2), quantity: "100", unit: "each" });
    await created("/api/tenants/prod/customer-orders", { customer, location, lines: [{ material, quantity: "60", unit: "each", requiredDate: nextMonth(4) }] });

    const response = await runIn("prod", ulaSecret);
    expect(response.status, response.text).toBe(200);

    const plan = await ourPlan(json(response).data as MrpRunView, { material, location });
    const on = (date: string) => plan?.buckets.find((bucket) => bucket.date === date);
    expect(on(nextMonth(2))).toMatchObject({ firmDemand: "0.000000", forecastDemand: "40.000000", projectedBefore: "-40.000000", shortage: "40.000000" });
    expect(on(nextMonth(4))).toMatchObject({ firmDemand: "60.000000", forecastDemand: "0.000000", projectedBefore: "-100.000000" });
    expect(plan?.buckets.map(({ safetyTarget }) => safetyTarget)).toEqual(Array(90).fill("30.000000"));
  });

  it("projects open purchasing supply once: 60 ordered and 40 still requisitioned, an overdue 50 today, nothing cancelled (MRP-012, MRP-013, MRP-015's stored figure)", async () => {
    // A second material at the same plant, so the first pair's figures stay put.
    const supplied = { material: (await created("/api/tenants/prod/materials", { type: "raw", description: "mrpapi steel", baseUnit: "each" })).id, location: pair.location };
    const supplier = (await created("/api/tenants/prod/suppliers", { name: "mrpapi mill" })).id;
    const requisition = (body: { quantity: string; requiredDate: string }) =>
      created("/api/tenants/prod/purchase-requisitions", { material: supplied.material, location: supplied.location, unit: "each", ...body });
    const converting = await requisition({ quantity: "100", requiredDate: day(10) });
    await created("/api/tenants/prod/purchase-orders", {
      supplier,
      location: supplied.location,
      lines: [
        { material: supplied.material, quantity: "60", unit: "each", plannedDate: day(5), requisition: converting.id },
        { material: supplied.material, quantity: "50", unit: "each", plannedDate: day(-1) },
      ],
    });
    const cancelled = (await requisition({ quantity: "100", requiredDate: day(20) })) as { id: string; version: number };
    const cancel = await write(`/api/tenants/prod/purchase-requisitions/${cancelled.id}/cancel`, { version: cancelled.version });
    expect(cancel.status, cancel.text).toBe(200);

    const response = await runIn("prod");
    expect(response.status, response.text).toBe(200);
    const plan = await ourPlan(json(response).data as MrpRunView, supplied);

    // The overdue line counts today, the converted 60 on its planned day, and only the requisition's unconverted 40 on its own.
    expect(plan?.buckets[0]).toMatchObject({ date: day(0), dependableSupply: "50.000000", tentativeSupply: "0.000000", projectedBefore: "50.000000" });
    expect(plan?.buckets[5]).toMatchObject({ date: day(5), dependableSupply: "60.000000", tentativeSupply: "0.000000", projectedBefore: "110.000000" });
    expect(plan?.buckets[10]).toMatchObject({ date: day(10), dependableSupply: "0.000000", tentativeSupply: "40.000000", projectedBefore: "150.000000" });
    expect(plan?.buckets[20]).toMatchObject({ date: day(20), tentativeSupply: "0.000000", projectedBefore: "150.000000" });
    const others = plan!.buckets.filter((_, index) => ![0, 5, 10].includes(index));
    expect(others.every(({ tentativeSupply, dependableSupply }) => tentativeSupply === "0.000000" && dependableSupply === "0.000000")).toBe(true);
  });

  it("needs an Idempotency-Key, and replays a repeated key without a second run (R07)", async () => {
    const unkeyed = await api("POST", "/api/tenants/prod/mrp/runs", adminSecret, { body: {} });
    expect(unkeyed.status).toBe(400);
    expect(json(unkeyed).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");

    const key = randomUUID();
    const first = await runIn("prod", adminSecret, key);
    const repeat = await runIn("prod", adminSecret, key);

    expect(first.status).toBe(200);
    expect(repeat.status).toBe(200);
    expect(repeat.replayed).toBe("true");
    expect(json(repeat).data).toEqual(json(first).data);
    expect((await latestRun("prod")).id).toBe((json(first).data as MrpRunView).id);
  });

  it("refuses a Test run without the current generation, and stores nothing (R07)", async () => {
    const before = await latest("test");

    const missing = await runIn("test");
    const stale = await runIn("test", adminSecret, randomUUID(), (await generation()) + 1);

    expect([missing.status, json(missing).error.code]).toEqual([428, "GENERATION_REQUIRED"]);
    expect([stale.status, json(stale).error.code]).toEqual([409, "GENERATION_STALE"]);
    expect((await latest("test")).text).toBe(before.text);
  });

  it("refuses every token's run in a read-only tenant, the admin's included, and keeps the earlier run readable (RUN-021, TEN-019)", async () => {
    const earlier = await latestRun("prod");
    expect((await setReadOnly(true)).status).toBe(200);
    try {
      for (const secret of [ulaSecret, adminSecret]) {
        const refused = await runIn("prod", secret);
        expect([refused.status, json(refused).error.code]).toEqual([409, "TENANT_READ_ONLY"]);
      }
      expect(await latestRun("prod")).toEqual(earlier);
      expect((await ourPlan(earlier))?.buckets).toHaveLength(90);
    } finally {
      expect((await setReadOnly(false)).status).toBe(200);
    }
  });

  it("refuses a page of a run a newer one has replaced, so pages never mix two runs", async () => {
    const older = await latestRun("prod");
    expect((await runIn("prod")).status).toBe(200);

    const superseded = await latest("prod", `?run=${older.id}`);

    expect([superseded.status, json(superseded).error]).toEqual([409, expect.objectContaining({ code: "MRP_RUN_SUPERSEDED", params: { run: older.id } })]);
    expect((await latest("prod", "?page=0")).status).toBe(400);
  });

  it("keeps Test's and Prod's runs apart, and a Test reset clears Test's runs only, restarting their IDs (MRP-002, R05, D06)", async () => {
    const test = json(await runIn("test", adminSecret, randomUUID(), await generation())).data as MrpRunView;
    expect((await runIn("test", adminSecret, randomUUID(), await generation())).status).toBe(200);
    const testLatest = json(await latest("test")).data as MrpLatestView;
    const prod = json(await runIn("prod")).data as MrpRunView;
    // A Prod run leaves Test's latest run and its results as they were.
    expect(json(await latest("test")).data).toEqual(testLatest);
    expect(testLatest.run.id).toBe(String(Number(test.id) + 1).padStart(8, "0"));
    expect(testLatest.plans.length).toBeGreaterThan(0);
    expect(testLatest.plans.every(({ buckets }) => buckets.length === 90)).toBe(true);
    expect(testLatest.run.createdAt <= prod.createdAt).toBe(true);

    const reset = await api("POST", "/api/tenants/test/reset", adminSecret, { key: randomUUID(), body: {}, generation: await generation() });
    expect(reset.status, reset.text).toBe(200);

    const none = await latest("test");
    expect([none.status, json(none).error.code]).toEqual([404, "MRP_RUN_NOT_FOUND"]);
    const restarted = json(await runIn("test", adminSecret, randomUUID(), await generation())).data as MrpRunView;
    expect(restarted.id).toBe("00000001");
    // A client still paging the old generation's run 00000001 is told it was replaced, not handed the new one's rows.
    const old = await latest("test", `?page=2&run=00000001&generation=${test.generation}`);
    expect([old.status, json(old).error.code]).toEqual([409, "MRP_RUN_SUPERSEDED"]);
    expect((await latest("test", `?run=00000001&generation=${restarted.generation}`)).status).toBe(200);
    expect(await latestRun("prod")).toEqual(prod);
  });
});
