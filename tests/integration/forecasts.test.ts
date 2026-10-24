import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { chooseFromList, openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own records: other files share the app, and masters are never deleted.
const USERNAME = "fc-una";
const PASSWORD = "fc una's first password";

/** True once `element` is hydrated, shown, and outside Next.js's hidden staging container. */
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
/** The page's button with exactly this text or accessible name, if any. */
const button = (name: string) =>
  `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === ${JSON.stringify(name)} || b.getAttribute("aria-label") === ${JSON.stringify(name)})`;
const closed = `!document.querySelector("[role=dialog]")`;

/** A screen's rows as their cells' text, once its table is shown. */
async function listRows(browser: Browser, path: string): Promise<string[][]> {
  await browser.open(`${baseUrl}${path}`);
  await browser.waitUntil(`document.querySelector("main table") && !document.querySelector("main table").closest("[hidden]")`);
  return browser.evaluate<string[][]>(
    `[...document.querySelectorAll("main tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")))`,
  );
}

/** Creates a Prod record through a list's Create dialog and returns its new ID, read from the list. */
async function createInProd(admin: Browser, kind: string, create: string, fill: () => Promise<unknown>, text: string): Promise<string> {
  const before = new Set((await listRows(admin, `/admin/prod/${kind}`)).map(([id]) => id));
  await admin.waitUntil(ready(button(create)));
  await admin.clickRole("button", create);
  await fill();
  await admin.click("[role=dialog] button[type=submit]");
  await admin.waitUntil(closed);
  await admin.waitForText(text);
  // The new row is the one that wasn't there: other files create Prod records too.
  return (await listRows(admin, `/admin/prod/${kind}`)).find(([id, name]) => !before.has(id) && name === text)![0];
}

describe("forecasts (E08-S03)", () => {
  let admin: Browser;
  let una: Browser;
  let cabinet: string;
  let plant: string;
  let packer: string;

  /** This file's rows in the Prod list, as day and quantity. */
  const mine = async (query = "") =>
    (await listRows(admin, `/admin/prod/forecasts${query}`)).filter(([material]) => material.endsWith("fc-ui cabinet")).map((row) => row.slice(1, 4));
  /** Opens the Add forecast dialog once it can be used and fills it in. */
  async function addForecast(location: string, date: string, quantity: string, unit = "") {
    await listRows(admin, "/admin/prod/forecasts");
    await admin.waitUntil(ready(button("Add forecast")));
    await admin.clickRole("button", "Add forecast");
    await admin.waitFor("[role=dialog]");
    await chooseFromList(admin, "[role=dialog] [role=combobox]", "fc-ui cabinet", cabinet);
    await admin.select("[role=dialog] select[name=location]", location);
    expect(await admin.fillDate("[role=dialog] input[name=date]", date)).toBe(date);
    await admin.fill("[role=dialog] input[name=quantity]", quantity);
    if (unit) await admin.fill("[role=dialog] input[name=unit]", unit);
    await admin.click("[role=dialog] button[type=submit]");
  }
  /** Opens a row's ⋯ menu, once hydrated, and picks an item. */
  async function rowMenu(date: string, item: string) {
    await listRows(admin, "/admin/prod/forecasts");
    const menu = `Actions for ${cabinet} at ${plant} on ${date}`;
    await admin.waitUntil(ready(button(menu)));
    await admin.clickRole("button", menu);
    await admin.clickRole("menuitem", item);
  }

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    // The Add form is taller than the default 577 px viewport, and a click below the dialog's edge closes it.
    await admin.setViewport(1280, 800);
    cabinet = await createInProd(
      admin,
      "materials",
      "Create material",
      async () => {
        await admin.select("[role=dialog] select[name=type]", "finished");
        await admin.fillLabel("Description", "fc-ui cabinet");
        await admin.select("[role=dialog] select[name=baseUnit]", "each");
      },
      "fc-ui cabinet",
    );
    plant = await createInProd(admin, "locations", "Create location", () => admin.fillLabel("Name", "fc-ui plant"), "fc-ui plant");
    packer = await createInProd(admin, "locations", "Create location", () => admin.fillLabel("Name", "fc-ui packer"), "fc-ui packer");
  });
  afterAll(() => Promise.all([admin, una].map((browser) => browser.close())));

  it("starts Test with the dataset's forecasts, a year of months for each finished product, reached from the tenant home and the Sales group (TEN-001, D06)", async () => {
    await admin.open(`${baseUrl}/admin/test`);
    await admin.waitUntil(ready(`document.querySelector("main a[href='/admin/test/forecasts']")`));
    await admin.click("main a[href='/admin/test/forecasts']");
    await admin.waitForText("Forecasts — Test");
    expect(await admin.title()).toBe("Test · Forecasts");

    // 120 forecasts: 100 on the first page, the other 20 behind Next.
    const firstPage = await listRows(admin, "/admin/test/forecasts");
    expect(firstPage).toHaveLength(100);
    expect(await admin.text("main nav[aria-label='Forecast pages']")).toContain("Page 1 of 2");
    await admin.waitUntil(ready(`document.querySelector("main nav[aria-label='Forecast pages'] a")`));
    await admin.click("main nav[aria-label='Forecast pages'] a");
    await admin.waitForText("Page 2 of 2");
    expect(await admin.url()).toBe(`${baseUrl}/admin/test/forecasts?page=2`);
    const secondPage = await listRows(admin, "/admin/test/forecasts?page=2");
    expect(secondPage).toHaveLength(20);
    const rows = [...firstPage, ...secondPage];
    expect(new Set(rows.map(([material]) => material)).size).toBe(10);
    expect(new Set(rows.map(([, , date]) => date)).size).toBe(12);
    for (const [, , date, quantity] of rows) {
      expect(date).toMatch(/^\d{4}-\d{2}-01$/);
      expect(quantity).toMatch(/^\d*[05] each$/);
    }
  });

  it("sorts every page by a header click, searches materials and locations keeping the sort and filter, and clears back (#217)", async () => {
    const atQuery = (query: string) =>
      admin.waitUntil(`location.search === ${JSON.stringify(query)} && document.querySelector("main [aria-sort]") && !document.querySelector("main table").closest("[hidden]")`);
    const shown = () => admin.evaluate<string[][]>(`[...document.querySelectorAll("main tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")))`);
    await listRows(admin, "/admin/test/forecasts");
    await admin.waitUntil(`document.querySelector("main th[aria-sort=ascending]")?.innerText.trim() === "Material"`);

    // By day, across both pages: the first page holds the ten earliest months, in order.
    await admin.waitUntil(ready(`document.querySelector("main th a[href$='sort=date&dir=asc']")`));
    await admin.click("main th a[href$='sort=date&dir=asc']");
    await atQuery("?sort=date&dir=asc");
    const ascending = (await shown()).map(([, , date]) => date);
    expect(ascending).toHaveLength(100);
    expect(ascending).toEqual([...ascending].sort());
    await admin.waitUntil(ready(`document.querySelector("main nav[aria-label='Forecast pages'] a")`));
    await admin.click("main nav[aria-label='Forecast pages'] a");
    await atQuery("?sort=date&dir=asc&page=2");
    const later = (await shown()).map(([, , date]) => date);
    expect(later.every((date) => date >= ascending.at(-1)!)).toBe(true);
    await admin.waitUntil(ready(`document.querySelector("main th a[href$='sort=date&dir=desc']")`));
    await admin.click("main th a[href$='sort=date&dir=desc']");
    await atQuery("?sort=date&dir=desc");
    expect((await shown())[0][2]).toBe([...ascending, ...later].sort().at(-1));

    // Search the first row's material by a word of its description: the sort stays, matches are marked.
    const word = (await shown())[0][0].split(" ")[1].replace(/[^A-Za-z]/g, "");
    await admin.waitUntil(ready(`document.querySelector("main [role=search] button")`));
    await admin.fill("main [role=search] input[name=q]", word);
    await admin.click("main [role=search] button[type=submit]");
    await atQuery(`?q=${word}&sort=date&dir=desc`);
    await admin.waitFor("main p[role=status]");
    const found = await shown();
    expect(found.length).toBeGreaterThan(0);
    for (const [material, location] of found) expect(`${material} ${location}`.toLowerCase()).toContain(word.toLowerCase());
    expect(found.map(([, , date]) => date)).toEqual(found.map(([, , date]) => date).sort().reverse());
    expect(await admin.evaluate<number>(`document.querySelectorAll("main tbody mark").length`)).toBeGreaterThanOrEqual(found.length);
    expect(await admin.text("main p[role=status]")).toMatch(new RegExp(`^${found.length} results? for “${word}” · Clear search$`));
    // The filter form keeps the search and the sort.
    expect(await admin.evaluate<string[]>(`[...document.querySelectorAll("form[aria-label='Filter forecasts'] input[type=hidden]")].map((input) => input.name + "=" + input.value)`)).toEqual([`q=${word}`, "sort=date", "dir=desc"]);

    await admin.waitUntil(ready(`document.querySelector("main p[role=status] a")`));
    await admin.click("main p[role=status] a");
    await atQuery("?sort=date&dir=desc");
    await admin.waitUntil(`document.querySelector("main [role=search] input[name=q]").value === "" && !document.querySelector("main p[role=status]")`);
    expect(await shown()).toHaveLength(100);
  });

  it("adds forecasts without a customer, in any unit the material converts, and lists the quantity per day", async () => {
    await addForecast(plant, "2027-03-02", "40");
    await admin.waitUntil(closed);
    await addForecast(plant, "2027-03-01", "25.5");
    await admin.waitUntil(closed);
    await addForecast(packer, "2027-03-01", "7");
    await admin.waitUntil(closed);

    expect(await mine()).toEqual([
      [`${plant} fc-ui plant`, "2027-03-01", "25.5 each"],
      [`${plant} fc-ui plant`, "2027-03-02", "40 each"],
      [`${packer} fc-ui packer`, "2027-03-01", "7 each"],
    ]);
  });

  it("refuses a second forecast for the same material, location and day, next to the form (D04)", async () => {
    await addForecast(plant, "2027-03-02", "99");
    await admin.waitForText("This material already has a forecast at that location on that day.");
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(closed);

    expect((await mine()).filter(([, date]) => date === "2027-03-02")).toEqual([[`${plant} fc-ui plant`, "2027-03-02", "40 each"]]);
  });

  it("shows a unit the material doesn't convert as a field error (MAT-023)", async () => {
    await addForecast(plant, "2027-03-05", "1", "pallet");
    await admin.waitForText("This material has no conversion from this unit to its base unit.");
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(closed);
  });

  it("filters the list by material and location to show per-day quantities", async () => {
    await listRows(admin, "/admin/prod/forecasts");
    await admin.waitUntil(ready(`document.querySelector("form[role=search] select[name=material]")`));
    await admin.select("form[role=search] select[name=material]", cabinet);
    await admin.select("form[role=search] select[name=location]", packer);
    await admin.click("form[role=search][aria-label='Filter forecasts'] button[type=submit]");
    await admin.waitUntil(`location.search.includes("location=${packer}")`);

    expect(await mine(`?material=${cabinet}&location=${packer}`)).toEqual([[`${packer} fc-ui packer`, "2027-03-01", "7 each"]]);
    expect(await mine(`?location=${plant}`)).toEqual([
      [`${plant} fc-ui plant`, "2027-03-01", "25.5 each"],
      [`${plant} fc-ui plant`, "2027-03-02", "40 each"],
    ]);
  });

  it("changes a quantity, also from another unit, and removes a forecast, from each row's menu", async () => {
    await rowMenu("2027-03-02", "Change forecast");
    await admin.fill("[role=dialog] input[name=quantity]", "50");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(closed);
    expect((await mine()).find(([, date]) => date === "2027-03-02")).toEqual([`${plant} fc-ui plant`, "2027-03-02", "50 each"]);

    await rowMenu("2027-03-01", "Remove");
    await admin.waitFor("[role=alertdialog]");
    await admin.click("[role=alertdialog] button[data-variant=destructive-solid]");
    await admin.waitUntil(`!document.querySelector("[role=alertdialog]")`);
    expect((await mine()).filter(([location]) => location.startsWith(plant)).map(([, date]) => date)).toEqual(["2027-03-02"]);
  });

  it("records a change with before and after and a removal in the Prod audit (AUD-002, AUD-005)", async () => {
    await admin.open(`${baseUrl}/admin/prod/audit`);
    await admin.waitFor("table");
    const rows = await admin.evaluate<string[][]>(
      `[...document.querySelectorAll("tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim()))`,
    );
    const ours = rows.filter((cells) => cells[5].startsWith(`${cabinet} — fc-ui cabinet at ${plant}`)).map(([, , , , action, , changes]) => [action, changes]);

    expect(ours.map(([action]) => action)).toEqual(expect.arrayContaining(["Forecast added", "Forecast changed", "Forecast removed"]));
    expect(ours.find(([action]) => action === "Forecast changed")?.[1]).toContain("40");
  });

  it("shows a normal user the list and its filter without any control (TEN-004)", async () => {
    await admin.open(`${baseUrl}/admin/users`);
    await admin.waitFor("table");
    await admin.waitUntil(ready(button("Create user")));
    await admin.clickRole("button", "Create user");
    await admin.fillLabel("Username", USERNAME);
    await admin.fillLabel("Initial password", PASSWORD);
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(closed);
    await signIn(una, baseUrl, PASSWORD, USERNAME);
    await una.waitForText(USERNAME);

    expect((await listRows(una, "/admin/test/forecasts")).length).toBeGreaterThan(0);
    expect(await una.evaluate<string[]>(`[...document.querySelectorAll("main button")].map((b) => b.textContent.trim())`)).toEqual(["Search", "Filter"]);
    expect(await una.evaluate<boolean>(`!!document.querySelector("form[role=search]")`)).toBe(true);
  });
});
