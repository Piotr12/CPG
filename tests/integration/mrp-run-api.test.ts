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
  /** This file's pair in the latest Prod run, paging with the run's ID so every page is of that run. */
  async function ourPlan(run: MrpRunView): Promise<MrpPlanView | undefined> {
    for (let page = 1; ; page += 1) {
      const response = await latest("prod", `?page=${page}&run=${run.id}`);
      expect(response.status, response.text).toBe(200);
      const { plans } = json(response).data as MrpLatestView;
      const found = plans.find(({ material, location }) => material === pair.material && location === pair.location);
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
    const prod = json(await runIn("prod")).data as MrpRunView;
    // A Prod run leaves Test's latest run as it was.
    expect((await latestRun("test")).id).toBe(String(Number(test.id) + 1).padStart(8, "0"));
    expect((await latestRun("test")).createdAt <= prod.createdAt).toBe(true);

    const reset = await api("POST", "/api/tenants/test/reset", adminSecret, { key: randomUUID(), body: {}, generation: await generation() });
    expect(reset.status, reset.text).toBe(200);

    const none = await latest("test");
    expect([none.status, json(none).error.code]).toEqual([404, "MRP_RUN_NOT_FOUND"]);
    expect((json(await runIn("test", adminSecret, randomUUID(), await generation())).data as MrpRunView).id).toBe("00000001");
    expect(await latestRun("prod")).toEqual(prod);
  });
});
