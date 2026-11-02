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

  it("proposes a requisition of 10 for Buy and a production order of 3 for Make, each location by its own parameters, read from the latest run (#278, MAT-016)", async () => {
    const material = (await created("/api/tenants/prod/materials", { type: "intermediate", description: "mrpapi frame", baseUnit: "each" })).id;
    const bought = pair.location;
    const made = (await created("/api/tenants/prod/locations", { name: "mrpapi workshop" })).id;
    const customer = (await created("/api/tenants/prod/customers", { name: "mrpapi frames" })).id;
    await created("/api/tenants/prod/planning-parameters", { material, location: bought, procurement: "buy", leadTimeDays: 4, minimumQuantity: "10", lotMultiple: "5" });
    await created("/api/tenants/prod/planning-parameters", { material, location: made, procurement: "make", leadTimeDays: 1, minimumQuantity: "0", lotMultiple: "1" });
    // Since #280 a Make proposal needs an active BOM valid on its need date.
    const input = (await created("/api/tenants/prod/materials", { type: "raw", description: "mrpapi timber", baseUnit: "each" })).id;
    const bom = (await created("/api/tenants/prod/boms", { output: material, priority: 1, validFrom: day(-30), validThrough: null, components: [{ material: input, quantity: "1", unit: "each" }] })).id;
    // Since #283 a Make proposal its BOM can't supply is a provisional action: the timber is on hand at the workshop.
    await created("/api/tenants/prod/stock/corrections", { material: input, location: made, quantity: "3", unit: "each", reason: "mrpapi count" });
    for (const location of [bought, made]) {
      await created("/api/tenants/prod/customer-orders", { customer, location, lines: [{ material, quantity: "3", unit: "each", requiredDate: day(6) }] });
    }

    const response = await runIn("prod");
    expect(response.status, response.text).toBe(200);
    const filtered = await latest("prod", `?material=${material}`);
    expect(filtered.status, filtered.text).toBe(200);
    const plans = (json(filtered).data as MrpLatestView).plans;

    expect(plans.map(({ location, proposals }) => [location, proposals])).toEqual([
      // Lead times 4 and 1 before day 6 start on days 2 and 5: on time (#279). Since E19-S01 (#287) each proposal has its ID,
      // whether it can be accepted (a Make one can't yet), and its document.
      // Since #281 a production order names the BOM and revision it is exploded through.
      [bought, [{ id: expect.any(String), kind: "purchase-requisition", needDate: day(6), quantity: "10.000000", plannedStart: day(2), plannedFinish: day(6), lateDays: 0, beyondHorizon: false, executable: true, document: null, bom: null, bomRevision: null, rejectedBoms: [] }]],
      [made, [{ id: expect.any(String), kind: "production-order", needDate: day(6), quantity: "3.000000", plannedStart: day(5), plannedFinish: day(6), lateDays: 0, beyondHorizon: false, executable: true, document: null, bom, bomRevision: 1, rejectedBoms: [] }]],
    ]);
    expect(plans[0].buckets[6]).toMatchObject({ date: day(6), proposedReceipts: "10.000000", projectedBefore: "-3.000000", projectedAfter: "7.000000" });
    expect(plans[1].buckets[6]).toMatchObject({ date: day(6), proposedReceipts: "3.000000", projectedBefore: "-3.000000", projectedAfter: "0.000000" });
  });

  it("lists a Late Supply proposal on its feasible finish and a Beyond Horizon one in no day, read from the latest run (#279, MRP-037, MRP-049)", async () => {
    const customer = (await created("/api/tenants/prod/customers", { name: "mrpapi timing" })).id;
    const proposalsFor = async (description: string, leadTimeDays: number, due: number) => {
      const material = (await created("/api/tenants/prod/materials", { type: "intermediate", description, baseUnit: "each" })).id;
      await created("/api/tenants/prod/planning-parameters", { material, location: pair.location, procurement: "buy", leadTimeDays, minimumQuantity: "0", lotMultiple: "1" });
      await created("/api/tenants/prod/customer-orders", { customer, location: pair.location, lines: [{ material, quantity: "5", unit: "each", requiredDate: day(due) }] });
      return material;
    };
    const late = await proposalsFor("mrpapi late", 7, 3);
    const far = await proposalsFor("mrpapi far", 120, 20);

    const response = await runIn("prod");
    expect(response.status, response.text).toBe(200);
    const planOf = async (material: string) => {
      const read = await latest("prod", `?material=${material}`);
      expect(read.status, read.text).toBe(200);
      return (json(read).data as MrpLatestView).plans[0];
    };

    const latePlan = await planOf(late);
    expect(latePlan.proposals).toEqual([
      { id: expect.any(String), kind: "purchase-requisition", needDate: day(3), quantity: "5.000000", plannedStart: day(0), plannedFinish: day(7), lateDays: 4, beyondHorizon: false, executable: true, document: null, bom: null, bomRevision: null, rejectedBoms: [] },
    ]);
    // The receipt counts on day 7, not on the need date: days 3 to 6 keep their shortage.
    expect(latePlan.buckets.slice(3, 7).map(({ projectedAfter }) => projectedAfter)).toEqual(["-5.000000", "-5.000000", "-5.000000", "-5.000000"]);
    expect(latePlan.buckets[7]).toMatchObject({ date: day(7), proposedReceipts: "5.000000", projectedAfter: "0.000000" });

    const farPlan = await planOf(far);
    expect(farPlan.proposals).toEqual([
      { id: expect.any(String), kind: "purchase-requisition", needDate: day(20), quantity: "5.000000", plannedStart: day(0), plannedFinish: day(120), lateDays: 100, beyondHorizon: true, executable: true, document: null, bom: null, bomRevision: null, rejectedBoms: [] },
    ]);
    expect(farPlan.buckets).toHaveLength(90);
    expect(farPlan.buckets.every(({ proposedReceipts }) => proposedReceipts === "0.000000")).toBe(true);
    expect(farPlan.buckets.slice(20).every(({ projectedAfter }) => projectedAfter === "-5.000000")).toBe(true);
  });

  it("raises Missing Planning Parameters without a set and Missing BOM for Make without a BOM, with no guessed proposal and the demand still shown, read from the latest run (#280, MAT-017, MRP-035)", async () => {
    const material = (await created("/api/tenants/prod/materials", { type: "intermediate", description: "mrpapi bracket", baseUnit: "each" })).id;
    const unplanned = pair.location;
    const made = (await created("/api/tenants/prod/locations", { name: "mrpapi forge" })).id;
    const customer = (await created("/api/tenants/prod/customers", { name: "mrpapi brackets" })).id;
    await created("/api/tenants/prod/planning-parameters", { material, location: made, procurement: "make", leadTimeDays: 1, minimumQuantity: "0", lotMultiple: "1" });
    for (const location of [unplanned, made]) {
      await created("/api/tenants/prod/customer-orders", { customer, location, lines: [{ material, quantity: "4", unit: "each", requiredDate: day(7) }] });
    }

    const response = await runIn("prod");
    expect(response.status, response.text).toBe(200);
    const filtered = await latest("prod", `?material=${material}`);
    expect(filtered.status, filtered.text).toBe(200);
    const plans = (json(filtered).data as MrpLatestView).plans;

    expect(plans.map(({ location, proposals, exceptions }) => [location, proposals, exceptions])).toEqual([
      [unplanned, [], [{
        code: "MISSING_PLANNING_PARAMETERS",
        message: "This material has no usable planning parameters at this location, so MRP proposes no supply for it there.",
        params: { material, location: unplanned, date: day(7), reason: "no-set" },
      }]],
      [made, [], [{
        code: "MISSING_BOM",
        message: "This material is made at this location, but no active BOM has a current revision valid on the planned finish date, so MRP proposes no production.",
        params: { material, location: made, date: day(7) },
      }]],
    ]);
    for (const plan of plans) {
      expect(plan.buckets[7]).toMatchObject({ date: day(7), firmDemand: "4.000000", projectedBefore: "-4.000000", shortage: "4.000000", proposedReceipts: "0.000000", projectedAfter: "-4.000000" });
    }
  });

  /** F made from 2 I, I from 0.5 R, R bought, at a site of their own, none on hand, and 10 F ordered for day 20 (#281). */
  const levels = (async () => {
    const material = async (type: string, description: string) => (await created("/api/tenants/prod/materials", { type, description, baseUnit: "each" })).id;
    const [f, i, r] = [await material("finished", "mrpapi cabinet f"), await material("intermediate", "mrpapi frame i"), await material("raw", "mrpapi steel r")];
    const site = (await created("/api/tenants/prod/locations", { name: "mrpapi levels plant" })).id;
    const recipe = async (output: string, input: string, quantity: string) =>
      (await created("/api/tenants/prod/boms", { output, priority: 1, validFrom: day(-30), validThrough: null, components: [{ material: input, quantity, unit: "each" }] })).id;
    const boms = { f: await recipe(f, i, "2"), i: await recipe(i, r, "0.5") };
    for (const [material, procurement, leadTimeDays] of [[f, "make", 2], [i, "make", 3], [r, "buy", 1]] as const) {
      await created("/api/tenants/prod/planning-parameters", { material, location: site, procurement, leadTimeDays, minimumQuantity: "0", lotMultiple: "1" });
    }
    const customer = (await created("/api/tenants/prod/customers", { name: "mrpapi levels" })).id;
    await created("/api/tenants/prod/customer-orders", { customer, location: site, lines: [{ material: f, quantity: "10", unit: "each", requiredDate: day(20) }] });
    return { f, i, r, site, boms };
  });
  let threeLevels: ReturnType<typeof levels> | undefined;
  const threeLevelPlant = () => (threeLevels ??= levels());

  it("lists F's and I's provisional plan, each level on its parent's start with its BOM, components and blockers, and only R's requisition as a proposal, read from the latest run (#281, #283, MRP-027, MRP-031, MRP-047)", async () => {
    const { f, i, r, site, boms } = await threeLevelPlant();
    const response = await runIn("prod");
    expect(response.status, response.text).toBe(200);
    const planOf = async (material: string) => {
      const read = await latest("prod", `?material=${material}&location=${site}`);
      expect(read.status, read.text).toBe(200);
      return (json(read).data as MrpLatestView).plans[0];
    };
    const [fPlan, iPlan, rPlan] = [await planOf(f), await planOf(i), await planOf(r)];
    // None on hand: F and I can't be supplied, so both are provisional, never proposals (#283, MRP-047).
    expect([fPlan, iPlan].map(({ proposals }) => proposals)).toEqual([[], []]);
    expect(fPlan.provisional).toEqual([{
      kind: "production-order", needDate: day(20), quantity: "10.000000", plannedStart: day(18), plannedFinish: day(20), lateDays: 0, beyondHorizon: false,
      bom: boms.f, bomRevision: 1, components: [{ material: i, quantity: "20.000000" }], blockers: ["no-feasible-bom"], missing: `${boms.f}/1: ${i} 20.000000 0.000000 20.000000`,
      order: `${boms.f}/1`, rejectedBoms: [{ bom: boms.f, revision: 1, reason: "shortage", shortages: [{ material: i, required: "20.000000", available: "0.000000", shortage: "20.000000" }] }],
    }]);
    expect(iPlan.provisional).toEqual([{
      kind: "production-order", needDate: day(18), quantity: "20.000000", plannedStart: day(15), plannedFinish: day(18), lateDays: 0, beyondHorizon: false,
      bom: boms.i, bomRevision: 1, components: [{ material: r, quantity: "10.000000" }], blockers: ["no-feasible-bom", "provisional-demand"], missing: `${boms.i}/1: ${r} 10.000000 0.000000 10.000000`,
      order: `${boms.i}/1`, rejectedBoms: [{ bom: boms.i, revision: 1, reason: "shortage", shortages: [{ material: r, required: "10.000000", available: "0.000000", shortage: "10.000000" }] }],
    }]);
    // Buying R is the only executable action.
    expect(rPlan.proposals.map(({ kind, needDate, plannedStart, quantity, bom, executable }) => ({ kind, needDate, plannedStart, quantity, bom, executable }))).toEqual([
      { kind: "purchase-requisition", needDate: day(15), plannedStart: day(14), quantity: "10.000000", bom: null, executable: true },
    ]);
    // Each component's need is dependent demand on its parent's start. No hypothetical output is a receipt: F and I stay short.
    expect(fPlan.buckets[20]).toMatchObject({ date: day(20), proposedReceipts: "0.000000", projectedAfter: "-10.000000" });
    expect(iPlan.buckets[18]).toMatchObject({ date: day(18), dependentDemand: "20.000000", projectedBefore: "-20.000000", proposedReceipts: "0.000000", projectedAfter: "-20.000000" });
    expect(rPlan.buckets[15]).toMatchObject({ date: day(15), dependentDemand: "10.000000", projectedBefore: "-10.000000", projectedAfter: "0.000000" });
    // Only F, sized for real demand, raises No Feasible BOM; I's action carries its own `missing`.
    expect([fPlan, iPlan, rPlan].flatMap(({ exceptions }) => exceptions.map(({ code, params }) => [code, params.material, params.missing]))).toEqual([
      ["NO_FEASIBLE_BOM", f, `${boms.f}/1: ${i} 20.000000 0.000000 20.000000`],
    ]);
  });

  it("reports G's open order as at risk once its pinned raw S is deactivated: the balance is at-risk supply, the shortage shows and no G replaces it, read from the latest run (#283, MRP-051, LFC-027)", async () => {
    const material = async (type: string, description: string) => (await created("/api/tenants/prod/materials", { type, description, baseUnit: "each" })).id;
    const [g, s] = [await material("finished", "mrpapi risk g"), await material("raw", "mrpapi risk s")];
    const site = (await created("/api/tenants/prod/locations", { name: "mrpapi risk plant" })).id;
    const bom = (await created("/api/tenants/prod/boms", { output: g, priority: 1, validFrom: day(-30), validThrough: null, components: [{ material: s, quantity: "1", unit: "each" }] })).id;
    await created("/api/tenants/prod/planning-parameters", { material: g, location: site, procurement: "make", leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" });
    const order = (await created("/api/tenants/prod/production-orders", { output: g, location: site, quantity: "10", unit: "each", plannedFinish: day(8), bom, revision: 1 })).id;
    const customer = (await created("/api/tenants/prod/customers", { name: "mrpapi risk" })).id;
    await created("/api/tenants/prod/customer-orders", { customer, location: site, lines: [{ material: g, quantity: "10", unit: "each", requiredDate: day(12) }] });
    // Allowed while only BOMs and the open order's pinned revision use S (E10-S05, LFC-015).
    const { version } = json(await api("GET", `/api/tenants/prod/materials/${s}`)).data as { version: number };
    const deactivated = await api("PATCH", `/api/tenants/prod/materials/${s}`, adminSecret, { key: randomUUID(), body: { active: false, version } });
    expect(deactivated.status, deactivated.text).toBe(200);

    const response = await runIn("prod");
    expect(response.status, response.text).toBe(200);
    const read = await latest("prod", `?location=${site}`);
    expect(read.status, read.text).toBe(200);
    const { plans } = json(read).data as MrpLatestView;

    // The demand equals the order, so no excess raises Missing Usable BOM; S gets no demand from the order.
    expect(plans.map(({ material: item, proposals, provisional, exceptions }) => [item, proposals, provisional, exceptions])).toEqual([
      [g, [], [], [{
        code: "AT_RISK_PRODUCTION",
        message: "An open production order of this material pins a BOM revision with an inactive component, so its unproduced output is at risk: MRP doesn't count it as supply, and proposes no replacement for the demand it was to cover until the order is closed or cancelled or the component is reactivated.",
        params: { material: g, location: site, date: day(8), order, quantity: "10.000000", inactiveComponents: s },
      }]],
    ]);
    expect(plans[0].buckets[8]).toMatchObject({ date: day(8), atRiskSupply: "10.000000", dependableSupply: "0.000000" });
    expect(plans[0].buckets[12]).toMatchObject({ date: day(12), projectedBefore: "-10.000000", projectedAfter: "-10.000000", shortage: "10.000000" });
  });

  it("falls back from F's priority-1 BOM, short of A for the lot-rounded 6, to its priority-2 BOM of B, with no exception, read from the latest run (#282, MRP-025, MRP-046, BOM-010)", async () => {
    const material = async (type: string, description: string) => (await created("/api/tenants/prod/materials", { type, description, baseUnit: "each" })).id;
    const [f, a, b] = [await material("finished", "mrpapi choice f"), await material("raw", "mrpapi choice a"), await material("raw", "mrpapi choice b")];
    const site = (await created("/api/tenants/prod/locations", { name: "mrpapi choice plant" })).id;
    const recipe = async (input: string, priority: number) =>
      (await created("/api/tenants/prod/boms", { output: f, priority, validFrom: day(-30), validThrough: null, components: [{ material: input, quantity: "1", unit: "each" }] })).id;
    await recipe(a, 1);
    const second = await recipe(b, 2);
    await created("/api/tenants/prod/planning-parameters", { material: f, location: site, procurement: "make", leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "2" });
    for (const [input, quantity] of [[a, "5"], [b, "20"]]) {
      await created("/api/tenants/prod/stock/corrections", { material: input, location: site, quantity, unit: "each", reason: "mrpapi count" });
    }
    const customer = (await created("/api/tenants/prod/customers", { name: "mrpapi choice" })).id;
    await created("/api/tenants/prod/customer-orders", { customer, location: site, lines: [{ material: f, quantity: "4.1", unit: "each", requiredDate: day(10) }] });

    const response = await runIn("prod");
    expect(response.status, response.text).toBe(200);
    const read = await latest("prod", `?material=${f}&location=${site}`);
    expect(read.status, read.text).toBe(200);
    const [plan] = (json(read).data as MrpLatestView).plans;

    // 4.1 rounds to 6 by the multiple of 2: 6 A is more than the 5 on hand, while 6 B is there.
    expect(plan.proposals.map(({ kind, quantity, bom, bomRevision }) => ({ kind, quantity, bom, bomRevision }))).toEqual([
      { kind: "production-order", quantity: "6.000000", bom: second, bomRevision: 1 },
    ]);
    expect(plan.exceptions).toEqual([]);
  });

  it("raises Missing Usable BOM for G once its only BOM's raw R is deactivated, with no proposal for G or R, read from the latest run (#282, LFC-026, MRP-050)", async () => {
    const material = async (type: string, description: string) => (await created("/api/tenants/prod/materials", { type, description, baseUnit: "each" })).id;
    const [g, r] = [await material("finished", "mrpapi usable g"), await material("raw", "mrpapi usable r")];
    const site = (await created("/api/tenants/prod/locations", { name: "mrpapi usable plant" })).id;
    const bom = (await created("/api/tenants/prod/boms", { output: g, priority: 1, validFrom: day(-30), validThrough: null, components: [{ material: r, quantity: "1", unit: "each" }] })).id;
    for (const [item, procurement] of [[g, "make"], [r, "buy"]] as const) {
      await created("/api/tenants/prod/planning-parameters", { material: item, location: site, procurement, leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" });
    }
    const customer = (await created("/api/tenants/prod/customers", { name: "mrpapi usable" })).id;
    await created("/api/tenants/prod/customer-orders", { customer, location: site, lines: [{ material: g, quantity: "5", unit: "each", requiredDate: day(10) }] });
    // Allowed while only BOMs use R (E10-S05, #191).
    const { version } = json(await api("GET", `/api/tenants/prod/materials/${r}`)).data as { version: number };
    const deactivated = await api("PATCH", `/api/tenants/prod/materials/${r}`, adminSecret, { key: randomUUID(), body: { active: false, version } });
    expect(deactivated.status, deactivated.text).toBe(200);

    const response = await runIn("prod");
    expect(response.status, response.text).toBe(200);
    const read = await latest("prod", `?location=${site}`);
    expect(read.status, read.text).toBe(200);
    const { plans } = json(read).data as MrpLatestView;

    expect(plans.map(({ material: item, proposals, exceptions }) => [item, proposals, exceptions])).toEqual([
      [g, [], [{
        code: "MISSING_USABLE_BOM",
        message: "This material is made at this location, but every BOM valid on the planned finish date has an inactive component, so MRP proposes no production.",
        params: { material: g, location: site, date: day(10), inactive: `${bom}/1: ${r}` },
        // E18-S03: the rejected BOM and why, structured.
        rejectedBoms: [{ bom, revision: 1, reason: "inactive-component", materials: [r] }],
      }]],
    ]);
  });

  it("names a production-order proposal's BOM and revision in the MRP page's proposals table (#281, MRP-031)", async () => {
    // A feasible proposal of its own: since #283 one its BOM can't supply is a provisional action, not in the table.
    const material = async (type: string, description: string) => (await created("/api/tenants/prod/materials", { type, description, baseUnit: "each" })).id;
    const [f, input] = [await material("finished", "mrpapi page f"), await material("raw", "mrpapi page input")];
    const site = (await created("/api/tenants/prod/locations", { name: "mrpapi page plant" })).id;
    const boms = { f: (await created("/api/tenants/prod/boms", { output: f, priority: 1, validFrom: day(-30), validThrough: null, components: [{ material: input, quantity: "1", unit: "each" }] })).id };
    await created("/api/tenants/prod/planning-parameters", { material: f, location: site, procurement: "make", leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" });
    await created("/api/tenants/prod/stock/corrections", { material: input, location: site, quantity: "10", unit: "each", reason: "mrpapi count" });
    const customer = (await created("/api/tenants/prod/customers", { name: "mrpapi page" })).id;
    await created("/api/tenants/prod/customer-orders", { customer, location: site, lines: [{ material: f, quantity: "10", unit: "each", requiredDate: day(20) }] });
    expect((await runIn("prod")).status).toBe(200);
    await admin.open(`${baseUrl}/admin/prod/mrp?material=${f}&location=${site}`);
    const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => !e.closest("[hidden]") && e.offsetParent !== null)`;
    await admin.waitUntil(`${shown("[data-mrp-proposals] [data-mrp-proposal-bom]")}.length > 0`);
    expect(await admin.evaluate<string[]>(`${shown("[data-mrp-proposals] [data-mrp-proposal-bom]")}.map((el) => el.textContent)`)).toEqual([`BOM ${boms.f} / revision 1`]);
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
