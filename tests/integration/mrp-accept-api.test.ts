import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MrpLatestView, MrpProposalView, MrpRunView } from "@cpg/core";
import { allPages, callApi, json, type ApiResponse } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signInAs, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account, token and records: other files share the app, and users are never deleted.
const UNA = "mrpacc-una";
const UNA_PASSWORD = "mrpacc una's first password";
const ADMIN_TOKEN = "mrpacc-admin";

/** A day `days` after the server's UTC today, as the run plans from it. */
const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const today = () => day(0);
/**
 * Runs `scenario` once more when the UTC day changed while it ran, whether it passed or failed: a run from an
 * earlier day can't be accepted (spec Q7), so a run before midnight and an accept after it is refused as stale.
 */
async function withinOneDay<T>(scenario: () => Promise<T>, attempt = 1): Promise<T> {
  const started = today();
  try {
    const result = await scenario();
    if (today() === started) return result;
  } catch (error) {
    if (today() === started) throw error;
  }
  expect(attempt, "a scenario crosses midnight UTC at most once").toBe(1);
  return withinOneDay(scenario, attempt + 1);
}

// E19-S01 through the bearer API (R07): accepting a proposal of the latest run creates a requisition
// tagged with the run, once; a stale, foreign, Make or read-only acceptance creates nothing.
describe("Accepting MRP proposals through the API", () => {
  let admin: Browser;
  let una: Browser;
  let adminSecret: string;
  let unaSecret: string;
  let customer: string;

  const api = (method: string, path: string, secret = adminSecret, options?: { key?: string; body?: unknown; generation?: number }) =>
    callApi(baseUrl, method, path, secret, options);
  const write = (path: string, body: unknown, secret = adminSecret, generation?: number) => api("POST", path, secret, { key: randomUUID(), body, generation });
  const created = async (path: string, body: unknown, generation?: number) => {
    const response = await write(path, body, adminSecret, generation);
    expect(response.status, response.text).toBe(200);
    return json(response).data as { id: string };
  };
  const testGeneration = async () => (json(await api("GET", "/api/tenants/test")).data as { generation: number }).generation;
  const setReadOnly = (readOnly: boolean) => api("PATCH", "/api/tenants/prod", adminSecret, { key: randomUUID(), body: { readOnly } });
  /** Every document of a kind in a tenant, read across every page (lesson 2026-10-24). */
  const all = (tenant: "test" | "prod", kind: string) =>
    allPages(async (page) => json(await api("GET", `/api/tenants/${tenant}/${kind}?page=${page}`)).data as { id: string }[]);
  const counts = async (tenant: "test" | "prod" = "prod") =>
    Object.fromEntries(await Promise.all(["purchase-requisitions", "purchase-orders", "production-orders"].map(async (kind) => [kind, (await all(tenant, kind)).length])));
  const run = async (tenant: "test" | "prod" = "prod", generation?: number) => {
    const response = await api("POST", `/api/tenants/${tenant}/mrp/runs`, adminSecret, { key: randomUUID(), body: {}, generation });
    expect(response.status, response.text).toBe(200);
    return json(response).data as MrpRunView;
  };
  /** The latest run's proposals for one pair. */
  const proposalsOf = async (material: string, location: string, tenant: "test" | "prod" = "prod") => {
    const response = await api("GET", `/api/tenants/${tenant}/mrp/runs/latest?material=${material}&location=${location}`);
    expect(response.status, response.text).toBe(200);
    const { run: latest, plans } = json(response).data as MrpLatestView;
    return { run: latest.id, proposals: plans[0]?.proposals ?? [] };
  };
  const accept = (runId: string, proposal: string, { secret = adminSecret, key = randomUUID(), tenant = "prod", generation }: { secret?: string; key?: string; tenant?: string; generation?: number } = {}) =>
    api("POST", `/api/tenants/${tenant}/mrp/runs/${runId}/proposals/${proposal}/accept`, secret, { key, body: {}, generation });
  const refusal = (response: ApiResponse) => json(response).error as { code: string; params?: Record<string, string> };
  /** A Buy pair of its own: a new material at a new location with no lot rule and one order of `quantity` three days out. */
  async function buyPair(name: string, quantity: string, procurement: "buy" | "make" = "buy", tenant: "test" | "prod" = "prod") {
    const generation = tenant === "test" ? await testGeneration() : undefined;
    const root = `/api/tenants/${tenant}`;
    const material = (await created(`${root}/materials`, { type: "finished", description: `mrpacc ${name}`, baseUnit: "kg" }, generation)).id;
    const location = (await created(`${root}/locations`, { name: `mrpacc ${name} plant` }, generation)).id;
    const buyer = tenant === "prod" ? customer : (await created(`${root}/customers`, { name: `mrpacc ${name} retail` }, generation)).id;
    await created(`${root}/planning-parameters`, { material, location, procurement, leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" }, generation);
    await created(`${root}/customer-orders`, { customer: buyer, location, lines: [{ material, quantity, unit: "kg", requiredDate: day(3) }] }, generation);
    return { material, location };
  }

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, ADMIN_TOKEN);
    expect((await write("/api/users", { username: UNA, password: UNA_PASSWORD })).status).toBe(200);
    await signInAs(una, baseUrl, UNA, UNA_PASSWORD);
    await openTokens(una, baseUrl);
    unaSecret = await createToken(una, "mrpacc-una-cli");
    customer = (await created("/api/tenants/prod/customers", { name: "mrpacc retail" })).id;
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
      await Promise.all([admin, una].map((browser) => browser.close()));
    }
  });

  it("runs with the creation option at its default and creates no requisition, purchase order or production order, read across every page (RUN-003, R10)", async () => {
    await buyPair("default", "40");
    const before = await counts();

    const created = await run();

    expect(created.mode).toBe("manual");
    expect(await counts()).toEqual(before);
  });

  it("accepts a Buy need of exactly 100 kg as one Open requisition tagged with the run, with no purchase order, once; a replay returns it (BUY-001, RUN-005, R07)", () => withinOneDay(async () => {
    const pair = await buyPair("sugar", "100");
    const { runId, proposal, before } = await withinOneDay(async () => {
      await run();
      const { run: latest, proposals } = await proposalsOf(pair.material, pair.location);
      return { runId: latest, proposal: proposals[0] as MrpProposalView, before: await counts() };
    });
    expect(proposal).toMatchObject({ kind: "purchase-requisition", needDate: day(3), quantity: "100.000000", executable: true, document: null });
    const key = randomUUID();

    const response = await accept(runId, proposal.id, { secret: unaSecret, key });

    expect(response.status, response.text).toBe(200);
    const { document, proposal: accepted } = json(response).data as { document: { id: string }; proposal: MrpProposalView & { run: string } };
    expect(document).toMatchObject({ material: pair.material, location: pair.location, quantity: "100.000000", converted: "0.000000", requiredDate: day(3), status: "open", mrpRun: runId });
    expect(accepted).toMatchObject({ id: proposal.id, run: runId, material: pair.material, document: document.id });
    expect(json(await api("GET", `/api/tenants/prod/purchase-requisitions/${document.id}`)).data).toMatchObject({ mrpRun: runId, quantity: "100.000000" });
    expect(await counts()).toEqual({ ...before, "purchase-requisitions": before["purchase-requisitions"] + 1 });
    expect((await proposalsOf(pair.material, pair.location)).proposals[0].document).toBe(document.id);

    const replay = await accept(runId, proposal.id, { secret: unaSecret, key });
    expect(replay.replayed).toBe("true");
    expect((json(replay).data as { document: { id: string } }).document.id).toBe(document.id);
    const again = await accept(runId, proposal.id);
    expect(again.status).toBe(409);
    expect(refusal(again)).toMatchObject({ code: "MRP_PROPOSAL_ACCEPTED", params: { document: document.id, kind: "purchase-requisition" } });
    expect((await counts())["purchase-requisitions"]).toBe(before["purchase-requisitions"] + 1);
  }));

  it("refuses a proposal as stale once a stock correction changed it, advising to run MRP again, and creates nothing (RUN-017)", () => withinOneDay(async () => {
    const pair = await buyPair("salt", "50");
    const { runId, proposal } = await withinOneDay(async () => {
      await run();
      const { run: latest, proposals } = await proposalsOf(pair.material, pair.location);
      return { runId: latest, proposal: proposals[0] };
    });
    await created("/api/tenants/prod/stock/corrections", { material: pair.material, location: pair.location, quantity: "10", unit: "kg", reason: "mrpacc recount" });
    const before = await counts();

    const response = await accept(runId, proposal.id, { secret: unaSecret });

    expect(response.status).toBe(409);
    expect(refusal(response)).toMatchObject({ code: "MRP_PROPOSAL_STALE", params: { material: pair.material, location: pair.location } });
    expect(json(response).error.message).toContain("Run MRP again");
    expect(await counts()).toEqual(before);
  }));

  it("refuses a Make proposal as not executable, creating no production order (spec Q1)", () => withinOneDay(async () => {
    const pair = await buyPair("jam", "12", "make");
    // Since #280 a Make pair gets a proposal only with an active BOM valid on its planned finish.
    const input = (await created("/api/tenants/prod/materials", { type: "raw", description: "mrpacc jam fruit", baseUnit: "each" })).id;
    await created("/api/tenants/prod/boms", { output: pair.material, priority: 1, validFrom: day(-30), validThrough: null, components: [{ material: input, quantity: "1", unit: "each" }] });
    // Since #283 a Make proposal its BOM can't supply is a provisional action, not a proposal: the fruit is on hand.
    await created("/api/tenants/prod/stock/corrections", { material: input, location: pair.location, quantity: "12", unit: "each", reason: "mrpacc count" });
    const { runId, proposal } = await withinOneDay(async () => {
      await run();
      const { run: latest, proposals } = await proposalsOf(pair.material, pair.location);
      return { runId: latest, proposal: proposals[0] };
    });
    expect(proposal).toMatchObject({ kind: "production-order", executable: false });

    const response = await accept(runId, proposal.id);

    expect(response.status).toBe(409);
    expect(refusal(response)).toMatchObject({ code: "MRP_PROPOSAL_NOT_EXECUTABLE", params: { material: pair.material, kind: "production-order" } });
  }));

  it("doesn't find a Test proposal under Prod, and Test's generation guards its own acceptance (RUN-022, R05)", () => withinOneDay(async () => {
    const pair = await buyPair("pepper", "30", "buy", "test");
    const { testRun, testProposal, prodRun } = await withinOneDay(async () => {
      const generation = await testGeneration();
      await run("test", generation);
      const { run: latest, proposals } = await proposalsOf(pair.material, pair.location, "test");
      return { testRun: latest, testProposal: proposals[0], prodRun: (await run()).id };
    });
    const before = { prod: await counts("prod"), test: await counts("test") };

    const foreign = await accept(prodRun, testProposal.id);
    expect(foreign.status).toBe(404);
    expect(refusal(foreign).code).toBe("MRP_PROPOSAL_NOT_FOUND");
    const unbound = await accept(testRun, testProposal.id, { tenant: "test" });
    expect(unbound.status).toBe(428);
    const stale = await accept(testRun, testProposal.id, { tenant: "test", generation: (await testGeneration()) + 1 });
    expect(stale.status).toBe(409);
    expect(refusal(stale).code).toBe("GENERATION_STALE");
    expect({ prod: await counts("prod"), test: await counts("test") }).toEqual(before);

    const accepted = await accept(testRun, testProposal.id, { tenant: "test", generation: await testGeneration() });
    expect(accepted.status, accepted.text).toBe(200);
    expect(await counts("prod")).toEqual(before.prod);
  }));

  it("refuses every acceptance in a read-only tenant, the admin's included, and accepts with the admin's token once writable (R05, R07)", () => withinOneDay(async () => {
    const pair = await buyPair("flour", "25");
    const { runId, proposal } = await withinOneDay(async () => {
      await run();
      const { run: latest, proposals } = await proposalsOf(pair.material, pair.location);
      return { runId: latest, proposal: proposals[0] };
    });
    expect((await setReadOnly(true)).status).toBe(200);
    try {
      for (const secret of [unaSecret, adminSecret]) {
        const response = await accept(runId, proposal.id, { secret });
        expect(response.status).toBe(409);
        expect(refusal(response).code).toBe("TENANT_READ_ONLY");
      }
      expect((await proposalsOf(pair.material, pair.location)).proposals[0].document).toBeNull();
    } finally {
      expect((await setReadOnly(false)).status).toBe(200);
    }

    const response = await accept(runId, proposal.id);
    expect(response.status, response.text).toBe(200);
    expect(json(response).data.document).toMatchObject({ quantity: "25.000000", mrpRun: runId });
  }));
});
