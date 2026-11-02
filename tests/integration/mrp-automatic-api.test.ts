import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MrpLatestView, MrpRunAnswer } from "@cpg/core";
import { allPages, callApi, json, untilOk, type ApiResponse } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signInAs, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account, token and records: other files share the app, and users are never deleted.
const UNA = "mrpauto-una";
const UNA_PASSWORD = "mrpauto una's first password";
const ADMIN_TOKEN = "mrpauto-admin";

/** A day `days` after the server's UTC today, as the run plans from it. */
const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/*
 * E19-S03 through the bearer API (R07): an automatic run creates every executable proposal of the tenant in one
 * all-or-nothing batch, tagged with the run, and a replay answers the same run and documents. It creates documents
 * for every material of the tenant, other files' included, so it runs in Test, reset before and after (spec Q12).
 */
describe("Automatic MRP runs through the API", () => {
  let admin: Browser;
  let una: Browser;
  let adminSecret: string;
  let unaSecret: string;
  let customer: string;

  const api = (method: string, path: string, secret = adminSecret, options?: { key?: string; body?: unknown; generation?: number }) =>
    callApi(baseUrl, method, path, secret, options);
  const generation = async () => (json(await api("GET", "/api/tenants/test")).data as { generation: number }).generation;
  const created = async (path: string, body: unknown) => {
    const response = await api("POST", path, adminSecret, { key: randomUUID(), body, generation: await generation() });
    expect(response.status, response.text).toBe(200);
    return json(response).data as { id: string; version: number };
  };
  const resetTest = async () =>
    untilOk("reset Test", async () => api("POST", "/api/tenants/test/reset", adminSecret, { key: randomUUID(), body: {}, generation: await generation() }));
  const setReadOnly = (readOnly: boolean) => api("PATCH", "/api/tenants/prod", adminSecret, { key: randomUUID(), body: { readOnly } });
  /** Test's requisitions, read across every page (lesson 2026-11-02). */
  const requisitions = () =>
    allPages(async (page) => json(await api("GET", `/api/tenants/test/purchase-requisitions?page=${page}`)).data as { id: string; material: string; quantity: string; mrpRun: string | null }[]);
  const runIn = async (tenant: "test" | "prod", body: unknown, { secret = adminSecret, key = randomUUID() } = {}) =>
    api("POST", `/api/tenants/${tenant}/mrp/runs`, secret, { key, body, generation: tenant === "test" ? await generation() : undefined });
  const automatic = async (key = randomUUID()) => {
    const response = await runIn("test", { mode: "automatic" }, { key });
    expect(response.status, response.text).toBe(200);
    return json(response).data as MrpRunAnswer;
  };
  const proposalsOf = async (material: string, location: string) => {
    const response = await api("GET", `/api/tenants/test/mrp/runs/latest?material=${material}&location=${location}`);
    expect(response.status, response.text).toBe(200);
    return (json(response).data as MrpLatestView).plans[0]?.proposals ?? [];
  };
  const refusal = (response: ApiResponse) => json(response).error as { code: string };
  /** A Buy pair of its own in Test: a new material at a new location, no lot rule, and one order line per `[quantity, in days]`. */
  async function buyPair(name: string, lines: [string, number][]) {
    const material = (await created("/api/tenants/test/materials", { type: "raw", description: `mrpauto ${name}`, baseUnit: "kg" })).id;
    const location = (await created("/api/tenants/test/locations", { name: `mrpauto ${name} plant` })).id;
    await created("/api/tenants/test/planning-parameters", { material, location, procurement: "buy", leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" });
    const order = await created("/api/tenants/test/customer-orders", {
      customer, location, lines: lines.map(([quantity, days]) => ({ material, quantity, unit: "kg", requiredDate: day(days) })),
    });
    return { material, location, order };
  }

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, ADMIN_TOKEN);
    expect((await api("POST", "/api/users", adminSecret, { key: randomUUID(), body: { username: UNA, password: UNA_PASSWORD } })).status).toBe(200);
    await signInAs(una, baseUrl, UNA, UNA_PASSWORD);
    await openTokens(una, baseUrl);
    unaSecret = await createToken(una, "mrpauto-una-cli");
    // A fresh Test generation: this file's batches must not create documents other files' Test records rely on.
    await resetTest();
    customer = (await created("/api/tenants/test/customers", { name: "mrpauto retail" })).id;
  });
  afterAll(async () => {
    try {
      if (adminSecret) {
        expect((await setReadOnly(false)).status).toBe(200);
        // Removes every document this file's batches created, other files' Test materials' included (spec Q12).
        await resetTest();
        const own = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find(({ name }) => name === ADMIN_TOKEN)!;
        expect((await api("DELETE", `/api/tokens/${own.id}`, adminSecret, { key: randomUUID() })).status).toBe(200);
      }
    } finally {
      await Promise.all([admin, una].map((browser) => browser.close()));
    }
  });

  it("RUN-007, RUN-014, RUN-024, API-027: creates every own Buy proposal as a requisition tagged with the run; a replay with the key answers the same run and documents, and the same key with another body is refused", async () => {
    const sugar = await buyPair("sugar", [["100", 3]]);
    const salt = await buyPair("salt", [["40", 4], ["60", 6]]);
    const key = randomUUID();

    const first = await automatic(key);

    expect(first).toMatchObject({ mode: "automatic", creation: { status: "created" } });
    expect(first.creation).toEqual({ status: "created", documents: first.documents!.length });
    const own = [...(await proposalsOf(sugar.material, sugar.location)), ...(await proposalsOf(salt.material, salt.location))];
    expect(own.map(({ quantity }) => quantity)).toEqual(["100.000000", "40.000000", "60.000000"]);
    // Each own proposal names its own document, which the answer lists and which is an Open requisition tagged with the run.
    for (const proposal of own) {
      expect(first.documents).toContainEqual({ proposal: proposal.id, kind: "purchase-requisition", id: proposal.document });
      const requisition = json(await api("GET", `/api/tenants/test/purchase-requisitions/${proposal.document}`)).data;
      expect(requisition).toMatchObject({ quantity: proposal.quantity, requiredDate: proposal.needDate, status: "open", mrpRun: first.id });
    }
    const after = await requisitions();

    const replay = await runIn("test", { mode: "automatic" }, { key });
    expect(replay.status, replay.text).toBe(200);
    expect(replay.replayed).toBe("true");
    expect(json(replay).data).toEqual(JSON.parse(JSON.stringify(first)));
    expect(await requisitions()).toEqual(after);

    const reused = await runIn("test", {}, { key });
    expect([reused.status, refusal(reused).code]).toEqual([409, "IDEMPOTENCY_KEY_REUSED"]);
  });

  it("RUN-008: an automatic rerun on unchanged data creates nothing for needs the first run's documents cover", async () => {
    const flour = await buyPair("flour", [["25", 5]]);
    await automatic();
    const before = await requisitions();

    const rerun = await automatic();

    expect(rerun.creation).toEqual({ status: "created", documents: 0 });
    expect(await proposalsOf(flour.material, flour.location)).toEqual([]);
    expect(await requisitions()).toEqual(before);
  });

  it("RUN-019: two automatic runs requested at once, with different keys, leave one requisition per need", async () => {
    const oats = await buyPair("oats", [["30", 3]]);

    const answers = await Promise.all([automatic(), automatic()]);

    expect(answers.map(({ creation }) => creation?.status)).toEqual(["created", "created"]);
    const ofOats = (await requisitions()).filter(({ material }) => material === oats.material);
    expect(ofOats).toEqual([expect.objectContaining({ quantity: "30.000000" })]);
  });

  it("RUN-015, RUN-023: a candidate above what one document holds fails the batch: 200 with the cause and candidate, and nothing created", async () => {
    const rice = await buyPair("rice", [["20", 3]]);
    const bulk = await buyPair("bulk", [["999999999999", 4], ["999999999999", 4]]);
    try {
      const before = await requisitions();

      const failed = await automatic();

      expect(failed.creation).toMatchObject({
        status: "failed", code: "VALIDATION_FAILED", fieldErrors: { quantity: [expect.any(String)] },
        candidate: { kind: "purchase-requisition", material: bulk.material, location: bulk.location, needDate: day(4), quantity: "1999999999998.000000" },
      });
      expect(failed.documents).toEqual([]);
      expect(await requisitions()).toEqual(before);
      expect((await proposalsOf(rice.material, rice.location))[0]).toMatchObject({ quantity: "20.000000", document: null });
      // The run and its results stay readable, with the failure on the run.
      const latest = json(await api("GET", "/api/tenants/test/mrp/runs/latest")).data as MrpLatestView;
      expect(latest.run).toMatchObject({ id: failed.id, creation: failed.creation });
    } finally {
      // Every later automatic run in this file would fail on it (lesson 2026-10-25).
      const cancelled = await api("POST", `/api/tenants/test/customer-orders/${bulk.order.id}/cancel`, adminSecret, {
        key: randomUUID(), body: { version: bulk.order.version }, generation: await generation(),
      });
      expect(cancelled.status, cancelled.text).toBe(200);
    }
  });

  it("RUN-021: a read-only tenant refuses both modes to a user's and the admin's token, and keeps its earlier run", async () => {
    const earlier = await runIn("prod", {});
    expect(earlier.status, earlier.text).toBe(200);
    expect((await setReadOnly(true)).status).toBe(200);
    try {
      for (const secret of [unaSecret, adminSecret]) {
        for (const body of [{ mode: "automatic" }, {}]) {
          const refused = await runIn("prod", body, { secret });
          expect([refused.status, refusal(refused).code]).toEqual([409, "TENANT_READ_ONLY"]);
        }
      }
      const latest = json(await api("GET", "/api/tenants/prod/mrp/runs/latest")).data as MrpLatestView;
      expect(latest.run.id).toBe((json(earlier).data as MrpRunAnswer).id);
    } finally {
      expect((await setReadOnly(false)).status).toBe(200);
    }
  });

  it("refuses a mode the run doesn't take, storing nothing", async () => {
    const before = json(await api("GET", "/api/tenants/test/mrp/runs/latest")).data as MrpLatestView;

    const refused = await runIn("test", { mode: "auto" });

    expect([refused.status, refusal(refused).code]).toEqual([400, "VALIDATION_FAILED"]);
    expect((json(await api("GET", "/api/tenants/test/mrp/runs/latest")).data as MrpLatestView).run.id).toBe(before.run.id);
  });
});
