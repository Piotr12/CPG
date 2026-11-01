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
// that names it (RUN-004, RUN-005), and the requisition lists the run that created it.
describe("accepting an MRP proposal in the UI", () => {
  let admin: Browser;
  let ola: Browser;
  let secret: string;
  const ids: Record<"sugar" | "plant", string> = {} as never;

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
  /** Runs MRP and opens the page filtered to this file's pair, its proposals shown; again if the run and the page straddled midnight UTC. */
  async function runAndOpen(attempt = 1): Promise<MrpRunView> {
    const started = day(0);
    const run = json(await api("POST", "/api/tenants/prod/mrp/runs", {})).data as MrpRunView;
    await ola.open(`${baseUrl}/admin/prod/mrp?material=${ids.sugar}&location=${ids.plant}`);
    await ola.waitUntil(`Boolean(${shown("[data-mrp-proposals]")})`);
    if (day(0) === started) return run;
    expect(attempt, "a run crosses midnight UTC at most once").toBe(1);
    return runAndOpen(attempt + 1);
  }

  beforeAll(async () => {
    [admin, ola] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, SETUP_TOKEN);
    ids.sugar = await create("/api/tenants/prod/materials", { type: "finished", description: "mrpacc ui sugar", baseUnit: "kg" });
    ids.plant = await create("/api/tenants/prod/locations", { name: "mrpacc ui plant" });
    const customer = await create("/api/tenants/prod/customers", { name: "mrpacc ui retail" });
    // A Buy pair with no lot rule and an Open line of 50 kg four days out: one proposal of exactly 50 (RUN-005).
    await create("/api/tenants/prod/planning-parameters", { material: ids.sugar, location: ids.plant, procurement: "buy", leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" });
    await create("/api/tenants/prod/customer-orders", { customer, location: ids.plant, lines: [{ material: ids.sugar, quantity: "50", unit: "kg", requiredDate: day(4) }] });
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

  it("asks before creating, names the proposal, creates nothing on Cancel, then one requisition of 50 kg tagged with the run on confirm (RUN-004, RUN-005)", async () => {
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
  });
});
