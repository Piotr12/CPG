import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { TransferView } from "@cpg/core";
import { callApi, json } from "./api";
import { chooseFromList, clickHydrated, openBrowser, type Browser } from "./browser";
import { signedInAndHydrated, signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account and records: users are never deleted, and other files share the app.
const USERNAME = "srui-una";
const PASSWORD = "srui una's first password";
const SETUP_TOKEN = "srui-setup";

/** True once `element` is hydrated, shown, and outside Next.js's hidden staging container. */
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]"))`;
const report = `table[aria-label='Current stock']`;

/** The rows of the shown table named `name`, as their cells' text. */
const tableRows = (browser: Browser, name: string) =>
  browser.evaluate<string[][]>(`(() => {
    const table = [...document.querySelectorAll("main table")].find((t) => t.getAttribute("aria-label") === ${JSON.stringify(name)} && !t.closest("[hidden]"));
    return [...table.querySelectorAll("tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")));
  })()`);

// E13-S01: a normal user reads the current stock report, filters it and drills into a pair's ledger, in a real browser.
describe("the stock report in the UI", () => {
  let admin: Browser;
  let una: Browser;
  let secret: string;
  let transfer: string;
  const ids: Record<"steel" | "bolt" | "plant" | "depot", string> = {} as never;

  const api = (method: string, path: string, body?: unknown) => callApi(baseUrl, method, path, secret, body === undefined ? {} : { key: randomUUID(), body });
  const create = async (path: string, body: unknown) => json(await api("POST", path, body)).data.id as string;
  const correct = (material: string, location: string, quantity: string, unit: string) =>
    api("POST", "/api/tenants/prod/stock/corrections", { material, location, quantity, unit, reason: "srui count" });
  /** Opens the report at `query` and waits for its table to be shown. */
  const open = async (query: string) => {
    await una.open(`${baseUrl}/admin/prod/reports/stock${query}`);
    await una.waitUntil(shown(report));
  };
  const rows = async () => (await tableRows(una, "Current stock")).map((row) => row.slice(0, 5));

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, SETUP_TOKEN);
    ids.steel = await create("/api/tenants/prod/materials", { type: "raw", description: "srui steel", baseUnit: "kg" });
    ids.bolt = await create("/api/tenants/prod/materials", { type: "raw", description: "srui bolt", baseUnit: "each" });
    ids.plant = await create("/api/tenants/prod/locations", { name: "srui plant" });
    ids.depot = await create("/api/tenants/prod/locations", { name: "srui depot" });
    await correct(ids.steel, ids.plant, "100", "kg");
    await correct(ids.bolt, ids.depot, "3", "each");
    await correct(ids.bolt, ids.depot, "-3", "each");
    const planned = await api("POST", "/api/tenants/prod/transfers", {
      material: ids.steel, source: ids.plant, destination: ids.depot, quantity: "50", unit: "kg", plannedDispatch: "2026-10-19", plannedArrival: "2026-10-22",
    });
    transfer = (json(planned).data as TransferView).id;
    await api("POST", `/api/tenants/prod/transfers/${transfer}/dispatches`, { quantity: "30", unit: "kg" });
    await createUser(admin, baseUrl, USERNAME, PASSWORD);
    await signIn(una, baseUrl, PASSWORD, USERNAME);
    await una.waitUntil(signedInAndHydrated(USERNAME));
    await una.setViewport(1280, 800);
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find(({ name }) => name === SETUP_TOKEN)!;
    await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    await Promise.all([admin, una].map((browser) => browser.close()));
  });

  it("shows on hand and in transit out and in apart for a dispatched, unreceived transfer (UX-017, INV-009)", async () => {
    await open(`?material=${ids.steel}`);

    expect(await rows()).toEqual([
      [`${ids.steel} — srui steel`, `${ids.plant} — srui plant`, "70 kg", "30 kg", "0 kg"],
      [`${ids.steel} — srui steel`, `${ids.depot} — srui depot`, "0 kg", "0 kg", "30 kg"],
    ]);
    expect(await una.text("main h1")).toBe("Stock report — Prod");

    // On a phone the figures stack in one cell; the table scrolls sideways in its own region (the material
    // column sticky) while the page never does, and each row's Ledger button, scrolled to, is in view.
    await una.setViewport(390, 844);
    try {
      await open(`?material=${ids.steel}`);
      expect(await una.evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth`)).toBe(true);
      const rightEdges = await una.evaluate<number[]>(`[...${shown(report)}.querySelectorAll("tbody a")].map((a) => {
        a.scrollIntoView({ block: "nearest", inline: "nearest" });
        const box = a.closest("[data-slot=table-container]");
        const sticky = a.closest("tr").querySelector("td").getBoundingClientRect().right;
        return a.getBoundingClientRect().left >= sticky - 0.5 && box.tabIndex === 0 ? a.getBoundingClientRect().right : Infinity;
      })`);
      expect(rightEdges).toHaveLength(2);
      for (const right of rightEdges) expect(right).toBeLessThanOrEqual(390);
      expect(await una.evaluate<string>(`${shown(report)}.querySelector("tbody dl").innerText.replace(/\\s+/g, " ").trim()`)).toBe("On hand 70 kg In transit out 30 kg In transit in 0 kg");
    } finally {
      await una.setViewport(1280, 800);
    }
  });

  it("narrows by location with the filter form, and shows all-zero rows only with the toggle", async () => {
    await open("");
    await una.waitUntil(ready(shown("#report-zero")));
    // The filter is an autocomplete once hydrated (#222); before that, the same id is the server's select.
    await chooseFromList(una, "#report-location[role=combobox]", "srui depot", ids.depot);
    await una.click("main form button[type=submit]");
    await una.waitUntil(`location.search.includes("location=${ids.depot}")`);
    await una.waitUntil(shown(report));
    expect(await rows()).toEqual([[`${ids.steel} — srui steel`, `${ids.depot} — srui depot`, "0 kg", "0 kg", "30 kg"]]);

    await una.waitUntil(ready(shown("#report-zero")));
    await una.click("#report-zero");
    await una.waitUntil(`${shown("#report-zero")}.getAttribute("aria-checked") === "true"`);
    await una.click("main form button[type=submit]");
    await una.waitUntil(`location.search.includes("includeZero=true")`);
    await una.waitUntil(`${shown(report)}?.textContent.includes("srui bolt")`);
    expect(await rows()).toEqual([
      [`${ids.steel} — srui steel`, `${ids.depot} — srui depot`, "0 kg", "0 kg", "30 kg"],
      [`${ids.bolt} — srui bolt`, `${ids.depot} — srui depot`, "0 each", "0 each", "0 each"],
    ]);
  });

  it("opens a row's ledger, where each movement links its source document (INV-012)", async () => {
    await open(`?material=${ids.steel}&location=${ids.plant}`);
    await una.clickRole("link", `Ledger of ${ids.steel} srui steel at ${ids.plant} srui plant`);
    await una.waitUntil(`location.pathname === "/admin/prod/stock"`);
    await una.waitUntil(`${shown("[data-stock-balance]")}?.textContent === "70 kg"`);

    const ledger = (await tableRows(una, "Stock movements")).map(([, type, movement, source]) => [type, movement, source]);
    expect(ledger).toEqual([
      ["Transfer dispatch", "-30 kg", `Transfer ${transfer}`],
      ["Correction", "+100 kg", "This correction"],
    ]);
    await una.clickRole("link", `Transfer ${transfer}`);
    await una.waitUntil(`location.pathname === "/admin/prod/transfers/${transfer}"`);
  });

  it("shows a Test pair's history newest first, each receipt and completion linking its document (INV-012)", async () => {
    const pair = "material=00000007&location=00000001";
    const ledger = async () => (await tableRows(una, "Stock movements")).map(([date, type, , source, reason]) => ({ date, type, source, reason }));
    const newestFirst = (rows: { date: string }[]) => rows.every(({ date }, index) => index === 0 || rows[index - 1].date >= date);

    // Steel sheet 1.0 mm at the main plant: weekly receipts and the week's completions, over the tiny dataset's two months.
    // The realistic two years, and paging a ledger, are test-reset-realistic.test.ts's.
    await una.open(`${baseUrl}/admin/test/stock?${pair}`);
    await una.waitUntil(shown("table[aria-label='Stock movements']"));
    const rows = await ledger();
    expect(newestFirst(rows)).toBe(true);
    const receipts = rows.filter(({ type }) => type === "Goods receipt");
    const completions = rows.filter(({ type }) => type === "Production completion");
    expect(receipts.length).toBeGreaterThan(0);
    expect(completions.length).toBeGreaterThan(2);
    for (const { source } of receipts) expect(source).toMatch(/^Purchase order \d{8} Goods receipt \S+$/);
    for (const { source } of completions) expect(source).toMatch(/^Production order \d{8} Production completion \S+$/);

    // A receipt's link opens the purchase order it was received against.
    const order = receipts[0].source.split(" ")[2];
    await clickHydrated(una, `table[aria-label='Stock movements'] a[href='/admin/test/purchase-orders/${order}']`);
    await una.waitUntil(`location.pathname === "/admin/test/purchase-orders/${order}"`);
  });

  it("is linked from the Stock page, and still opens while the tenant is read-only (TEN-018)", async () => {
    expect((await callApi(baseUrl, "PATCH", "/api/tenants/prod", secret, { key: randomUUID(), body: { readOnly: true } })).status).toBe(200);
    try {
      await una.open(`${baseUrl}/admin/prod/stock?material=${ids.steel}&location=${ids.plant}`);
      await una.waitUntil(ready(shown("a[href='/admin/prod/reports/stock']")));
      await una.click("main a[href='/admin/prod/reports/stock']");
      await una.waitUntil(`location.pathname === "/admin/prod/reports/stock"`);
      await una.waitUntil(`${shown(report)}?.textContent.includes("srui steel")`);
      await una.waitForText("Prod is read-only");
    } finally {
      expect((await callApi(baseUrl, "PATCH", "/api/tenants/prod", secret, { key: randomUUID(), body: { readOnly: false } })).status).toBe(200);
    }
  });
});
