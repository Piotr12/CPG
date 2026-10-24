import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clickHydrated, openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own records: other files share the app, and nothing here is ever deleted.
const USERNAME = "mat-una";
const PASSWORD = "mat una's first password";
const BOLT = "mat-ui bolt";
const NUT = "mat-ui nut";
const GAUGE = "mat-ui test-only gauge";
const CLAMP = "mat-ui clamp";
const SPOOL = "mat-ui wire spool";

/** True once `element` is hydrated, shown, and outside Next.js's hidden staging container. */
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
/** The page's button with exactly this text, if any. */
const button = (name: string) =>
  `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === ${JSON.stringify(name)})`;

/** The list's rows as `[ID, description, type, base unit, status]`. */
async function listRows(browser: Browser, tenant: string): Promise<string[][]> {
  await browser.open(`${baseUrl}/admin/${tenant}/materials`);
  await browser.waitUntil(`document.querySelector("main table") && !document.querySelector("main table").closest("[hidden]")`);
  return browser.evaluate<string[][]>(
    `[...document.querySelectorAll("main tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim()))`,
  );
}

/** Creates a material in a tenant through the dialog and returns its new ID, read from the list. */
async function create(admin: Browser, tenant: string, type: string, description: string, baseUnit: string): Promise<string> {
  const before = new Set((await listRows(admin, tenant)).map(([id]) => id));
  await admin.waitUntil(ready(button("Create material")));
  await admin.clickRole("button", "Create material");
  await admin.select("[role=dialog] select[name=type]", type);
  await admin.fillLabel("Description", description);
  await admin.select("[role=dialog] select[name=baseUnit]", baseUnit);
  await admin.click("[role=dialog] button[type=submit]");
  await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
  await admin.waitForText(description);
  // The new row is the one that wasn't there: other files create materials too.
  return (await listRows(admin, tenant)).find(([id, text]) => !before.has(id) && text === description)![0];
}
const createInProd = (admin: Browser, type: string, description: string, baseUnit: string) =>
  create(admin, "prod", type, description, baseUnit);

/** Opens a Prod material's page and waits until its controls can be used. */
async function openMaterial(browser: Browser, id: string, controls: boolean) {
  await browser.open(`${baseUrl}/admin/prod/materials/${id}`);
  await browser.waitUntil(`document.querySelector("main h1") && !document.querySelector("main h1").closest("[hidden]")`);
  if (controls) await browser.waitUntil(ready(button("Add conversion")));
}

describe("materials and their unit conversions (E03-S01)", () => {
  let admin: Browser;
  let una: Browser;
  /** A second admin session, for two people working on one material (AUD-024). */
  let other: Browser;
  let boltId: string;

  beforeAll(async () => {
    [admin, una, other] = [openBrowser(), openBrowser(), openBrowser()];
    await Promise.all([signInAsAdmin(admin, baseUrl, adminPassword), signInAsAdmin(other, baseUrl, adminPassword)]);
  });
  afterAll(() => Promise.all([admin, una, other].map((browser) => browser.close())));

  it("starts Test with the dataset's materials, reached from the tenant home (TEN-001, D06)", async () => {
    await admin.open(`${baseUrl}/admin/test`);
    await admin.waitUntil(ready(`document.querySelector("main a[href='/admin/test/materials']")`));
    await admin.click("main a[href='/admin/test/materials']");
    await admin.waitForText("Materials — Test");

    const rows = await listRows(admin, "test");
    expect(await admin.title()).toBe("Test · Materials");
    expect(rows.slice(0, 3)).toEqual([
      ["00000001", "Steel sheet 2 mm", "Raw", "kg", "Active"],
      ["00000002", "Bolt M8", "Raw", "each", "Active"],
      ["00000003", "Paint, red", "Raw", "l", "Active"],
    ]);
    // The dataset's 26: 12 raw, 4 intermediate, 10 finished. Other files may add Test materials after them.
    const types = rows.filter(([id]) => id <= "00000026").map(([, , type]) => type);
    expect(types).toHaveLength(26);
    expect(["Raw", "Intermediate", "Finished"].map((type) => types.filter((shown) => shown === type).length)).toEqual([12, 4, 10]);
  });

  it("gives materials created in Prod consecutive IDs, independent of Test (MAT-001, MAT-002, MAT-003)", async () => {
    const testBefore = await listRows(admin, "test");

    boltId = await createInProd(admin, "raw", BOLT, "each");
    const nutId = await createInProd(admin, "intermediate", NUT, "each");

    expect(boltId).toMatch(/^\d{8}$/);
    expect(nutId).toBe(String(Number(boltId) + 1).padStart(8, "0"));
    expect((await listRows(admin, "prod")).find((cells) => cells[0] === nutId)).toEqual([nutId, NUT, "Intermediate", "each", "Active"]);
    expect(await listRows(admin, "test")).toEqual(testBefore);
  });

  it("keeps a material created in Test out of Prod (R05)", async () => {
    const prodBefore = await listRows(admin, "prod");

    const id = await create(admin, "test", "raw", GAUGE, "kg");

    expect((await listRows(admin, "test")).find((cells) => cells[0] === id)).toEqual([id, GAUGE, "Raw", "kg", "Active"]);
    const prod = await listRows(admin, "prod");
    expect(prod.map(([, description]) => description)).not.toContain(GAUGE);
    // Prod's own rows are unchanged, whatever IDs they share with Test.
    expect(prod.filter(([rowId]) => prodBefore.some(([before]) => before === rowId))).toEqual(prodBefore);
  });

  it("names a missing description before creating anything (MAT-008)", async () => {
    await listRows(admin, "prod");
    await admin.waitUntil(ready(button("Create material")));
    await admin.clickRole("button", "Create material");
    await admin.select("[role=dialog] select[name=type]", "raw");
    await admin.select("[role=dialog] select[name=baseUnit]", "kg");
    await admin.click("[role=dialog] button[type=submit]");

    await admin.waitForText("Enter a description.");
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
  });

  it("adds 1 case = 12 each with its inverse, and refuses a zero factor (MAT-019, MAT-021, MAT-022)", async () => {
    await openMaterial(admin, boltId, true);
    expect(await admin.text("main h1")).toBe(`${boltId} — ${BOLT}`);

    await admin.clickRole("button", "Add conversion");
    await admin.select("[role=dialog] select[name=unit]", "case");
    await admin.fillLabel("Alternate quantity", "0");
    await admin.fillLabel("Base quantity", "12");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitForText("Enter a number greater than 0, with at most 12 digits before the point and 6 after it.");

    await admin.fillLabel("Alternate quantity", "1");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    await admin.waitForText("1 case = 12 each");

    expect(await admin.texts("main section tbody tr")).toEqual([expect.stringMatching(/^case\s+1 case = 12 each\s+1 each = 0\.083333 case/)]);
  });

  it("records an edit and a deactivation, with before and after, in the Prod audit (AUD-002, AUD-003)", async () => {
    await openMaterial(admin, boltId, true);
    await admin.clickRole("button", "Edit");
    await admin.fillLabel("Description", `${BOLT} 40`);
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    await admin.waitForText(`${boltId} — ${BOLT} 40`);

    await admin.waitUntil(ready(button("Deactivate")));
    await admin.clickRole("button", "Deactivate");
    await admin.waitFor("[role=alertdialog]");
    await admin.click("[role=alertdialog] button[data-variant=destructive-solid]");
    await admin.waitUntil(`!document.querySelector("[role=alertdialog]")`);
    await admin.waitUntil(ready(button("Reactivate")));
    expect(await admin.texts("main dd")).toContain("Inactive");

    await admin.open(`${baseUrl}/admin/prod/audit`);
    await admin.waitFor("table");
    const rows = await admin.evaluate<string[][]>(
      `[...document.querySelectorAll("tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim()))`,
    );
    // By label, not ID alone: locations, customers and suppliers number from 00000001 too.
    const ownRows = rows.filter((cells) => cells[5].startsWith(`${boltId} — ${BOLT}`));
    const own = ownRows.map(([, account, , channel, action, , changes]) => [account, channel, action, changes]);
    // One admin session made every change: its short id is on each row (AUD-001).
    const sessions = new Set(ownRows.map(([, , session]) => session));
    expect([...sessions]).toEqual([expect.stringMatching(/^[0-9a-f]{8}$/)]);
    expect(own).toEqual(
      expect.arrayContaining([
        ["admin", "UI", "Material deactivated", "active: yes → no"],
        ["admin", "UI", "Material changed", `description: ${BOLT} → ${BOLT} 40`],
        ["admin", "UI", "Material created", `ID: ${boltId}\ntype: raw\ndescription: ${BOLT}\nbase unit: each\nactive: yes`],
      ]),
    );
  });

  it("shows the conflict when another session changed the material first, and keeps that change (AUD-024)", async () => {
    const id = await createInProd(admin, "raw", CLAMP, "each");
    // Both sessions load the same version and start an edit.
    for (const browser of [admin, other]) {
      await openMaterial(browser, id, true);
      await browser.waitUntil(ready(button("Edit")));
      await browser.clickRole("button", "Edit");
      await browser.waitFor("[role=dialog]");
    }
    await admin.fillLabel("Description", `${CLAMP} stale`);

    await other.fillLabel("Description", `${CLAMP} first`);
    await other.click("[role=dialog] button[type=submit]");
    await other.waitUntil(`!document.querySelector("[role=dialog]")`);
    await other.waitForText(`${id} — ${CLAMP} first`);

    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitFor("[role=dialog] [role=alert]");
    expect(await admin.text("[role=dialog] [role=alert]")).toBe("This material was changed since you loaded the page. Check it and try again.");
    // The page behind the dialog refreshed to the other session's change.
    await admin.waitUntil(`document.querySelector("main h1")?.textContent === ${JSON.stringify(`${id} — ${CLAMP} first`)}`);
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);

    await openMaterial(admin, id, true);
    expect(await admin.text("main h1")).toBe(`${id} — ${CLAMP} first`);
  });

  it("shows a normal user materials and conversions without any control (TEN-004)", async () => {
    await admin.open(`${baseUrl}/admin/users`);
    await admin.waitFor("table");
    await admin.waitUntil(ready(button("Create user")));
    await admin.clickRole("button", "Create user");
    await admin.fillLabel("Username", USERNAME);
    await admin.fillLabel("Initial password", PASSWORD);
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    await signIn(una, baseUrl, PASSWORD, USERNAME);
    await una.waitForText(USERNAME);

    const rows = await listRows(una, "prod");
    expect(rows.find((cells) => cells[0] === boltId)?.[1]).toBe(`${BOLT} 40`);
    // Only the list's own Search button: nothing that changes data.
    expect(await una.evaluate<string[]>(`[...document.querySelectorAll("main button")].map((b) => b.textContent.trim())`)).toEqual(["Search"]);

    await openMaterial(una, boltId, false);
    await una.waitForText("1 case = 12 each");
    expect(await una.evaluate<number>(`document.querySelectorAll("main button").length`)).toBe(0);
  });
});

describe("sorting and searching the materials list, and the unit list (#217)", () => {
  let admin: Browser;
  /** The descriptions of the shown list, in order. */
  const descriptions = () => admin.evaluate<string[]>(`[...document.querySelectorAll("main tbody tr")].map((row) => row.cells[1].innerText.trim())`);
  /** Waits until the page's address has this query and the table under it is the new one. */
  const atQuery = (query: string) =>
    admin.waitUntil(`location.search === ${JSON.stringify(query)} && document.querySelector("main [aria-sort]") && !document.querySelector("main table").closest("[hidden]")`);

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
  });
  afterAll(() => admin.close());

  it("sorts the whole list by a header click, then the other way, marking the sorted column", async () => {
    await admin.open(`${baseUrl}/admin/test/materials`);
    await admin.waitUntil(`document.querySelector("main th[aria-sort=ascending]")?.innerText.trim() === "Material ID"`);

    await clickHydrated(admin, "main th a[href$='sort=description&dir=asc']");
    await atQuery("?sort=description&dir=asc");
    await admin.waitUntil(`document.querySelector("main th[aria-sort=ascending]")?.innerText.trim() === "Description"`);
    const ascending = await descriptions();
    expect(ascending.length).toBeGreaterThanOrEqual(26);
    expect(ascending).toEqual([...ascending].sort());

    await clickHydrated(admin, "main th a[href$='sort=description&dir=desc']");
    await atQuery("?sort=description&dir=desc");
    await admin.waitUntil(`Boolean(document.querySelector("main th[aria-sort=descending]"))`);
    expect(await descriptions()).toEqual([...ascending].reverse());
  });

  it("searches by ID or description across the list, keeping the sort, marking matches, and clears back", async () => {
    await admin.open(`${baseUrl}/admin/test/materials?sort=description&dir=desc`);
    await admin.waitUntil(`Boolean(document.querySelector("main [role=search] input[name=q]")) && Object.keys(document.querySelector("main [role=search] button")).some((key) => key.startsWith("__reactFiber"))`);
    await admin.fill("main [role=search] input[name=q]", "steel sheet");
    await admin.click("main [role=search] button[type=submit]");
    await atQuery("?q=steel+sheet&sort=description&dir=desc");
    await admin.waitFor("main [role=status]");

    const found = await descriptions();
    expect(found.length).toBeGreaterThan(0);
    for (const description of found) expect(description.toLowerCase()).toMatch(/steel.*sheet|sheet.*steel/);
    expect(found).toEqual([...found].sort().reverse());
    expect(await admin.text("main [role=status]")).toBe(`${found.length} result${found.length === 1 ? "" : "s"} for “steel sheet” · Clear search`);
    expect(await admin.evaluate<number>(`document.querySelectorAll("main tbody mark").length`)).toBeGreaterThanOrEqual(found.length * 2);

    await clickHydrated(admin, "main [role=status] a");
    await atQuery("?sort=description&dir=desc");
    await admin.waitUntil(`document.querySelector("main [role=search] input[name=q]").value === "" && !document.querySelector("main [role=status]")`);
    expect((await descriptions()).length).toBeGreaterThan(found.length);
  });

  it("says when a search finds nothing, with the way back", async () => {
    await admin.open(`${baseUrl}/admin/test/materials?q=no+such+material+anywhere`);
    await admin.waitForText("Nothing matches “no such material anywhere”.");
    expect(await admin.text("main [role=status]")).toBe("0 results for “no such material anywhere” · Clear search");
  });

  it("chooses a new material's base unit from the grouped list, and offers its base unit and converted units disabled", async () => {
    await admin.open(`${baseUrl}/admin/prod/materials`);
    await admin.waitUntil(ready(button("Create material")));
    await admin.clickRole("button", "Create material");
    await admin.waitFor("[role=dialog] select[name=baseUnit]");
    expect(await admin.evaluate<string[]>(`[...document.querySelectorAll("[role=dialog] select[name=baseUnit] optgroup")].map((group) => group.label)`)).toEqual([
      "Count",
      "Packaging",
      "Mass",
      "Volume",
      "Length",
      "Area",
      "Time",
    ]);
    await admin.select("[role=dialog] select[name=type]", "raw");
    await admin.fillLabel("Description", SPOOL);
    await admin.select("[role=dialog] select[name=baseUnit]", "spool");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    const id = (await listRows(admin, "prod")).find(([, description]) => description === SPOOL)![0];

    await admin.open(`${baseUrl}/admin/prod/materials/${id}`);
    await admin.waitUntil(ready(button("Add conversion")));
    await admin.clickRole("button", "Add conversion");
    await admin.waitFor("[role=dialog] select[name=unit]");
    await admin.select("[role=dialog] select[name=unit]", "m");
    await admin.fillLabel("Base quantity", "0.002");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    await admin.waitForText("1 m = 0.002 spool");

    await admin.clickRole("button", "Add conversion");
    await admin.waitFor("[role=dialog] select[name=unit]");
    expect(
      await admin.evaluate<string[]>(`[...document.querySelectorAll("[role=dialog] select[name=unit] option:disabled")].map((option) => option.textContent)`),
    ).toEqual(["Choose a unit", "spool (base unit)", "m — metre (already converted)"]);
  });
});
