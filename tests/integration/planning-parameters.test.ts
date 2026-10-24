import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own records: other files share the app, and masters are never deleted.
const USERNAME = "pp-una";
const PASSWORD = "pp una's first password";

/** True once `element` is hydrated, shown, and outside Next.js's hidden staging container. */
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
/** The page's button with exactly this text or accessible name, if any. */
const button = (name: string) =>
  `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === ${JSON.stringify(name)} || b.getAttribute("aria-label") === ${JSON.stringify(name)})`;

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
  await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
  await admin.waitForText(text);
  // The new row is the one that wasn't there: other files create Prod records too.
  return (await listRows(admin, `/admin/prod/${kind}`)).find(([id, name]) => !before.has(id) && name === text)![0];
}

/** Opens a screen's Add dialog once it can be used. */
async function openAdd(admin: Browser, path: string, add: string) {
  await listRows(admin, path);
  await admin.waitUntil(ready(button(add)));
  await admin.clickRole("button", add);
  await admin.waitFor("[role=dialog]");
}

/** Adds a parameter set in Prod; returns the form's error text when it stays open. */
async function addSet(admin: Browser, values: { material: string; location: string; procurement: string; days: string; min: string; multiple: string }) {
  await openAdd(admin, "/admin/prod/planning-parameters", "Add parameters");
  await admin.select("[role=dialog] select[name=material]", values.material);
  await admin.select("[role=dialog] select[name=location]", values.location);
  await admin.select("[role=dialog] select[name=procurement]", values.procurement);
  await admin.fill("[role=dialog] input[name=leadTimeDays]", values.days);
  await admin.fill("[role=dialog] input[name=minimumQuantity]", values.min);
  await admin.fill("[role=dialog] input[name=lotMultiple]", values.multiple);
  await admin.click("[role=dialog] button[type=submit]");
}

/** Adds a safety target in Prod. */
async function addTarget(admin: Browser, material: string, location: string, date: string, quantity: string) {
  await openAdd(admin, "/admin/prod/safety-stock", "Add target");
  await admin.select("[role=dialog] select[name=material]", material);
  await admin.select("[role=dialog] select[name=location]", location);
  expect(await admin.fillDate("[role=dialog] input[name=effectiveFrom]", date)).toBe(date);
  await admin.fill("[role=dialog] input[name=quantity]", quantity);
  await admin.click("[role=dialog] button[type=submit]");
}

const closed = `!document.querySelector("[role=dialog]")`;

/** Opens a row's ⋯ menu on a screen, once hydrated, and picks an item. */
async function rowMenu(admin: Browser, path: string, menu: string, item: string) {
  await listRows(admin, path);
  await admin.waitUntil(ready(button(menu)));
  await admin.clickRole("button", menu);
  await admin.clickRole("menuitem", item);
}

/** Confirms the open destructive confirmation and waits for it to close. */
async function confirmRemoval(admin: Browser) {
  await admin.waitFor("[role=alertdialog]");
  await admin.click("[role=alertdialog] button[data-variant=destructive-solid]");
  await admin.waitUntil(`!document.querySelector("[role=alertdialog]")`);
}

/** The Prod audit's `[action, changes]` rows whose subject starts with `label`. */
async function auditOf(admin: Browser, label: string): Promise<string[][]> {
  await admin.open(`${baseUrl}/admin/prod/audit`);
  await admin.waitFor("table");
  const rows = await admin.evaluate<string[][]>(
    `[...document.querySelectorAll("tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim()))`,
  );
  return rows.filter((cells) => cells[5].startsWith(label)).map(([, , , , action, , changes]) => [action, changes]);
}

describe("planning parameters and safety stock (E03-S03)", () => {
  let admin: Browser;
  let una: Browser;
  let steel: string;
  let panel: string;
  let plant: string;
  let packer: string;

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    const material = (type: string, description: string, baseUnit: string) => async () => {
      await admin.select("[role=dialog] select[name=type]", type);
      await admin.fillLabel("Description", description);
      await admin.fillLabel("Base unit", baseUnit);
    };
    const location = (name: string) => () => admin.fillLabel("Name", name);
    steel = await createInProd(admin, "materials", "Create material", material("raw", "pp-ui steel", "kg"), "pp-ui steel");
    panel = await createInProd(admin, "materials", "Create material", material("intermediate", "pp-ui panel", "each"), "pp-ui panel");
    plant = await createInProd(admin, "locations", "Create location", location("pp-ui plant"), "pp-ui plant");
    packer = await createInProd(admin, "locations", "Create location", location("pp-ui packer"), "pp-ui packer");
  });
  afterAll(() => Promise.all([admin, una].map((browser) => browser.close())));

  it("starts Test with the dataset's sets and targets, reached from the tenant home (TEN-001, D06)", async () => {
    await admin.open(`${baseUrl}/admin/test`);
    await admin.waitUntil(ready(`document.querySelector("main a[href='/admin/test/planning-parameters']")`));
    await admin.click("main a[href='/admin/test/planning-parameters']");
    await admin.waitForText("Planning parameters — Test");
    expect(await admin.title()).toBe("Test · Planning parameters");

    // Other files may add Test rows for their own masters, whose IDs come after the dataset's 26 materials and 4 locations.
    const dataset = (rows: string[][]) => rows.filter(([material, location]) => material.slice(0, 8) <= "00000026" && location.slice(0, 8) <= "00000004");
    const sets = await listRows(admin, "/admin/test/planning-parameters");
    expect(sets[0].slice(0, 6)).toEqual(["00000001 Steel sheet 2 mm", "00000001 Main plant, Wrocław", "Buy", "14", "500 kg", "100 kg"]);
    expect(dataset(sets)).toHaveLength(48);
    const targets = dataset(await listRows(admin, "/admin/test/safety-stock"));
    expect(targets).toHaveLength(50);
    // Two targets rise later in the history, so each of those pairs shows a series of two.
    for (const [material, location] of [["00000019 Locker, 2 compartments", "00000002 Lockers plant, Poznań"], ["00000023 Letterbox, galvanised", "00000003 Sheet-metal plant, Łódź"]]) {
      const series = targets.filter((row) => row[0] === material && row[1] === location).sort((a, b) => a[2].localeCompare(b[2]));
      expect(series).toHaveLength(2);
      expect(series[0][2]).not.toBe(series[1][2]);
      expect(Number.parseFloat(series[1][3])).toBeGreaterThan(Number.parseFloat(series[0][3]));
    }
  });

  it("refuses Make for a raw material next to the field, and keeps Make and Buy per location with the values entered (MAT-014, MAT-015)", async () => {
    await addSet(admin, { material: steel, location: plant, procurement: "make", days: "14", min: "500", multiple: "100" });
    await admin.waitForText("A raw material is always bought: choose Buy.");
    await admin.select("[role=dialog] select[name=procurement]", "buy");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(closed);

    await addSet(admin, { material: panel, location: plant, procurement: "make", days: "2", min: "50", multiple: "0.5" });
    await admin.waitUntil(closed);
    await addSet(admin, { material: panel, location: packer, procurement: "buy", days: "5", min: "0", multiple: "10" });
    await admin.waitUntil(closed);

    const mine = (await listRows(admin, "/admin/prod/planning-parameters"))
      .filter(([material]) => material.endsWith("pp-ui steel") || material.endsWith("pp-ui panel"))
      .map((row) => row.slice(1, 6));
    expect(mine).toEqual([
      [`${plant} pp-ui plant`, "Buy", "14", "500 kg", "100 kg"],
      [`${plant} pp-ui plant`, "Make", "2", "50 each", "0.5 each"],
      [`${packer} pp-ui packer`, "Buy", "5", "0 each", "10 each"],
    ]);
  });

  it("changes a lead time and removes a set, both in the Prod audit (AUD-002)", async () => {
    await rowMenu(admin, "/admin/prod/planning-parameters", `Actions for ${panel} at ${plant}`, "Change");
    await admin.fill("[role=dialog] input[name=leadTimeDays]", "3");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(closed);

    await rowMenu(admin, "/admin/prod/planning-parameters", `Actions for ${steel} at ${plant}`, "Remove");
    await confirmRemoval(admin);
    const sets = await listRows(admin, "/admin/prod/planning-parameters");
    expect(sets.some(([material]) => material.startsWith(steel))).toBe(false);
    expect(sets.find(([material, location]) => material.startsWith(panel) && location.startsWith(plant))?.[3]).toBe("3");

    expect(await auditOf(admin, `${panel} — pp-ui panel at ${plant}`)).toEqual(
      expect.arrayContaining([["Planning parameters changed", "lead time (days): 2 → 3"]]),
    );
    expect((await auditOf(admin, `${steel} — pp-ui steel at ${plant}`)).map(([action]) => action)).toContain("Planning parameters removed");
  });

  it("keeps targets per date with their status today, and refuses a second one on the same date (DEM-017)", async () => {
    await addTarget(admin, steel, plant, "2026-01-01", "100");
    await admin.waitUntil(closed);
    await addTarget(admin, steel, plant, "2099-01-01", "150");
    await admin.waitUntil(closed);
    await addTarget(admin, steel, plant, "2026-01-01", "120");
    await admin.waitForText("This material already has a target at that location on that date.");
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(closed);

    const mine = (await listRows(admin, "/admin/prod/safety-stock")).filter(([material]) => material.endsWith("pp-ui steel"));
    expect(mine.map((row) => row.slice(2, 5))).toEqual([
      ["2026-01-01", "100 kg", "In effect"],
      ["2099-01-01", "150 kg", "Scheduled"],
    ]);
  });

  it("changes a target's quantity and removes a target, from each row's menu", async () => {
    await rowMenu(admin, "/admin/prod/safety-stock", `Actions for ${steel} at ${plant} from 2099-01-01`, "Change target");
    await admin.fill("[role=dialog] input[name=quantity]", "175.5");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(closed);
    const mine = async () =>
      (await listRows(admin, "/admin/prod/safety-stock")).filter(([material]) => material.endsWith("pp-ui steel")).map((row) => row.slice(2, 5));
    expect(await mine()).toEqual([
      ["2026-01-01", "100 kg", "In effect"],
      ["2099-01-01", "175.5 kg", "Scheduled"],
    ]);

    await rowMenu(admin, "/admin/prod/safety-stock", `Actions for ${steel} at ${plant} from 2026-01-01`, "Remove");
    await confirmRemoval(admin);
    expect(await mine()).toEqual([["2099-01-01", "175.5 kg", "Scheduled"]]);
    expect((await auditOf(admin, `${steel} — pp-ui steel at ${plant}`)).map(([action]) => action)).toEqual(
      expect.arrayContaining(["Safety-stock target changed", "Safety-stock target removed"]),
    );
  });

  it("stops offering a deactivated location for new rows, and keeps its existing set (LFC-019)", async () => {
    await listRows(admin, "/admin/prod/locations");
    await admin.waitUntil(ready(button(`Actions for ${packer}`)));
    await admin.clickRole("button", `Actions for ${packer}`);
    await admin.clickRole("menuitem", "Deactivate");
    await admin.waitFor("[role=alertdialog]");
    await admin.click("[role=alertdialog] button[data-variant=destructive-solid]");
    await admin.waitUntil(`!document.querySelector("[role=alertdialog]")`);

    await openAdd(admin, "/admin/prod/planning-parameters", "Add parameters");
    const offered = await admin.evaluate<string[]>(`[...document.querySelectorAll("[role=dialog] select[name=location] option")].map((o) => o.value)`);
    expect(offered).toContain(plant);
    expect(offered).not.toContain(packer);
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(closed);

    const packerRow = (await listRows(admin, "/admin/prod/planning-parameters")).find(([, location]) => location.startsWith(packer));
    expect(packerRow?.[1]).toBe(`${packer} pp-ui packer Inactive`);
  });

  it("stops offering a deactivated material for new sets and targets, and keeps its existing target (MAT-029)", async () => {
    await admin.open(`${baseUrl}/admin/prod/materials/${steel}`);
    await admin.waitUntil(ready(button("Deactivate")));
    await admin.clickRole("button", "Deactivate");
    await admin.waitFor("[role=alertdialog]");
    await admin.click("[role=alertdialog] button[data-variant=destructive-solid]");
    await admin.waitUntil(`!document.querySelector("[role=alertdialog]")`);
    await admin.waitUntil(ready(button("Reactivate")));

    for (const [path, add] of [
      ["/admin/prod/planning-parameters", "Add parameters"],
      ["/admin/prod/safety-stock", "Add target"],
    ]) {
      await openAdd(admin, path, add);
      const offered = await admin.evaluate<string[]>(`[...document.querySelectorAll("[role=dialog] select[name=material] option")].map((o) => o.value)`);
      expect(offered).toContain(panel);
      expect(offered).not.toContain(steel);
      await admin.clickRole("button", "Cancel");
      await admin.waitUntil(closed);
    }

    const steelTarget = (await listRows(admin, "/admin/prod/safety-stock")).find(([material]) => material.startsWith(steel));
    expect(steelTarget?.slice(0, 3)).toEqual([`${steel} pp-ui steel Inactive`, `${plant} pp-ui plant`, "2099-01-01"]);
  });

  it("shows a normal user both lists without any control (TEN-004)", async () => {
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

    for (const path of ["/admin/test/planning-parameters", "/admin/test/safety-stock"]) {
      expect((await listRows(una, path)).length).toBeGreaterThan(0);
      expect(await una.evaluate<number>(`document.querySelectorAll("main button").length`)).toBe(0);
    }
  });
});
