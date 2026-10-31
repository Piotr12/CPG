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
const RHEA = "mrprapi-rhea";
const RHEA_PASSWORD = "mrprapi rhea's first password";
const ADMIN_TOKEN = "mrprapi-admin";

/** A day `days` after the server's UTC today, as the run plans from it. */
const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

// E18-S01 through the bearer API (R07): GET …/mrp/runs/latest is the last MRP report, filtered by material
// and location, with the same figures for a normal user and the admin (API-014, UX-021), tenant-scoped
// (R05), and readable while the tenant is read-only (TEN-018).
describe("the MRP report through the API", () => {
  let admin: Browser;
  let rhea: Browser;
  let adminSecret: string;
  let rheaSecret: string;
  let run: MrpRunView;
  const pair = { material: "", location: "" };

  const api = (method: string, path: string, secret = adminSecret, options?: { key?: string; body?: unknown; generation?: number }) =>
    callApi(baseUrl, method, path, secret, options);
  const created = async (path: string, body: unknown) => {
    const response = await api("POST", path, adminSecret, { key: randomUUID(), body });
    expect(response.status, response.text).toBe(200);
    return json(response).data as { id: string };
  };
  const report = async (tenant: "test" | "prod", query: string, secret = adminSecret) => {
    const response = await api("GET", `/api/tenants/${tenant}/mrp/runs/latest${query}`, secret);
    expect(response.status, response.text).toBe(200);
    return json(response).data as MrpLatestView;
  };
  const ourQuery = () => `?material=${pair.material}&location=${pair.location}`;
  const setReadOnly = (readOnly: boolean) => api("PATCH", "/api/tenants/prod", adminSecret, { key: randomUUID(), body: { readOnly } });
  /** Every plan of the latest run of `tenant`, page by page, each page pinned to the first page's run. */
  async function everyPlan(tenant: "test" | "prod"): Promise<{ first: MrpLatestView; plans: MrpPlanView[] }> {
    const first = await report(tenant, "");
    const plans = [...first.plans];
    for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page += 1) {
      plans.push(...(await report(tenant, `?page=${page}&run=${first.run.id}&generation=${first.run.generation}`)).plans);
    }
    return { first, plans };
  }

  beforeAll(async () => {
    [admin, rhea] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, ADMIN_TOKEN);
    expect((await api("POST", "/api/users", adminSecret, { key: randomUUID(), body: { username: RHEA, password: RHEA_PASSWORD } })).status).toBe(200);
    await signInAs(rhea, baseUrl, RHEA, RHEA_PASSWORD);
    await openTokens(rhea, baseUrl);
    rheaSecret = await createToken(rhea, "mrprapi-rhea-cli");
    // MRP-005: physical 50 and Open lines of 10 and 15, two days apart.
    pair.material = (await created("/api/tenants/prod/materials", { type: "raw", description: "mrprapi sheet", baseUnit: "kg" })).id;
    pair.location = (await created("/api/tenants/prod/locations", { name: "mrprapi plant" })).id;
    const customer = (await created("/api/tenants/prod/customers", { name: "mrprapi retail" })).id;
    await created("/api/tenants/prod/stock/corrections", { material: pair.material, location: pair.location, quantity: "50", unit: "kg", reason: "mrprapi count" });
    await created("/api/tenants/prod/customer-orders", {
      customer,
      location: pair.location,
      lines: [
        { material: pair.material, quantity: "10", unit: "kg", requiredDate: day(4) },
        { material: pair.material, quantity: "15", unit: "kg", requiredDate: day(6) },
      ],
    });
    const response = await api("POST", "/api/tenants/prod/mrp/runs", rheaSecret, { key: randomUUID(), body: {} });
    expect(response.status, response.text).toBe(200);
    run = json(response).data as MrpRunView;
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
      await Promise.all([admin, rhea].map((browser) => browser.close()));
    }
  });

  it("gives a normal user and the admin the same filtered report, each day apart as six-decimal texts (MRP-005, API-014, UX-021)", async () => {
    const [mine, theirs] = [await report("prod", ourQuery(), rheaSecret), await report("prod", ourQuery(), adminSecret)];

    expect(mine).toEqual(theirs);
    expect(mine).toMatchObject({ run: { id: run.id }, total: 1, page: 1 });
    const [plan] = mine.plans;
    expect(plan).toMatchObject({
      material: pair.material, materialDescription: "mrprapi sheet", materialActive: true, baseUnit: "kg",
      location: pair.location, locationName: "mrprapi plant", locationActive: true, lowestProjectedBefore: "25.000000", firstShortageDate: null,
    });
    const days = plan.buckets.filter(({ date }) => date >= day(4) && date <= day(6)).map(({ date, firmDemand, projectedBefore }) => ({ date, firmDemand, projectedBefore }));
    expect(days).toEqual([
      { date: day(4), firmDemand: "10.000000", projectedBefore: "40.000000" },
      { date: day(5), firmDemand: "0.000000", projectedBefore: "40.000000" },
      { date: day(6), firmDemand: "15.000000", projectedBefore: "25.000000" },
    ]);
    expect(plan.buckets).toHaveLength(90);
  });

  it("covers every planned pair of the run unfiltered, and narrows by location to this file's pair", async () => {
    const { first, plans } = await everyPlan("prod");

    expect(first.total).toBe(first.run.pairs);
    expect(plans).toHaveLength(first.total);
    expect(plans.filter(({ material, location }) => material === pair.material && location === pair.location)).toHaveLength(1);
    const byLocation = await report("prod", `?location=${pair.location}`, rheaSecret);
    expect(byLocation.plans.map(({ material }) => material)).toEqual([pair.material]);
    expect(byLocation.total).toBe(1);
  });

  it("says a material or location the tenant doesn't have is not found, and refuses a malformed filter", async () => {
    for (const [query, code] of [["?material=99999999", "MATERIAL_NOT_FOUND"], ["?location=99999999", "LOCATION_NOT_FOUND"]]) {
      const response = await api("GET", `/api/tenants/prod/mrp/runs/latest${query}`, rheaSecret);
      expect([response.status, json(response).error.code]).toEqual([404, code]);
    }
    const malformed = await api("GET", "/api/tenants/prod/mrp/runs/latest?material=12", rheaSecret);
    expect([malformed.status, json(malformed).error.code]).toEqual([400, "VALIDATION_FAILED"]);
  });

  it("never shows this file's Prod pair in Test (R05)", async () => {
    const generation = (json(await api("GET", "/api/tenants/test")).data as { generation: number }).generation;
    const ran = await api("POST", "/api/tenants/test/mrp/runs", adminSecret, { key: randomUUID(), body: {}, generation });
    expect(ran.status, ran.text).toBe(200);

    const { plans } = await everyPlan("test");

    expect(plans.length).toBeGreaterThan(0);
    expect(plans.filter(({ materialDescription, locationName }) => materialDescription.startsWith("mrprapi") || locationName.startsWith("mrprapi"))).toEqual([]);
  });

  it("still answers a normal user while the tenant is read-only (TEN-018)", async () => {
    expect((await setReadOnly(true)).status).toBe(200);
    try {
      const view = await report("prod", ourQuery(), rheaSecret);
      expect(view.plans.map(({ lowestProjectedBefore }) => lowestProjectedBefore)).toEqual(["25.000000"]);
    } finally {
      expect((await setReadOnly(false)).status).toBe(200);
    }
  });
});
