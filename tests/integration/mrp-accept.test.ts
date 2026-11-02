import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MrpLatestView, MrpRunView } from "@cpg/core";
import { allPages, callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signedInAndHydrated, signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account, token and records: users are never deleted, and other files share the app.
const USERNAME = "mrpacc-ola";
const PASSWORD = "mrpacc ola's first password";
const SETUP_TOKEN = "mrpacc-ui-setup";

const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]") && e.offsetParent !== null)`;
const DIALOG = "[role=alertdialog][data-state=open]";
/** A day `days` after the server's UTC today, as the run plans from it. */
const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

// E19-S01 in a real browser: a normal user accepts a Buy proposal on the MRP page after a confirmation
// that names it (RUN-004, RUN-005), and the requisition lists the run that created it; a Make proposal
// becomes a production order the same way, named with its BOM revision and dates (#320).
describe("accepting an MRP proposal in the UI", () => {
  let admin: Browser;
  let ola: Browser;
  let secret: string;
  const ids: Record<"sugar" | "plant" | "customer", string> = {} as never;

  const api = (method: string, path: string, body?: unknown) => callApi(baseUrl, method, path, secret, body === undefined ? {} : { key: randomUUID(), body });
  const create = async (path: string, body: unknown) => {
    const response = await api("POST", path, body);
    expect(response.status, response.text).toBe(200);
    return json(response).data.id as string;
  };
  const requisitionsOf = async (material: string) =>
    (json(await api("GET", `/api/tenants/prod/purchase-requisitions?q=${material}`)).data as { id: string; material: string; quantity: string; mrpRun: string | null }[])
      .filter((requisition) => requisition.material === material);
  const purchaseOrders = () => allPages(async (page) => json(await api("GET", `/api/tenants/prod/purchase-orders?page=${page}`)).data as { id: string }[]);
  /** A Buy pair of its own with no lot rule and an Open line of 50 kg four days out: one proposal of exactly 50 (RUN-005). */
  async function buyPair() {
    ids.sugar = await create("/api/tenants/prod/materials", { type: "finished", description: "mrpacc ui sugar", baseUnit: "kg" });
    ids.plant = await create("/api/tenants/prod/locations", { name: "mrpacc ui plant" });
    await create("/api/tenants/prod/planning-parameters", { material: ids.sugar, location: ids.plant, procurement: "buy", leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" });
    await create("/api/tenants/prod/customer-orders", { customer: ids.customer, location: ids.plant, lines: [{ material: ids.sugar, quantity: "50", unit: "kg", requiredDate: day(4) }] });
  }
  /** Runs MRP and opens the page filtered to this file's pair, its proposals shown. */
  async function runAndOpen(material = ids.sugar): Promise<MrpRunView> {
    const run = json(await api("POST", "/api/tenants/prod/mrp/runs", {})).data as MrpRunView;
    await ola.open(`${baseUrl}/admin/prod/mrp?material=${material}&location=${ids.plant}`);
    await ola.waitUntil(`Boolean(${shown("[data-mrp-proposals]")})`);
    return run;
  }
  /**
   * Runs `scenario` once more, on a new pair, when the UTC day changed while it ran, whether it passed or failed:
   * a run from an earlier day can't be accepted (spec Q7).
   */
  async function withinOneDay(scenario: () => Promise<void>, attempt = 1): Promise<void> {
    const started = day(0);
    try {
      await buyPair();
      await scenario();
      if (day(0) === started) return;
    } catch (error) {
      if (day(0) === started) throw error;
    }
    expect(attempt, "a scenario crosses midnight UTC at most once").toBe(1);
    return withinOneDay(scenario, attempt + 1);
  }

  beforeAll(async () => {
    [admin, ola] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, SETUP_TOKEN);
    ids.customer = await create("/api/tenants/prod/customers", { name: "mrpacc ui retail" });
    await createUser(admin, baseUrl, USERNAME, PASSWORD);
    await signIn(ola, baseUrl, PASSWORD, USERNAME);
    await ola.waitUntil(signedInAndHydrated(USERNAME));
    await ola.setViewport(1280, 800);
  });
  afterAll(async () => {
    try {
      // Later files expect the admin to hold no tokens: revoke this file's with itself.
      const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find(({ name }) => name === SETUP_TOKEN)!;
      await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    } finally {
      await Promise.all([admin, ola].map((browser) => browser.close()));
    }
  });

  it("asks before creating, names the proposal, creates nothing on Cancel, then one requisition of 50 kg tagged with the run on confirm (RUN-004, RUN-005)", () => withinOneDay(async () => {
    const run = await runAndOpen();
    const ordersBefore = (await purchaseOrders()).length;
    expect(await ola.evaluate<string>(`${shown("[data-mrp-proposal-count]")}.textContent`)).toBe("1");
    expect(await ola.evaluate<string>(`${shown("[data-mrp-proposal-quantity]")}.textContent`)).toBe("50 kg");

    await ola.click(`[data-mrp-accept]`);
    await ola.waitUntil(`Boolean(document.querySelector(${JSON.stringify(DIALOG)}))`);
    expect(await ola.evaluate<string>(`document.querySelector(${JSON.stringify(DIALOG)}).textContent`)).toContain(
      `Purchase requisition for ${ids.sugar} — mrpacc ui sugar at ${ids.plant} — mrpacc ui plant: 50 kg, required by ${day(4)}. It records MRP run ${run.id}.`,
    );
    await ola.clickRole("button", "Cancel");
    await ola.waitUntil(`!document.querySelector(${JSON.stringify(DIALOG)})`);
    expect(await requisitionsOf(ids.sugar)).toEqual([]);

    await ola.click(`[data-mrp-accept]`);
    await ola.waitUntil(`Boolean(document.querySelector(${JSON.stringify(DIALOG)}))`);
    await ola.clickRole("button", "Create requisition");
    await ola.waitUntil(`Boolean(${shown("[data-mrp-document]")})`);

    const [requisition] = await requisitionsOf(ids.sugar);
    expect(requisition).toMatchObject({ quantity: "50.000000", mrpRun: run.id });
    expect(await ola.evaluate<string>(`${shown("[data-mrp-document]")}.textContent`)).toBe(`Purchase requisition ${requisition.id}`);
    expect(await ola.evaluate<boolean>(`!${shown("[data-mrp-accept]")}`)).toBe(true);
    const latest = json(await api("GET", `/api/tenants/prod/mrp/runs/latest?material=${ids.sugar}&location=${ids.plant}`)).data as MrpLatestView;
    expect(latest.plans[0].proposals[0].document).toBe(requisition.id);
    // A requisition only: no purchase order is issued (BUY-001, RUN-005), read across every page.
    expect((await purchaseOrders()).length).toBe(ordersBefore);

    // The requisition's row names the run it came from.
    await ola.click("[data-mrp-document]");
    await ola.waitUntil(`location.pathname.endsWith("/purchase-requisitions") && Boolean(${shown("[data-requisition-mrp-run]")})`);
    expect(await ola.evaluate<string>(`${shown("[data-requisition-mrp-run]")}.textContent`)).toBe(`MRP run ${run.id}`);
  }));

  it("asks before creating a production order, naming its BOM revision and dates, then creates it tagged with the run on confirm (RUN-006, #320)", () => withinOneDay(async () => {
    // A Make pair of its own at this file's plant: a BOM of one input with enough on hand, so the proposal is feasible.
    const jam = await create("/api/tenants/prod/materials", { type: "finished", description: "mrpacc ui jam", baseUnit: "kg" });
    const fruit = await create("/api/tenants/prod/materials", { type: "raw", description: "mrpacc ui fruit", baseUnit: "each" });
    const bom = await create("/api/tenants/prod/boms", { output: jam, priority: 1, validFrom: day(-30), validThrough: null, components: [{ material: fruit, quantity: "1", unit: "each" }] });
    await create("/api/tenants/prod/stock/corrections", { material: fruit, location: ids.plant, quantity: "12", unit: "each", reason: "mrpacc count" });
    await create("/api/tenants/prod/planning-parameters", { material: jam, location: ids.plant, procurement: "make", leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" });
    await create("/api/tenants/prod/customer-orders", { customer: ids.customer, location: ids.plant, lines: [{ material: jam, quantity: "12", unit: "kg", requiredDate: day(4) }] });
    const run = await runAndOpen(jam);

    await ola.click(`[data-mrp-accept]`);
    await ola.waitUntil(`Boolean(document.querySelector(${JSON.stringify(DIALOG)}))`);
    expect(await ola.evaluate<string>(`document.querySelector(${JSON.stringify(DIALOG)}).textContent`)).toContain(
      `Production order for ${jam} — mrpacc ui jam at ${ids.plant} — mrpacc ui plant: 12 kg through BOM ${bom} / revision 1, finishing by ${day(4)} and starting ${day(2)}. It records MRP run ${run.id}.`,
    );
    await ola.clickRole("button", "Create production order");
    await ola.waitUntil(`Boolean(${shown("[data-mrp-document]")})`);

    const orders = (json(await api("GET", `/api/tenants/prod/production-orders?q=${jam}`)).data as { id: string; output: string; bom: string; revision: number; mrpRun: string | null; plannedFinish: string }[])
      .filter(({ output }) => output === jam);
    expect(orders).toEqual([expect.objectContaining({ bom, revision: 1, plannedFinish: day(4), mrpRun: run.id })]);
    expect(await ola.evaluate<string>(`${shown("[data-mrp-document]")}.textContent`)).toBe(`Production order ${orders[0].id}`);

    // The order's row names the run it came from.
    await ola.click("[data-mrp-document]");
    await ola.waitUntil(`location.pathname.endsWith("/production-orders") && Boolean(${shown("[data-production-mrp-run]")})`);
    expect(await ola.evaluate<string>(`${shown("[data-production-mrp-run]")}.textContent`)).toBe(`MRP run ${run.id}`);
  }));

  it("marks a late proposal's planned finish under its need date, and accepts it on its need date (#279, MRP-037, spec Q3)", () => withinOneDay(async () => {
    // A 2-day lead time can't meet tomorrow: that proposal finishes the day after, a day late.
    await create("/api/tenants/prod/customer-orders", { customer: ids.customer, location: ids.plant, lines: [{ material: ids.sugar, quantity: "5", unit: "kg", requiredDate: day(1) }] });
    await runAndOpen();
    expect(await ola.evaluate<string[]>(`[...document.querySelectorAll("[data-mrp-proposals] [data-mrp-need-date]")].filter((el) => el.offsetParent).map((el) => el.textContent)`))
      .toEqual([day(1), day(4)]);
    // Since E18-S02 the note is the Late Supply warning badge, its finish in the reader's short date format.
    expect(await ola.evaluate<string>(`${shown("[data-mrp-timing=late-supply]")}.textContent`)).toMatch(/^Late Supply · 1 day · finish .+ · 5 kg$/);
    expect(await ola.evaluate<number>(`[...document.querySelectorAll("[data-mrp-timing]")].filter((el) => el.offsetParent).length`)).toBe(1);

    // The first Accept is the late proposal's, by need date.
    await ola.click(`[data-mrp-accept]`);
    await ola.waitUntil(`Boolean(document.querySelector(${JSON.stringify(DIALOG)}))`);
    expect(await ola.evaluate<string>(`document.querySelector(${JSON.stringify(DIALOG)}).textContent`)).toContain(`5 kg, required by ${day(1)}.`);
    await ola.clickRole("button", "Create requisition");
    await ola.waitUntil(`Boolean(${shown("[data-mrp-document]")})`);
    expect(await requisitionsOf(ids.sugar)).toEqual([expect.objectContaining({ quantity: "5.000000", requiredDate: day(1) })]);
  }));
});
