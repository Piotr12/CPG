import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own records: other files share the app, and nothing here is ever deleted.
const USERNAME = "nr-una";
const PASSWORD = "nr una's first password";

/** True once `element` is hydrated, shown, and outside Next.js's hidden staging container. */
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
/** The page's button with exactly this text or accessible name, if any. */
const button = (name: string) =>
  `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === ${JSON.stringify(name)} || b.getAttribute("aria-label") === ${JSON.stringify(name)})`;

/** A kind's list as `[ID, name, status]` rows, once its table is shown. */
async function listRows(browser: Browser, tenant: string, kind: string): Promise<string[][]> {
  await browser.open(`${baseUrl}/admin/${tenant}/${kind}`);
  await browser.waitUntil(`document.querySelector("main table") && !document.querySelector("main table").closest("[hidden]")`);
  return browser.evaluate<string[][]>(
    `[...document.querySelectorAll("main tbody tr")].map((row) => [...row.cells].slice(0, 3).map((cell) => cell.innerText.trim()))`,
  );
}

/** Creates a record in Prod through the Create dialog and returns its new ID, read from the list. */
async function createInProd(admin: Browser, kind: string, create: string, name: string): Promise<string> {
  const before = new Set((await listRows(admin, "prod", kind)).map(([id]) => id));
  await admin.waitUntil(ready(button(create)));
  await admin.clickRole("button", create);
  await admin.fillLabel("Name", name);
  await admin.click("[role=dialog] button[type=submit]");
  await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
  await admin.waitForText(name);
  // The new row is the one that wasn't there: other files may create Prod records too.
  return (await listRows(admin, "prod", kind)).find(([id, text]) => !before.has(id) && text === name)![0];
}

/** Opens a row's ⋯ menu, once hydrated, and picks an item. */
async function rowMenu(admin: Browser, id: string, item: string) {
  await admin.waitUntil(ready(button(`Actions for ${id}`)));
  await admin.clickRole("button", `Actions for ${id}`);
  await admin.clickRole("menuitem", item);
}

/** The Prod audit's rows about `id` of `subject` as `[action, changes]`. */
async function auditOf(admin: Browser, label: string): Promise<string[][]> {
  await admin.open(`${baseUrl}/admin/prod/audit`);
  await admin.waitFor("table");
  const rows = await admin.evaluate<string[][]>(
    `[...document.querySelectorAll("tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim()))`,
  );
  return rows.filter((cells) => cells[5].startsWith(label)).map(([, , , , action, , changes]) => [action, changes]);
}

describe("locations, customers and suppliers (E03-S02)", () => {
  let admin: Browser;
  let una: Browser;

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
  });
  afterAll(() => Promise.all([admin, una].map((browser) => browser.close())));

  it("starts Test with demonstration records of each kind, reached from the tenant home (TEN-001, D06)", async () => {
    for (const [kind, title, first] of [
      ["locations", "Locations", "Main plant, Wrocław"],
      ["customers", "Customers", "Hardware Store Chain Sp. z o.o."],
      ["suppliers", "Suppliers", "Steel Service Centre Sp. z o.o."],
    ]) {
      await admin.open(`${baseUrl}/admin/test`);
      await admin.waitUntil(ready(`document.querySelector("main a[href='/admin/test/${kind}']")`));
      await admin.click(`main a[href='/admin/test/${kind}']`);
      await admin.waitForText(`${title} — Test`);

      expect(await admin.title()).toBe(`Test · ${title}`);
      expect((await listRows(admin, "test", kind))[0]).toEqual(["00000001", first, "Active"]);
    }
  });

  it("gives locations created in Prod consecutive IDs (spec Q2)", async () => {
    const first = await createInProd(admin, "locations", "Create location", "nr-ui north site");
    const second = await createInProd(admin, "locations", "Create location", "nr-ui south site");

    expect(first).toMatch(/^\d{8}$/);
    expect(second).toBe(String(Number(first) + 1).padStart(8, "0"));
  });

  it("names a missing customer name before creating anything", async () => {
    await listRows(admin, "prod", "customers");
    await admin.waitUntil(ready(button("Create customer")));
    await admin.clickRole("button", "Create customer");
    await admin.click("[role=dialog] button[type=submit]");

    await admin.waitForText("Enter a name.");
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
  });

  it("renames a supplier, with the name before and after in the Prod audit (AUD-002)", async () => {
    const id = await createInProd(admin, "suppliers", "Create supplier", "nr-ui fasteners");

    await rowMenu(admin, id, "Edit");
    await admin.fillLabel("Name", "nr-ui fasteners and bolts");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    await admin.waitForText("nr-ui fasteners and bolts");

    expect(await auditOf(admin, id)).toEqual(
      expect.arrayContaining([
        ["Supplier renamed", "name: nr-ui fasteners → nr-ui fasteners and bolts"],
        ["Supplier created", `ID: ${id}\nname: nr-ui fasteners\nactive: yes`],
      ]),
    );
  });

  it("deactivates a location, which stays listed as Inactive, and reactivates it, both audited (AUD-003, LFC-019)", async () => {
    const id = await createInProd(admin, "locations", "Create location", "nr-ui old warehouse");

    await rowMenu(admin, id, "Deactivate");
    await admin.waitFor("[role=alertdialog]");
    await admin.click("[role=alertdialog] button[data-variant=destructive]");
    await admin.waitUntil(`!document.querySelector("[role=alertdialog]")`);
    expect((await listRows(admin, "prod", "locations")).find(([rowId]) => rowId === id)).toEqual([id, "nr-ui old warehouse", "Inactive"]);

    await rowMenu(admin, id, "Reactivate");
    await admin.waitFor("[role=alertdialog]");
    await admin.clickRole("button", "Reactivate");
    await admin.waitUntil(`!document.querySelector("[role=alertdialog]")`);
    expect((await listRows(admin, "prod", "locations")).find(([rowId]) => rowId === id)?.[2]).toBe("Active");

    expect(await auditOf(admin, id)).toEqual(
      expect.arrayContaining([
        ["Location deactivated", "active: yes → no"],
        ["Location reactivated", "active: no → yes"],
      ]),
    );
  });

  it("keeps each row's menu in view on a phone", async () => {
    await listRows(admin, "test", "customers");
    await admin.waitUntil(ready(button("Actions for 00000001")));
    try {
      await admin.setViewport(390, 844);
      const inView = await admin.evaluate<boolean>(`(() => {
        const box = document.querySelector("main table").parentElement;
        const edge = Math.min(box.getBoundingClientRect().right, window.innerWidth);
        const buttons = [...document.querySelectorAll("main tbody button")];
        return buttons.length > 0 && box.scrollWidth <= box.clientWidth &&
          buttons.every((button) => button.getBoundingClientRect().right <= edge);
      })()`);
      expect(inView).toBe(true);
    } finally {
      await admin.setViewport(1280, 720);
    }
  });

  it("shows a normal user every list without any control (TEN-004)", async () => {
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

    for (const kind of ["locations", "customers", "suppliers"]) {
      expect((await listRows(una, "test", kind)).length).toBeGreaterThan(0);
      expect(await una.evaluate<number>(`document.querySelectorAll("main button").length`)).toBe(0);
    }
  });
});
