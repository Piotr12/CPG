import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { AuditEntryView, MrpLatestView, MrpPlanView, MrpProposalView, MrpRunView } from "@cpg/core";
import { allPages, callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own token and records: other files share the app.
const ADMIN_TOKEN = "mrprerun-admin";
const DOCUMENT_LISTS = ["purchase-requisitions", "purchase-orders", "production-orders"] as const;

const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]") && e.offsetParent !== null)`;
/** A day `days` after the server's UTC today, as the run plans from it. */
const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
/** Runs `scenario` once more when the UTC day changed while it ran: a run from an earlier day can't be accepted, and every date moves. */
async function withinOneDay<T>(scenario: () => Promise<T>, attempt = 1): Promise<T> {
  const started = day(0);
  try {
    const result = await scenario();
    if (day(0) === started) return result;
  } catch (error) {
    if (day(0) === started) throw error;
  }
  expect(attempt, "a scenario crosses midnight UTC at most once").toBe(1);
  return withinOneDay(scenario, attempt + 1);
}

// E19-S02: a rerun recalculates from scratch. It never duplicates an accepted document, adds only the new
// need when demand grows, shows excess without cancelling anything when demand falls, and never edits a
// document (RUN-008 … RUN-013, RUN-020, R10). Manual reruns: the automatic half is E19-S03 (#289).
describe("rerunning MRP", () => {
  let admin: Browser;
  let secret: string;
  let customer: string;
  let supplier: string;
  let named = 0;

  const api = (method: string, path: string, body?: unknown) => callApi(baseUrl, method, path, secret, body === undefined ? {} : { key: randomUUID(), body });
  const create = async <T = { id: string; version: number }>(path: string, body: unknown): Promise<T> => {
    const response = await api("POST", `/api/tenants/prod/${path}`, body);
    expect(response.status, response.text).toBe(200);
    return json(response).data as T;
  };
  const get = async <T>(path: string): Promise<T> => json(await api("GET", `/api/tenants/prod/${path}`)).data as T;
  const run = () => create<MrpRunView>("mrp/runs", {});
  const planOf = async (material: string, location: string) => {
    const { run: latest, plans } = await get<MrpLatestView>(`mrp/runs/latest?material=${material}&location=${location}`);
    return { run: latest, plan: plans[0] as MrpPlanView };
  };
  const shape = (proposals: readonly MrpProposalView[]) => proposals.map(({ kind, needDate, quantity }) => ({ kind, needDate, quantity }));
  const all = (kind: string) => allPages(async (page) => get<{ id: string }[]>(`${kind}?page=${page}`));
  const counts = async () => Object.fromEntries(await Promise.all(DOCUMENT_LISTS.map(async (kind) => [kind, (await all(kind)).length])));
  const accept = (runId: string, proposal: string) => create<{ document: { id: string; version: number } }>(`mrp/runs/${runId}/proposals/${proposal}/accept`, {});

  /** A material and location of this file's own, with a set at the location. */
  async function pair(procurement: "buy" | "make", lotMultiple = "0.000001") {
    const name = `mrprerun ${++named}`;
    const material = (await create("materials", { type: "finished", description: name, baseUnit: "each" })).id;
    const location = (await create("locations", { name: `${name} plant` })).id;
    await create("planning-parameters", { material, location, procurement, leadTimeDays: 2, minimumQuantity: "0", lotMultiple });
    return { material, location };
  }
  /** A Make pair whose BOM needs 1 of a raw material stocked for 500, so every Make proposal of it is feasible (spec Q7). */
  async function makePair(lotMultiple?: string) {
    const made = await pair("make", lotMultiple);
    const component = (await create("materials", { type: "raw", description: `mrprerun input ${named}`, baseUnit: "each" })).id;
    await create("planning-parameters", { material: component, location: made.location, procurement: "buy", leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "0.000001" });
    await create("boms", { output: made.material, priority: 1, validFrom: "2026-01-01", validThrough: null, components: [{ material: component, quantity: "1", unit: "each" }] });
    await create("stock/corrections", { material: component, location: made.location, quantity: "500", unit: "each", reason: "mrprerun count" });
    return made;
  }
  /** An Open production order of 100 finishing in ten days, as the production dialog creates it (spec Q6). */
  const produce = (output: string, location: string) =>
    create<{ id: string; version: number }>("production-orders", { output, location, quantity: "100", unit: "each", plannedFinish: day(10) });
  const order = (material: string, location: string, quantity: string, days: number) =>
    create("customer-orders", { customer, location, lines: [{ material, quantity, unit: "each", requiredDate: day(days) }] });
  const productionOrder = async (id: string) => {
    const { quantity, plannedStart, plannedFinish, status, version } = await get<{ quantity: string; plannedStart: string; plannedFinish: string; status: string; version: number }>(`production-orders/${id}`);
    return { quantity, plannedStart, plannedFinish, status, version };
  };
  /** Opens the MRP page filtered to one pair, once its report has rendered. */
  async function openPair(material: string, location: string) {
    await admin.open(`${baseUrl}/admin/prod/mrp?material=${material}&location=${location}`);
    await admin.waitUntil(`Boolean(${shown("[data-mrp-plan-heading]")})`);
  }

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, ADMIN_TOKEN);
    await admin.setViewport(1280, 800);
    customer = (await create("customers", { name: "mrprerun retail" })).id;
    supplier = (await create("suppliers", { name: "mrprerun mill" })).id;
  });
  afterAll(async () => {
    try {
      // Later files expect the admin to hold no tokens: revoke this file's with itself.
      const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find(({ name }) => name === ADMIN_TOKEN)!;
      await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    } finally {
      await admin.close();
    }
  });

  it("RUN-008, RUN-012: a requisition accepted from run 1 stays Open and tagged with run 1, and run 2 nets it: no new proposal, no new requisition", () => withinOneDay(async () => {
    const { material, location } = await pair("buy");
    await order(material, location, "100", 5);
    const first = await run();
    const [proposal] = (await planOf(material, location)).plan.proposals;
    expect(proposal).toMatchObject({ kind: "purchase-requisition", quantity: "100.000000" });
    const { document } = await accept(first.id, proposal.id);
    const before = await counts();

    const second = await run();

    const { run: latest, plan } = await planOf(material, location);
    expect(latest.id).toBe(second.id);
    expect(plan.proposals).toEqual([]);
    expect(plan.excess).toBe("0.000000");
    expect(await counts()).toEqual(before);
    expect(await get(`purchase-requisitions/${document.id}`)).toMatchObject({ status: "open", quantity: "100.000000", mrpRun: first.id, version: document.version });

    // On screen: Purchase requisitions names run 1 under the requisition's ID (RUN-012), which a new row sits on the last page of.
    await admin.open(`${baseUrl}/admin/prod/purchase-requisitions?page=1000000`);
    const row = `[...document.querySelectorAll("main tbody tr")].find((tr) => !tr.closest("[hidden]") && tr.textContent.includes(${JSON.stringify(document.id)}))`;
    await admin.waitUntil(`Boolean(${row}?.querySelector("[data-requisition-mrp-run]"))`);
    expect(await admin.evaluate<string>(`${row}.querySelector("[data-requisition-mrp-run]").textContent`)).toBe(`MRP run ${first.id}`);
  }));

  it("RUN-011: run 2 replaces run 1's unaccepted proposals with its own, under its own ID and time, and run 1's is refused as stale, creating nothing", () => withinOneDay(async () => {
    const { material, location } = await pair("buy");
    await order(material, location, "30", 5);
    const first = await run();
    const [old] = (await planOf(material, location)).plan.proposals;

    const second = await run();

    const { run: latest, plan } = await planOf(material, location);
    expect(latest).toMatchObject({ id: second.id, createdAt: second.createdAt });
    expect(second.id > first.id).toBe(true);
    expect(shape(plan.proposals)).toEqual(shape([old]));
    expect(plan.proposals[0].id).not.toBe(old.id);
    const before = await counts();
    const refused = await api("POST", `/api/tenants/prod/mrp/runs/${first.id}/proposals/${old.id}/accept`, {});
    expect(refused.status, refused.text).toBe(409);
    expect(json(refused).error.code).toBe("MRP_PROPOSAL_STALE");
    expect(await counts()).toEqual(before);

    // On screen: the page shows run 2's ID and time.
    await openPair(material, location);
    expect(await admin.evaluate<string>(`${shown("main [data-mrp-field=id]")}.textContent`)).toBe(second.id);
    expect(await admin.evaluate<string>(`${shown("main [data-mrp-field=time]")}.textContent`)).toBe(`${String(second.createdAt).slice(0, 16).replace("T", " ")} UTC`);
  }));

  it("RUN-009: an Open production order of 100 against demand now 120 gets exactly one Make proposal of 20.000000, or 25.000000 with lot multiple 25, and still reads 100", () => withinOneDay(async () => {
    const exact = await makePair();
    const lotted = await makePair("25");
    const orders = [];
    for (const made of [exact, lotted]) {
      orders.push(await produce(made.material, made.location));
      await order(made.material, made.location, "120", 20);
    }
    await run();

    expect(shape((await planOf(exact.material, exact.location)).plan.proposals)).toEqual([{ kind: "production-order", needDate: day(20), quantity: "20.000000" }]);
    const rounded = (await planOf(lotted.material, lotted.location)).plan;
    expect(shape(rounded.proposals)).toEqual([{ kind: "production-order", needDate: day(20), quantity: "25.000000" }]);
    expect(rounded.provisional).toEqual([]);
    for (const made of orders) expect(await productionOrder(made.id)).toMatchObject({ quantity: "100.000000", status: "open", version: made.version });

    await openPair(exact.material, exact.location);
    expect(await admin.evaluate<string>(`${shown("[data-mrp-proposal-quantity]")}.textContent`)).toBe("20 each");
  }));

  it("RUN-010: an Open production order of 100 against demand now 80 keeps its quantity, dates, status and version, gets no proposal, and the plan shows an excess of 20", () => withinOneDay(async () => {
    const { material, location } = await makePair();
    const made = await produce(material, location);
    await order(material, location, "80", 20);
    const before = await productionOrder(made.id);

    await run();
    await run();

    const { plan } = await planOf(material, location);
    expect(plan.proposals).toEqual([]);
    expect(plan.excess).toBe("20.000000");
    expect(await productionOrder(made.id)).toEqual(before);

    await openPair(material, location);
    await admin.waitUntil(`Boolean(${shown("[data-mrp-excess]")})`);
    expect(await admin.evaluate<string>(`${shown("[data-mrp-excess]")}.textContent`)).toBe(
      "Excess: 20 each of open supply that the demand and safety stock of the next 90 days don't need. MRP never cancels, reduces or moves a document.",
    );
  }));

  // Prod's lists stay short here, since other files read their first page; test-reset-realistic.test.ts walks lists of many pages (lesson 2026-10-22).
  it("RUN-013, R10: new demand wanting more and earlier leaves an Open purchase-order line and production order as they were, and every document as it was, and audits only the run", () => withinOneDay(async () => {
    const made = await makePair();
    const productionOrderId = (await produce(made.material, made.location)).id;
    const bought = await pair("buy");
    const po = await create<{ id: string }>("purchase-orders", { supplier, location: bought.location, lines: [{ material: bought.material, quantity: "40", unit: "each", plannedDate: day(12) }] });
    await run();
    // More, and earlier, than either document brings.
    await order(made.material, made.location, "130", 8);
    await order(bought.material, bought.location, "70", 6);
    const snapshot = async () => Object.fromEntries(await Promise.all(DOCUMENT_LISTS.map(async (kind) => [kind, await all(kind)])));
    const before = await snapshot();
    const [orderBefore, poBefore] = [await productionOrder(productionOrderId), await get(`purchase-orders/${po.id}`)];
    const seen = new Set((await get<{ entries: AuditEntryView[] }>("audit?limit=100")).entries.map(({ id }) => id));

    const rerun = await run();

    const after = await snapshot();
    expect(after).toEqual(before);
    expect(await productionOrder(productionOrderId)).toEqual(orderBefore);
    expect(await get(`purchase-orders/${po.id}`)).toEqual(poBefore);
    expect(shape((await planOf(made.material, made.location)).plan.proposals)).toEqual([{ kind: "production-order", needDate: day(8), quantity: "130.000000" }]);
    expect(shape((await planOf(bought.material, bought.location)).plan.proposals)).toEqual([{ kind: "purchase-requisition", needDate: day(6), quantity: "70.000000" }]);
    const added = (await get<{ entries: AuditEntryView[] }>("audit?limit=100")).entries.filter(({ id }) => !seen.has(id));
    expect(added.map(({ action, subject }) => ({ action, subject }))).toEqual([{ action: "mrp.mrp-run.created", subject: { type: "MrpRun", id: rerun.id, label: rerun.id } }]);
  }));

  it("RUN-020: a cancelled requisition of 100 doesn't count as supply, so the rerun proposes a new requisition of 100", () => withinOneDay(async () => {
    const { material, location } = await pair("buy");
    await order(material, location, "100", 5);
    const requisition = await create("purchase-requisitions", { material, location, quantity: "100", unit: "each", requiredDate: day(5) });
    await run();
    expect((await planOf(material, location)).plan.proposals).toEqual([]);
    await create(`purchase-requisitions/${requisition.id}/cancel`, { version: requisition.version });

    await run();

    expect(shape((await planOf(material, location)).plan.proposals)).toEqual([{ kind: "purchase-requisition", needDate: day(5), quantity: "100.000000" }]);
    await openPair(material, location);
    expect(await admin.evaluate<string>(`${shown("[data-mrp-proposal-quantity]")}.textContent`)).toBe("100 each");
  }));

  it("gives identical proposals, in the same order, from two reruns over unchanged data, apart from their new IDs (spec Q8)", () => withinOneDay(async () => {
    const made = await makePair();
    await produce(made.material, made.location);
    await order(made.material, made.location, "120", 20);
    const bought = await pair("buy");
    await order(bought.material, bought.location, "7", 3);
    await order(bought.material, bought.location, "9", 9);
    const proposals = async () => {
      const plans = await Promise.all([made, bought].map(async ({ material, location }) => (await planOf(material, location)).plan));
      return plans.flatMap((plan) => plan.proposals);
    };
    await run();
    const first = await proposals();

    await run();

    const second = await proposals();
    const withoutIds = (list: MrpProposalView[]) => list.map((proposal) => ({ ...proposal, id: undefined }));
    expect(first).toHaveLength(3);
    expect(withoutIds(second)).toEqual(withoutIds(first));
    expect(second.map(({ id }) => id).filter((id) => first.some((earlier) => earlier.id === id))).toEqual([]);
  }));
});
