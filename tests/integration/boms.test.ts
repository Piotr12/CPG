import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { chooseFromList, clickHydrated, openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own records: other files share the app, and masters and BOMs are never deleted.
const USERNAME = "boms-una";
const PASSWORD = "boms una's first password";

/** True once `element` is hydrated, shown, and outside Next.js's hidden staging container. */
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
/** The page's button with exactly this text or accessible name, if any. */
const button = (name: string) =>
  `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === ${JSON.stringify(name)} || b.getAttribute("aria-label") === ${JSON.stringify(name)})`;
const closed = `!document.querySelector("[role=dialog]")`;
/** The recipe table on a BOM's page. */
const RECIPE = "section[aria-labelledby=recipe-heading] table";
/** A dialog field by its form name; line fields are named `components.N.<field>`. */
const field = (name: string) => `[role=dialog] [name='${name}']`;
/** A dialog's material picker by the form name of the value it holds (#217). */
const picker = (name: string) => `[role=dialog] :has(> input[name='${name}']) > input[role=combobox]`;
/** The open picker list's material IDs. */
const OFFERED = `[...document.querySelectorAll("[role=dialog] [role=listbox]:not([hidden]) [role=option] .font-mono")].map((code) => code.textContent)`;
const LIST_OPEN = `Boolean(document.querySelector("[role=dialog] [role=listbox]:not([hidden])"))`;

/** A page's table rows as their cells' text, once its first table is shown. */
async function rows(browser: Browser, path: string, table = "main table"): Promise<string[][]> {
  await browser.open(`${baseUrl}${path}`);
  await browser.waitUntil(`document.querySelector("main table") && !document.querySelector("main table").closest("[hidden]")`);
  return browser.evaluate<string[][]>(
    `[...document.querySelectorAll(${JSON.stringify(`${table} tbody tr`)})].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")))`,
  );
}

/** Creates a Prod material through Create material and returns its new ID. */
async function createMaterial(admin: Browser, type: string, description: string, baseUnit: string): Promise<string> {
  const before = new Set((await rows(admin, "/admin/prod/materials")).map(([id]) => id));
  await admin.waitUntil(ready(button("Create material")));
  await admin.clickRole("button", "Create material");
  await admin.select("[role=dialog] select[name=type]", type);
  await admin.fillLabel("Description", description);
  await admin.select("[role=dialog] select[name=baseUnit]", baseUnit);
  await admin.click("[role=dialog] button[type=submit]");
  await admin.waitUntil(closed);
  await admin.waitForText(description);
  return (await rows(admin, "/admin/prod/materials")).find(([id, text]) => !before.has(id) && text === description)![0];
}

/** Fills the recipe form's priority, dates and lines; adds lines as needed. */
async function fillRecipe(admin: Browser, priority: string, validFrom: string, lines: [material: string, quantity: string][]) {
  await admin.fill(field("priority"), priority);
  expect(await admin.fillDate(field("validFrom"), validFrom)).toBe(validFrom);
  for (const [index, [material, quantity]] of lines.entries()) {
    if (index > 0) await admin.clickRole("button", "+ Add component");
    await chooseFromList(admin, picker(`components.${index}.material`), material, material);
    await admin.fill(field(`components.${index}.quantity`), quantity);
  }
}

/** Creates a Prod BOM through Create BOM; returns its ID, or leaves the dialog open on a refusal. */
async function createBom(admin: Browser, output: string, priority: string, validFrom: string, lines: [string, string][]): Promise<string | null> {
  const before = new Set((await rows(admin, "/admin/prod/boms")).map(([id]) => id));
  await admin.waitUntil(ready(button("Create BOM")));
  await admin.clickRole("button", "Create BOM");
  await admin.waitFor("[role=dialog]");
  await chooseFromList(admin, picker("output"), output, output);
  await fillRecipe(admin, priority, validFrom, lines);
  await admin.click("[role=dialog] button[type=submit]");
  await admin.waitUntil(`${closed} || document.querySelector("[role=dialog] [role=alert]")`);
  if (!(await admin.evaluate<boolean>(closed))) return null;
  return (await rows(admin, "/admin/prod/boms")).find(([id]) => !before.has(id))![0];
}

/** Opens the Edit BOM dialog on a BOM's page once it can be used. */
async function openEdit(admin: Browser, bom: string) {
  await rows(admin, `/admin/prod/boms/${bom}`);
  await admin.waitUntil(ready(button("Edit BOM")));
  await admin.clickRole("button", "Edit BOM");
  await admin.waitFor("[role=dialog]");
}

describe("BOMs (E04-S01)", () => {
  let admin: Browser;
  let una: Browser;
  const ids = { steel: "", cabinet: "", subA: "", subB: "", subC: "" };

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    ids.steel = await createMaterial(admin, "raw", "boms-ui steel", "kg");
    ids.cabinet = await createMaterial(admin, "finished", "boms-ui cabinet", "each");
    ids.subA = await createMaterial(admin, "intermediate", "boms-ui sub A", "each");
    ids.subB = await createMaterial(admin, "intermediate", "boms-ui sub B", "each");
    ids.subC = await createMaterial(admin, "intermediate", "boms-ui sub C", "each");
  });
  afterAll(() => Promise.all([admin, una].map((browser) => browser.close())));

  it("starts Test with the dataset's 16 BOMs, three alternates for one output, one with bolts entered as 2 cases and stored as 24 each (TEN-001, MAT-019)", async () => {
    await admin.open(`${baseUrl}/admin/test`);
    await admin.waitUntil(ready(`document.querySelector("main a[href='/admin/test/boms']")`));
    await admin.click("main a[href='/admin/test/boms']");
    await admin.waitForText("BOMs — Test");
    expect(await admin.title()).toBe("Test · BOMs");

    const list = (await rows(admin, "/admin/test/boms")).map((row) => row.slice(0, 4));
    expect(list).toHaveLength(16);
    expect(list.slice(0, 2)).toEqual([
      ["00000001", "00000004 Painted side panel", "1", "rev 1"],
      ["00000005", "00000005 Cabinet, red", "1", "rev 1"],
    ]);
    expect(list.filter(([, output]) => output === "00000026 Key cabinet, wall-mounted")).toEqual([
      ["00000014", "00000026 Key cabinet, wall-mounted", "1", "rev 1"],
      ["00000015", "00000026 Key cabinet, wall-mounted", "2", "rev 1"],
      ["00000016", "00000026 Key cabinet, wall-mounted", "3", "rev 1"],
    ]);
    const recipe = await rows(admin, "/admin/test/boms/00000006", RECIPE);
    expect(recipe).toContainEqual(["00000002 Bolt M8", "24 each", "2 case at 1 case = 12 each"]);
  });

  it("creates a BOM for a finished output from raw and intermediate components, offering only the allowed materials (BOM-001, BOM-003…005)", async () => {
    await rows(admin, "/admin/prod/boms");
    await admin.waitUntil(ready(button("Create BOM")));
    await admin.clickRole("button", "Create BOM");
    await admin.waitFor("[role=dialog]");
    /** The materials a picker offers for this file's own description prefix. */
    const offered = async (name: string) => {
      await admin.waitUntil(ready(`document.querySelector(${JSON.stringify(picker(name))})`));
      await admin.fill(picker(name), "boms-ui");
      await admin.waitUntil(LIST_OPEN);
      return admin.evaluate<string[]>(OFFERED);
    };
    const outputs = await offered("output");
    expect(outputs).toContain(ids.cabinet);
    expect(outputs).not.toContain(ids.steel);
    // Escape in an open list closes only the list, not the dialog (#217).
    await admin.press("Escape");
    await admin.waitUntil(`!${LIST_OPEN}`);
    expect(await admin.evaluate<boolean>(closed)).toBe(false);
    const components = await offered("components.0.material");
    expect(components).toContain(ids.steel);
    expect(components).not.toContain(ids.cabinet);
    await admin.press("Escape");
    await admin.waitUntil(`!${LIST_OPEN}`);
    await admin.press("Escape");
    await admin.waitUntil(closed);

    const bom = await createBom(admin, ids.cabinet, "1", "2027-01-01", [
      [ids.steel, "4.5"],
      [ids.subA, "2"],
    ]);
    const detail = await rows(admin, `/admin/prod/boms/${bom}`, RECIPE);
    expect(detail).toEqual([
      [`${ids.steel} boms-ui steel`, "4.5 kg", ""],
      [`${ids.subA} boms-ui sub A`, "2 each", ""],
    ]);
  });

  it("adds revision 2 for a changed amount and keeps revision 1 readable (BOM-020)", async () => {
    const bom = (await rows(admin, "/admin/prod/boms")).find(([, output]) => output === `${ids.cabinet} boms-ui cabinet`)![0];
    await openEdit(admin, bom);
    await admin.fill(field("components.0.quantity"), "5");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(closed);
    await admin.waitForText("Components (revision 2)");

    expect((await rows(admin, `/admin/prod/boms/${bom}`, RECIPE))[0][1]).toBe("5 kg");
    const old = await rows(admin, `/admin/prod/boms/${bom}?revision=1`, RECIPE);
    expect(old[0][1]).toBe("4.5 kg");
    expect(await admin.text("[role=note]")).toContain("Revision 1 of 2: history, kept unchanged, with priority 1, valid 2027-01-01 – no end.");
  });

  it("refuses a second alternative with the same priority on overlapping days, naming the other BOM (BOM-015)", async () => {
    const first = (await rows(admin, "/admin/prod/boms")).find(([, output]) => output === `${ids.cabinet} boms-ui cabinet`)![0];
    expect(await createBom(admin, ids.cabinet, "1", "2027-06-01", [[ids.subA, "1"]])).toBeNull();
    expect(await admin.text("[role=dialog] [role=alert]")).toContain(`It clashes with BOM ${first} (2027-06-01 – …).`);
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(closed);
  });

  it("refuses an edit that would make A → B → C → A, showing the full path and writing nothing (BOM-025)", async () => {
    const a = await createBom(admin, ids.subA, "1", "2027-01-01", [[ids.subB, "1"]]);
    const b = await createBom(admin, ids.subB, "1", "2027-01-01", [[ids.subC, "1"]]);
    const c = await createBom(admin, ids.subC, "1", "2027-01-01", [[ids.steel, "1"]]);

    await openEdit(admin, c!);
    await chooseFromList(admin, picker("components.0.material"), ids.subA, ids.subA);
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitFor("[role=dialog] [role=alert]");
    expect(await admin.text("[role=dialog] [role=alert]")).toBe(
      `This BOM would make a cycle, so it can't be saved: ${ids.subC} boms-ui sub C →(BOM ${c}) ${ids.subA} boms-ui sub A →(BOM ${a}) ` +
        `${ids.subB} boms-ui sub B →(BOM ${b}) ${ids.subC} boms-ui sub C.`,
    );
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(closed);

    expect(await rows(admin, `/admin/prod/boms/${c}`, RECIPE)).toEqual([[`${ids.steel} boms-ui steel`, "1 kg", ""]]);
    await admin.waitForText("Components (revision 1)");
    expect((await rows(admin, "/admin/prod/boms")).find(([id]) => id === c)![3]).toBe("rev 1");
  });

  it("deactivates a BOM without a new revision (BOM-022), and then locks its output's type (MAT-011)", async () => {
    const before = (await rows(admin, "/admin/prod/boms")).find(([, output]) => output === `${ids.cabinet} boms-ui cabinet`)!;
    const bom = before[0];
    expect(before.at(-1)).toBe("Active");
    await rows(admin, `/admin/prod/boms/${bom}`);
    await admin.waitUntil(ready(button("Deactivate")));
    await admin.clickRole("button", "Deactivate");
    await admin.waitFor("[role=alertdialog]");
    await admin.click("[role=alertdialog] button[data-variant=destructive-solid]");
    await admin.waitUntil(`!document.querySelector("[role=alertdialog]")`);
    await admin.waitUntil(ready(button("Reactivate")));
    const row = (await rows(admin, "/admin/prod/boms")).find(([id]) => id === bom)!;
    expect([row[3], row.at(-1)]).toEqual([before[3], "Inactive"]);

    await rows(admin, `/admin/prod/materials/${ids.cabinet}`);
    await admin.waitUntil(ready(button("Edit")));
    await admin.clickRole("button", "Edit");
    await admin.select("[role=dialog] select[name=type]", "intermediate");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitForText("A BOM or customer order uses this material, so its type cannot change.");
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(closed);
  });

  it("shows a normal user the list and a BOM without any control (TEN-004)", async () => {
    await createUser(admin, baseUrl, USERNAME, PASSWORD);
    await signIn(una, baseUrl, PASSWORD, USERNAME);
    await una.waitForText(USERNAME);

    expect((await rows(una, "/admin/test/boms")).length).toBeGreaterThan(0);
    // Only the list's own Search button: nothing that changes data.
    expect(await una.evaluate<string[]>(`[...document.querySelectorAll("main button")].map((b) => b.textContent.trim())`)).toEqual(["Search"]);
    expect((await rows(una, "/admin/test/boms/00000001", RECIPE)).length).toBe(2);
    expect(await una.evaluate<number>(`document.querySelectorAll("main button").length`)).toBe(0);
  });
});

describe("sorting and searching the BOMs list (#217)", () => {
  let admin: Browser;
  /** The shown rows' cells, in order. */
  const shown = () => admin.evaluate<string[][]>(`[...document.querySelectorAll("main tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")))`);
  /** Waits until the page's address has this query and the table under it is the new one. */
  const atQuery = (query: string) =>
    admin.waitUntil(`location.search === ${JSON.stringify(query)} && document.querySelector("main [aria-sort]") && !document.querySelector("main table").closest("[hidden]")`);

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
  });
  afterAll(() => admin.close());

  it("sorts the whole list by priority, then the other way, by BOM ID within equal priorities", async () => {
    await admin.open(`${baseUrl}/admin/test/boms`);
    await admin.waitUntil(`document.querySelector("main th[aria-sort=ascending]")?.innerText.trim() === "Output"`);

    await clickHydrated(admin, "main th a[href$='sort=priority&dir=asc']");
    await atQuery("?sort=priority&dir=asc");
    const ascending = (await shown()).map(([id, , priority]) => [Number(priority), id] as const);
    expect(ascending.length).toBeGreaterThanOrEqual(16);
    expect(ascending).toEqual([...ascending].sort(([a, x], [b, y]) => a - b || x.localeCompare(y)));

    await clickHydrated(admin, "main th a[href$='sort=priority&dir=desc']");
    await atQuery("?sort=priority&dir=desc");
    await admin.waitUntil(`document.querySelector("main th[aria-sort=descending]")?.innerText.trim() === "Priority"`);
    const descending = (await shown()).map(([id, , priority]) => [Number(priority), id] as const);
    expect(descending).toEqual([...ascending].sort(([a, x], [b, y]) => b - a || x.localeCompare(y)));
  });

  it("searches the BOM ID and the output's ID and description, keeping the sort, marking matches, and clears back", async () => {
    await admin.open(`${baseUrl}/admin/test/boms?sort=priority&dir=desc`);
    await admin.waitUntil(`Boolean(document.querySelector("main [role=search] input[name=q]")) && Object.keys(document.querySelector("main [role=search] button")).some((key) => key.startsWith("__reactFiber"))`);
    await admin.fill("main [role=search] input[name=q]", "key cabinet");
    await admin.click("main [role=search] button[type=submit]");
    await atQuery("?q=key+cabinet&sort=priority&dir=desc");
    await admin.waitFor("main [role=status]");

    const found = await shown();
    expect(found.map(([id, output, priority]) => [id, output, priority])).toEqual([
      ["00000016", "00000026 Key cabinet, wall-mounted", "3"],
      ["00000015", "00000026 Key cabinet, wall-mounted", "2"],
      ["00000014", "00000026 Key cabinet, wall-mounted", "1"],
    ]);
    expect(await admin.text("main [role=status]")).toBe("3 results for “key cabinet” · Clear search");
    expect(await admin.evaluate<string[]>(`[...document.querySelectorAll("main tbody tr:first-child mark")].map((mark) => mark.textContent)`)).toEqual(["Key", "cabinet"]);

    await clickHydrated(admin, "main [role=status] a");
    await atQuery("?sort=priority&dir=desc");
    await admin.waitUntil(`document.querySelector("main [role=search] input[name=q]").value === "" && !document.querySelector("main [role=status]")`);
    expect((await shown()).length).toBeGreaterThanOrEqual(16);
  });

  it("says when a search finds nothing, with the way back", async () => {
    await admin.open(`${baseUrl}/admin/test/boms?q=no+such+bom`);
    await admin.waitForText("Nothing matches “no such bom”.");
    expect(await admin.text("main [role=status]")).toBe("0 results for “no such bom” · Clear search");
  });
});
