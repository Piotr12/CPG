import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clickHydrated, openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const FILTERS = "main form[aria-label=Filters]";
const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]") && e.offsetParent)`;

// The Demand review screen (#240) on the tiny Test dataset the server starts with: its ten finished
// products all have SU factors (#239). It writes nothing, so this file creates no records; the
// figures themselves are asserted by `demand-review-api.test.ts` on its own documents.
describe("the demand review in the UI", () => {
  let admin: Browser;
  /** Two finished products the grid lists, by ID. */
  let products: string[];

  const open = async (query = "") => {
    await admin.open(`${baseUrl}/admin/test/reports/demand-review${query}`);
    await admin.waitUntil(`Boolean(${shown("main [data-headline]")})`);
  };
  const chartTitle = () => admin.evaluate<string>(`${shown("main [data-slot=card-title]")}.textContent`);
  const checked = (name: string) => admin.evaluate<string>(`document.querySelector("${FILTERS} input[name=${name}]:checked").value`);
  /** Each unit the form offers, and whether it can be chosen. */
  const units = () => admin.evaluate<[string, boolean][]>(`[...document.querySelectorAll("${FILTERS} input[name=unit]")].map((input) => [input.value, !input.disabled])`);
  const apply = async (expected: string) => {
    await clickHydrated(admin, `${FILTERS} button[type=submit]`);
    await admin.waitUntil(`location.search.includes(${JSON.stringify(expected)}) && Boolean(${shown("main [data-headline]")})`);
  };
  /** Clicks the shown element matching `selector` after marking it, so a hidden earlier page's copy isn't clicked. */
  const clickShown = async (selector: string) => {
    await admin.waitUntil(`Boolean(${shown(selector)})`);
    await admin.evaluate(`(() => { document.querySelectorAll("[data-test-click]").forEach((e) => e.removeAttribute("data-test-click")); ${shown(selector)}.setAttribute("data-test-click", ""); return true; })()`);
    await admin.click("[data-test-click]");
  };

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await admin.setViewport(1280, 800);
    await open();
    products = (await admin.evaluate<string[]>(`[...document.querySelectorAll("main [data-grid-row]")].map((row) => row.dataset.gridRow)`)).slice(0, 2);
    expect(products).toHaveLength(2);
  });
  afterAll(async () => {
    await admin.close();
  });

  it("opens per week in SU, every product together, with the chart over the grid", async () => {
    await open();
    expect(await admin.title()).toBe("Test · Demand review");
    expect(await chartTitle()).toBe("Shipped and still to ship per week, in SU");
    expect(await checked("bucket")).toBe("week");
    expect(await admin.evaluate<boolean>(`${shown("main [data-slot=stacked-column-chart][role=img]")}?.querySelector("svg") !== null`)).toBe(true);
    expect((await units())[0]).toEqual(["SU", true]);
    expect((await units()).slice(1).every(([, enabled]) => !enabled)).toBe(true);
  });

  it("switches between months and days, the arrow keys moving the time bucket", async () => {
    await open();
    await clickShown(`${FILTERS} label:has(> input[name=bucket][value=week])`);
    await admin.press("ArrowRight");
    expect(await checked("bucket")).toBe("month");
    await apply("bucket=month");
    expect(await chartTitle()).toBe("Shipped and still to ship per month, in SU");
    await clickShown(`${FILTERS} label:has(> input[name=bucket][value=day])`);
    await apply("bucket=day");
    expect(await chartTitle()).toBe("Shipped and still to ship per day, in SU");
  });

  it("offers only SU for two chosen products, and one product's own units once the other is removed", async () => {
    await open();
    await clickHydrated(admin, "#review-material");
    for (const product of products) {
      const option = `[...document.querySelectorAll("[role=listbox][aria-multiselectable=true] [role=option]")].find((row) => row.offsetParent && row.querySelector(".font-mono")?.textContent === ${JSON.stringify(product)})`;
      await admin.waitUntil(`Boolean(${option})`);
      await admin.evaluate(`(() => { document.querySelectorAll("[data-test-click]").forEach((e) => e.removeAttribute("data-test-click")); ${option}.scrollIntoView({ block: "nearest" }); ${option}.setAttribute("data-test-click", ""); return true; })()`);
      await admin.click("[data-test-click]");
      await admin.waitUntil(`${option}.getAttribute("aria-selected") === "true"`);
    }
    await admin.press("Escape");
    await apply(`material=${products[0]}&material=${products[1]}`);
    expect((await units()).filter(([, enabled]) => enabled)).toEqual([["SU", true]]);

    await clickShown(`${FILTERS} button[aria-label^="Remove ${products[1]}"]`);
    await apply(`material=${products[0]}&unit=`);
    expect((await units()).filter(([, enabled]) => enabled).map(([unit]) => unit)).toContain("pallet");
    await clickShown(`${FILTERS} label:has(> input[name=unit][value=pallet])`);
    await apply("unit=pallet");
    expect(await chartTitle()).toBe("Shipped and still to ship per week, in pallet");
    expect(await admin.evaluate<string>(`${shown("main table th")}.textContent`)).toBe("Location");
  });

  it("opens a grid row's open orders, overdue part and forecast", async () => {
    await open();
    await clickShown("main [data-grid-row] button[aria-expanded=false]");
    await admin.waitUntil(`Boolean(${shown("main [data-grid-detail=forecast]")})`);
    expect(await admin.evaluate<string[]>(`[...document.querySelectorAll("main [data-grid-detail] th")].filter((e) => e.offsetParent).map((e) => e.textContent)`)).toEqual([
      "Open orders", "of which overdue", "Forecast not yet ordered",
    ]);
  });

  it("goes Earlier and Later, and back at today the address drops the offset", async () => {
    await open();
    await clickHydrated(admin, `main a[aria-label="Show the earlier window"]`);
    await admin.waitUntil(`location.search.includes("offset=-1")`);
    await admin.waitForText("In this window:");
    expect(new URL(await admin.url()).searchParams.get("offset")).toBe("-1");
    await clickHydrated(admin, `main a[aria-label="Show the later window"]`);
    await admin.waitUntil(`!location.search.includes("offset")`);
    await admin.waitForText("Last 13 weeks:");
    expect(new URL(await admin.url()).searchParams.has("offset")).toBe(false);
  });
});
