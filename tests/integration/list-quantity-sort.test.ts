import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clickHydrated, openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

/** The shown table, not a copy in Next.js's hidden staging container. */
const table = `[...document.querySelectorAll("main table")].find((table) => !table.closest("[hidden]") && table.offsetParent)`;

/**
 * Clicks the header link sorting by `key` in `dir`, waits for the list sorted that way, and returns the
 * sorted column's cells as text.
 */
async function sortBy(browser: Browser, key: string, dir: "asc" | "desc"): Promise<string[]> {
  await clickHydrated(browser, `main th a[href$='sort=${key}&dir=${dir}']`);
  const shown = dir === "asc" ? "ascending" : "descending";
  const next = dir === "asc" ? "desc" : "asc";
  await browser.waitUntil(
    `location.search === "?sort=${key}&dir=${dir}" && ${table}?.querySelector("th[aria-sort=${shown}] a[href$='sort=${key}&dir=${next}']")`,
  );
  return browser.evaluate<string[]>(`(() => {
    const shown = ${table};
    const column = [...shown.querySelectorAll("thead th")].findIndex((th) => th.getAttribute("aria-sort") === "${shown}");
    return [...shown.querySelectorAll("tbody tr")].map((row) => row.cells[column].innerText.trim());
  })()`);
}

/** A quantity cell's number: `"1900 kg"` → 1900. */
const amount = (cell: string) => Number(cell.split(" ")[0]);

describe("Lists sort by quantity columns and purchase orders by Created (#224)", () => {
  let admin: Browser;

  beforeAll(async () => {
    admin = await openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
  });

  afterAll(() => admin?.close());

  // The Test tenant's dataset. Its quantities have one to four digits, so their stored text sorts
  // differently from their value ("100" before "25"); other files may reset it, so the order is checked
  // against whatever the list shows rather than against fixed values.
  const QUANTITY_COLUMNS = [
    ["forecasts", "quantity"],
    ["production-orders", "quantity"],
    ["purchase-requisitions", "quantity"],
    ["purchase-requisitions", "converted"],
    ["planning-parameters", "minimum"],
    ["planning-parameters", "multiple"],
    ["safety-stock", "quantity"],
  ] as const;

  it.each(QUANTITY_COLUMNS)("sorts %s by %s by its value, both ways, from a header click", async (list, key) => {
    await admin.open(`${baseUrl}/admin/test/${list}`);
    await admin.waitUntil(`${table}?.querySelector("[aria-sort]")`);

    const ascending = (await sortBy(admin, key, "asc")).map(amount);
    expect(ascending.length).toBeGreaterThan(1);
    expect(ascending.every((value) => Number.isFinite(value))).toBe(true);
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

    const descending = (await sortBy(admin, key, "desc")).map(amount);
    expect(descending).toEqual([...descending].sort((a, b) => b - a));
    expect(descending[0]).toBeGreaterThanOrEqual(ascending.at(-1)!);
  });

  it("shows each purchase order's creation date and sorts by it, both ways", async () => {
    await admin.open(`${baseUrl}/admin/test/purchase-orders`);
    await admin.waitUntil(`${table}?.querySelector("[aria-sort]")`);

    const ascending = await sortBy(admin, "created", "asc");
    expect(ascending.length).toBeGreaterThan(1);
    for (const date of ascending) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ascending).toEqual([...ascending].sort());

    const descending = await sortBy(admin, "created", "desc");
    expect(descending).toEqual([...descending].sort().reverse());
    expect(descending[0] >= ascending.at(-1)!).toBe(true);
  });
});
