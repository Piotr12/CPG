import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MrpLatestView, MrpPlanView, MrpRunView } from "@cpg/core";
import { callApi, json } from "./api";
import { explanationSetup, type ExplanationIds } from "./mrp-explanations";
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
// (R05), and readable while the tenant is read-only (TEN-018). E18-S02: its weeks and marks too.
describe("the MRP report through the API", () => {
  let admin: Browser;
  let rhea: Browser;
  let adminSecret: string;
  let rheaSecret: string;
  let run: MrpRunView;
  const pair = { material: "", location: "" };
  const overdue = { location: "", po: "" };
  let explained: ExplanationIds;

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
    // E18-S02: 20 kg ordered for a second location two days ago and not received, so it is overdue on the first day.
    overdue.location = (await created("/api/tenants/prod/locations", { name: "mrprapi dock" })).id;
    const supplier = (await created("/api/tenants/prod/suppliers", { name: "mrprapi mill" })).id;
    overdue.po = (await created("/api/tenants/prod/purchase-orders", { supplier, location: overdue.location, lines: [{ material: pair.material, quantity: "20", unit: "kg", plannedDate: day(-2) }] })).id;
    // E18-S03: the fallback, inactive-input, no-usable-BOM, provisional-chain and at-risk cases, at a site of their own.
    explained = await explanationSetup({
      create: async (path, body) => (await created(path, body)).id,
      deactivate: async (id) => {
        const { version } = json(await api("GET", `/api/tenants/prod/materials/${id}`)).data as { version: number };
        const deactivated = await api("PATCH", `/api/tenants/prod/materials/${id}`, adminSecret, { key: randomUUID(), body: { active: false, version } });
        expect(deactivated.status, deactivated.text).toBe(200);
      },
    }, "mrprapi");
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

  it("gives a normal user and the admin the same weeks with bucket=week, and the daily rows, run ID and time read the same before and after (UX-027, MRP-006, R07)", async () => {
    const before = await report("prod", ourQuery(), rheaSecret);
    const [mine, theirs] = [await report("prod", `${ourQuery()}&bucket=week`, rheaSecret), await report("prod", `${ourQuery()}&bucket=week`, adminSecret)];
    const after = await report("prod", ourQuery(), rheaSecret);

    expect(mine).toEqual(theirs);
    expect(mine.bucket).toBe("week");
    const [plan] = mine.plans;
    expect(plan.buckets).toEqual(before.plans[0].buckets);
    expect(plan.weeks!.length).toBeGreaterThanOrEqual(13);
    expect(plan.weeks!.reduce((sum, week) => sum + Number(week.firmDemand), 0)).toBe(25);
    for (const week of plan.weeks!) expect(week.projectedBefore).toBe(plan.buckets.find(({ date }) => date === week.end)!.projectedBefore);
    expect(after).toEqual(before);
    expect(after.run).toEqual(run);
    expect(before.plans[0]).not.toHaveProperty("weeks");

    const month = await api("GET", `/api/tenants/prod/mrp/runs/latest${ourQuery()}&bucket=month`, rheaSecret);
    expect([month.status, json(month).error.code]).toEqual([400, "VALIDATION_FAILED"]);
  });

  it("marks the overdue purchase-order line on the first day with its own date, never as an exception, for both roles (UX-018, MRP-015, BUY-019)", async () => {
    const query = `?material=${pair.material}&location=${overdue.location}&bucket=week`;
    const [mine, theirs] = [await report("prod", query, rheaSecret), await report("prod", query, adminSecret)];

    expect(mine).toEqual(theirs);
    const [plan] = mine.plans;
    const mark = { kind: "overdue-supply", date: day(0), source: "purchase-order", document: overdue.po, position: 1, plannedDate: day(-2), quantity: "20.000000" };
    expect(plan.marks).toEqual([mark]);
    expect(plan.weeks![0].marks).toEqual([mark]);
    expect(plan.exceptions).toEqual([]);
    expect(plan.buckets[0]).toMatchObject({ date: day(0), dependableSupply: "20.000000", projectedBefore: "20.000000" });
  });

  it("explains the run alike for both roles: each fallback's rejected BOMs with exact shortages, provisional plans apart, at-risk orders and exceptions (E18-S03, UX-020, MRP-025, MRP-047, MRP-050, MRP-051, LFC-026, R07)", async () => {
    const x = explained;
    const query = `?location=${x.site}`;
    const [mine, theirs] = [await report("prod", query, rheaSecret), await report("prod", query, adminSecret)];

    expect(mine).toEqual(theirs);
    expect(mine.plans).toHaveLength(mine.total);
    const plan = (material: string) => mine.plans.find((candidate) => candidate.material === material)!;
    const chosen = (material: string) => plan(material).proposals.map(({ kind, quantity, bom, bomRevision, rejectedBoms }) => ({ kind, quantity, bom, bomRevision, rejectedBoms }));
    // UX-020, MRP-025: priority 2 chosen, priority 1 rejected for 1 A short of the lot-rounded 6, as six-decimal texts.
    expect(chosen(x.f)).toEqual([{
      kind: "production-order", quantity: "6.000000", bom: x.fSecond, bomRevision: 1,
      rejectedBoms: [{ bom: x.fFirst, revision: 1, reason: "shortage", shortages: [{ material: x.a, required: "6.000000", available: "5.000000", shortage: "1.000000" }] }],
    }]);
    // MRP-050: priority 1 rejected for its inactive R.
    expect(chosen(x.g)).toEqual([{ kind: "production-order", quantity: "5.000000", bom: x.gSecond, bomRevision: 1, rejectedBoms: [{ bom: x.gFirst, revision: 1, reason: "inactive-component", materials: [x.r] }] }]);
    // LFC-026: no usable BOM, so no proposal, and a parent exception naming the rejected BOM and why.
    expect(plan(x.h).proposals).toEqual([]);
    expect(plan(x.h).exceptions).toMatchObject([{ code: "MISSING_USABLE_BOM", rejectedBoms: [{ bom: x.hBom, revision: 1, reason: "inactive-component", materials: [x.t] }] }]);
    // MRP-047: P and I are provisional, never proposals or supply; buying V stays executable.
    const pRejected = [{ bom: x.pBom, revision: 1, reason: "shortage", shortages: [{ material: x.i, required: "20.000000", available: "0.000000", shortage: "20.000000" }] }];
    expect(plan(x.p).proposals).toEqual([]);
    expect(plan(x.p).provisional).toMatchObject([{ needDate: day(20), quantity: "10.000000", bom: x.pBom, blockers: ["no-feasible-bom"], rejectedBoms: pRejected }]);
    expect(plan(x.p).exceptions).toMatchObject([{ code: "NO_FEASIBLE_BOM", params: { order: `${x.pBom}/1` }, rejectedBoms: pRejected }]);
    expect(plan(x.i).provisional).toMatchObject([{ quantity: "20.000000", bom: x.iBom, components: [{ material: x.v, quantity: "10.000000" }], blockers: ["no-feasible-bom"] }]);
    // P is short only of I, which MRP can make, so I is sized for real demand and raises its own No Feasible BOM (#369).
    expect(plan(x.i).exceptions).toMatchObject([{ code: "NO_FEASIBLE_BOM", params: { order: `${x.iBom}/1` } }]);
    expect(plan(x.v).proposals.map(({ kind, quantity }) => [kind, quantity])).toEqual([["purchase-requisition", "10.000000"]]);
    for (const material of [x.p, x.i]) expect(plan(material).buckets.every(({ proposedReceipts }) => proposedReceipts === "0.000000")).toBe(true);
    // MRP-051, LFC-027: the order's output is at-risk supply, apart from dependable, and the shortage stays.
    expect(plan(x.w).exceptions).toMatchObject([{ code: "AT_RISK_PRODUCTION", params: { order: x.order, quantity: "10.000000", inactiveComponents: x.u } }]);
    expect(plan(x.w).buckets.find(({ date }) => date === day(8))).toMatchObject({ atRiskSupply: "10.000000", dependableSupply: "0.000000" });
    expect(plan(x.w).buckets.find(({ date }) => date === day(12))).toMatchObject({ shortage: "10.000000" });
    // A fallback's stored rejections are never an exception.
    expect(mine.plans.flatMap(({ exceptions }) => exceptions.map(({ code }) => code)).sort()).toEqual(["AT_RISK_PRODUCTION", "MISSING_USABLE_BOM", "NO_FEASIBLE_BOM", "NO_FEASIBLE_BOM"]);
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
      // E18-S03's explanations read the same (R05).
      const fallback = (await report("prod", `?material=${explained.f}&location=${explained.site}`, rheaSecret)).plans[0];
      expect(fallback.proposals[0].rejectedBoms.map(({ bom, reason }) => [bom, reason])).toEqual([[explained.fFirst, "shortage"]]);
    } finally {
      expect((await setReadOnly(false)).status).toBe(200);
    }
  });
});
