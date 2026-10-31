import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MrpLatestView, MrpRunView } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { choosePreference, closeAccountMenu, signedInAndHydrated, signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account, token and records: users are never deleted, and other files share the app.
const USERNAME = "mrprep-rita";
const PASSWORD = "mrprep rita's first password";
const SETUP_TOKEN = "mrprep-setup";

const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]"))`;
const PAIRS = "table[aria-label='Planned material–location pairs']";
const DAYS = "table[aria-label='Days of the plan']";
/** A day `days` after the server's UTC today, as the run plans from it. */
const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

// E18-S01 in a real browser: a normal user reads the latest MRP run's report on the MRP page, filters it
// to a pair and reads its days (MRP-005, MRP-008), in a read-only tenant too (TEN-018).
describe("the MRP report in the UI", () => {
  let admin: Browser;
  let rita: Browser;
  let secret: string;
  let run: MrpRunView;
  const ids: Record<"sheet" | "cabinet" | "plant", string> = {} as never;

  const api = (method: string, path: string, body?: unknown) => callApi(baseUrl, method, path, secret, body === undefined ? {} : { key: randomUUID(), body });
  const create = async (path: string, body: unknown) => {
    const response = await api("POST", path, body);
    expect(response.status, response.text).toBe(200);
    return json(response).data.id as string;
  };
  const runMrp = async () => json(await api("POST", "/api/tenants/prod/mrp/runs", {})).data as MrpRunView;
  const setReadOnly = (readOnly: boolean) => api("PATCH", "/api/tenants/prod", { readOnly });
  /** Opens the Prod MRP page at `query` and waits until `selector` is shown. */
  const open = async (query: string, selector = PAIRS) => {
    await rita.open(`${baseUrl}/admin/prod/mrp${query}`);
    await rita.waitUntil(`Boolean(${shown(selector)})`);
  };
  /** The day table's figures on `date`, keyed by figure. */
  const figures = (date: string) =>
    rita.evaluate<Record<string, string>>(`(() => {
      const row = [...${shown(DAYS)}.querySelectorAll("tbody tr")].find((tr) => tr.querySelector("[data-mrp-date]")?.textContent === ${JSON.stringify(date)});
      return Object.fromEntries([...row.querySelectorAll("[data-mrp-figure]")].map((cell) => [cell.getAttribute("data-mrp-figure"), cell.textContent]));
    })()`);

  beforeAll(async () => {
    [admin, rita] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, SETUP_TOKEN);
    ids.sheet = await create("/api/tenants/prod/materials", { type: "raw", description: "mrprep sheet", baseUnit: "kg" });
    ids.cabinet = await create("/api/tenants/prod/materials", { type: "finished", description: "mrprep cabinet", baseUnit: "each" });
    ids.plant = await create("/api/tenants/prod/locations", { name: "mrprep plant" });
    const customer = await create("/api/tenants/prod/customers", { name: "mrprep retail" });
    // MRP-005: physical 50, Open lines of 10 and 15 two days apart. MRP-008: physical 5, an Open line of 20.
    await create("/api/tenants/prod/stock/corrections", { material: ids.sheet, location: ids.plant, quantity: "50", unit: "kg", reason: "mrprep count" });
    await create("/api/tenants/prod/stock/corrections", { material: ids.cabinet, location: ids.plant, quantity: "5", unit: "each", reason: "mrprep count" });
    await create("/api/tenants/prod/customer-orders", {
      customer,
      location: ids.plant,
      lines: [
        { material: ids.sheet, quantity: "10", unit: "kg", requiredDate: day(4) },
        { material: ids.sheet, quantity: "15", unit: "kg", requiredDate: day(6) },
        { material: ids.cabinet, quantity: "20", unit: "each", requiredDate: day(3) },
      ],
    });
    run = await runMrp();
    await createUser(admin, baseUrl, USERNAME, PASSWORD);
    await signIn(rita, baseUrl, PASSWORD, USERNAME);
    await rita.waitUntil(signedInAndHydrated(USERNAME));
    await rita.setViewport(1280, 800);
  });
  afterAll(async () => {
    try {
      // Later files write to Prod, and expect the admin to hold no tokens: revoke this file's with itself.
      expect((await setReadOnly(false)).status).toBe(200);
      const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find(({ name }) => name === SETUP_TOKEN)!;
      await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    } finally {
      await Promise.all([admin, rita].map((browser) => browser.close()));
    }
  });

  it("shows a pair's days apart, each with its own demand and balance, filtered to the pair (MRP-005)", async () => {
    await open(`?material=${ids.sheet}&location=${ids.plant}`, DAYS);

    expect(await rita.evaluate<string>(`${shown("main h3")}.textContent`)).toBe(`${ids.sheet} mrprep sheet at ${ids.plant} mrprep plant`);
    expect(await rita.evaluate<number>(`${shown(DAYS)}.querySelectorAll("tbody tr").length`)).toBe(90);
    expect(await figures(day(4))).toMatchObject({ firmDemand: "10", projectedBefore: "40", projectedAfter: "40", shortage: "0" });
    expect(await figures(day(5))).toMatchObject({ firmDemand: "0", projectedBefore: "40" });
    expect(await figures(day(6))).toMatchObject({ firmDemand: "15", projectedBefore: "25", shortage: "0" });
    expect(await rita.evaluate<string>(`${shown("[data-mrp-field=id]")}.textContent`)).toBe(run.id);
  });

  it("shows a negative projected balance as a shortage while the stock itself stays 5 (MRP-008, INV-008)", async () => {
    await open(`?material=${ids.cabinet}&location=${ids.plant}`, DAYS);

    expect(await figures(day(3))).toMatchObject({ firmDemand: "20", projectedBefore: "-15", shortage: "15" });
    expect(await rita.evaluate<string>(`${shown("[data-mrp-first-shortage]")}.textContent`)).toBe(day(3));
    const stock = json(await api("GET", `/api/tenants/prod/reports/stock?material=${ids.cabinet}&location=${ids.plant}`)).data;
    expect(stock.rows.map((row: { quantity: string }) => row.quantity)).toEqual(["5.000000"]);
  });

  it("covers every planned pair unfiltered, 25 a page, and opens a pair's days from the list", async () => {
    const latest = json(await api("GET", "/api/tenants/prod/mrp/runs/latest")).data as MrpLatestView;
    await open("");
    expect(await rita.evaluate<string>(`${shown("[data-mrp-pair-count]")}.textContent`)).toBe(`Planned pairs: ${latest.total}`);
    expect(latest.total).toBe(latest.run.pairs);
    expect(await rita.evaluate<boolean>(`Boolean(${shown(DAYS)})`)).toBe(latest.total === 1);

    // This file's materials are the newest, so its pairs sort last: the page past the end shows the last page
    // (lesson 2026-10-24, "Paging by ascending ID moves the row a test just created off the first page").
    await open("?page=1000000");
    await rita.clickRole("link", `Days of ${ids.sheet} mrprep sheet at ${ids.plant} mrprep plant`);
    await rita.waitUntil(`location.search === "?material=${ids.sheet}&location=${ids.plant}" && Boolean(${shown(DAYS)})`);
    expect(await figures(day(4))).toMatchObject({ firmDemand: "10", projectedBefore: "40" });
  });

  it("is the not-found state for a material or location this tenant doesn't have", async () => {
    for (const query of ["?material=99999999", "?location=99999999"]) {
      await rita.open(`${baseUrl}/admin/prod/mrp${query}`);
      await rita.waitForText("Page not found.");
    }
    expect(await rita.evaluate<boolean>(`Boolean(${shown(PAIRS)})`)).toBe(false);
  });

  it("shows a later run in place of the earlier one (PRD §04, until superseded)", async () => {
    await open(`?material=${ids.sheet}&location=${ids.plant}`, DAYS);
    expect(await rita.evaluate<string>(`${shown("[data-mrp-field=id]")}.textContent`)).toBe(run.id);

    const next = await runMrp();
    await open(`?material=${ids.sheet}&location=${ids.plant}`, DAYS);

    expect(next.id).not.toBe(run.id);
    expect(await rita.evaluate<string>(`${shown("[data-mrp-field=id]")}.textContent`)).toBe(next.id);
    expect(await figures(day(6))).toMatchObject({ firmDemand: "15", projectedBefore: "25" });
  });

  it("stays readable to a normal user while the tenant is read-only (TEN-018)", async () => {
    expect((await setReadOnly(true)).status).toBe(200);
    try {
      await open(`?material=${ids.sheet}&location=${ids.plant}`, DAYS);
      expect(await figures(day(4))).toMatchObject({ firmDemand: "10", projectedBefore: "40" });
      expect(await rita.evaluate<boolean>(`Boolean(${shown("main button[data-mrp-run]")})`)).toBe(false);
    } finally {
      expect((await setReadOnly(false)).status).toBe(200);
    }
  });

  it("keeps the page itself from scrolling sideways at 1280 and 390 px; the day table scrolls in its own region", async () => {
    try {
      for (const [width, height] of [[1280, 800], [390, 844]]) {
        await rita.setViewport(width, height);
        await open(`?material=${ids.sheet}&location=${ids.plant}`, DAYS);
        expect(await rita.evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth`), `${width} px`).toBe(true);
        expect(await rita.evaluate<number>(`${shown(DAYS)}.querySelectorAll("thead th").length`)).toBe(9);
      }
    } finally {
      await rita.setViewport(1280, 800);
    }
  });

  it("explains every column in the help, found by “MRP” in English and by “MRP” and “planowanie” in Polish (D03)", async () => {
    await rita.open(`${baseUrl}/help?q=MRP`);
    await rita.waitFor("section#mrp");
    const english = await rita.text("section#mrp");
    for (const words of ["firm demand", "forecast demand", "safety stock", "tentative supply", "dependable supply", "before and after", "shortage", "a projected balance of 40"]) {
      expect(english).toContain(words);
    }

    await rita.open(`${baseUrl}/admin`);
    await rita.waitUntil(signedInAndHydrated(USERNAME));
    await choosePreference(rita, "pl");
    await closeAccountMenu(rita);
    for (const query of ["MRP", "planowanie"]) {
      await rita.open(`${baseUrl}/help?q=${query}`);
      await rita.waitFor("section#mrp");
      expect(await rita.text("section#mrp h2")).toBe("Planowanie MRP");
    }
    expect(await rita.text("section#mrp")).toContain("popyt pewny");
  });
});
