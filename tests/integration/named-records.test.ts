import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clickHydrated, openBrowser, type Browser } from "./browser";
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

/** The Prod audit's rows whose subject starts with `label`, as cells: time, account, session, channel, action, subject, changes. */
async function auditRows(admin: Browser, label: string): Promise<string[][]> {
  await admin.open(`${baseUrl}/admin/prod/audit`);
  await admin.waitFor("table");
  const rows = await admin.evaluate<string[][]>(
    `[...document.querySelectorAll("tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim()))`,
  );
  return rows.filter((cells) => cells[5].startsWith(label));
}

/** The Prod audit's rows whose subject starts with `label`, as `[action, changes]`. */
const auditOf = async (admin: Browser, label: string) =>
  (await auditRows(admin, label)).map(([, , , , action, , changes]) => [action, changes]);

describe("locations, customers and suppliers (E03-S02)", () => {
  let admin: Browser;
  let una: Browser;
  /** A second admin session, for two people working on one record (AUD-024). */
  let other: Browser;

  beforeAll(async () => {
    [admin, una, other] = [openBrowser(), openBrowser(), openBrowser()];
    await Promise.all([signInAsAdmin(admin, baseUrl, adminPassword), signInAsAdmin(other, baseUrl, adminPassword)]);
  });
  afterAll(() => Promise.all([admin, una, other].map((browser) => browser.close())));

  it("starts Test with the dataset's records of each kind, reached from the tenant home (TEN-001, D06)", async () => {
    // The first and last of the dataset's one plant, 4 customers and 2 suppliers; other files may add Test records after them.
    for (const [kind, title, first, last] of [
      ["locations", "Locations", "Main plant, Wrocław", "00000001 Main plant, Wrocław"],
      ["customers", "Customers", "Hardware Store Chain Sp. z o.o.", "00000004 Export distributor (DE)"],
      ["suppliers", "Suppliers", "Steel Service Centre Sp. z o.o.", "00000002 Industrial Supplies Wholesale Sp. z o.o."],
    ]) {
      await admin.open(`${baseUrl}/admin/test`);
      await admin.waitUntil(ready(`document.querySelector("main a[href='/admin/test/${kind}']")`));
      await admin.click(`main a[href='/admin/test/${kind}']`);
      await admin.waitForText(`${title} — Test`);

      expect(await admin.title()).toBe(`Test · ${title}`);
      const rows = await listRows(admin, "test", kind);
      expect(rows[0]).toEqual(["00000001", first, "Active"]);
      const count = Number(last.slice(0, 8));
      expect(rows.slice(0, count).map(([id]) => Number(id))).toEqual(Array.from({ length: count }, (_, index) => index + 1));
      expect(rows[count - 1]).toEqual([last.slice(0, 8), last.slice(9), "Active"]);
    }
  });

  it("gives locations created in Prod consecutive IDs (spec Q2)", async () => {
    const first = await createInProd(admin, "locations", "Create location", "nr-ui north site");
    const second = await createInProd(admin, "locations", "Create location", "nr-ui south site");

    expect(first).toMatch(/^\d{8}$/);
    expect(second).toBe(String(Number(first) + 1).padStart(8, "0"));
  });

  it("names a missing customer name before creating anything", async () => {
    const before = await listRows(admin, "prod", "customers");
    await admin.waitUntil(ready(button("Create customer")));
    await admin.clickRole("button", "Create customer");
    await admin.click("[role=dialog] button[type=submit]");

    await admin.waitForText("Enter a name.");
    expect(await admin.text("[role=dialog]")).toContain("Enter a name.");
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    expect(await listRows(admin, "prod", "customers")).toEqual(before);
  });

  it("creates a customer in Prod and renames it, with both in the Prod audit (#192)", async () => {
    const id = await createInProd(admin, "customers", "Create customer", "nr-ui hardware outlet");
    expect(id).toMatch(/^\d{8}$/);
    expect((await listRows(admin, "prod", "customers")).find(([rowId]) => rowId === id)).toEqual([id, "nr-ui hardware outlet", "Active"]);

    await rowMenu(admin, id, "Edit");
    await admin.fillLabel("Name", "nr-ui hardware outlet north");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    await admin.waitForText("nr-ui hardware outlet north");
    expect((await listRows(admin, "prod", "customers")).find(([rowId]) => rowId === id)).toEqual([id, "nr-ui hardware outlet north", "Active"]);

    expect(await auditOf(admin, `${id} — nr-ui hardware outlet`)).toEqual(
      expect.arrayContaining([
        ["Customer renamed", "name: nr-ui hardware outlet → nr-ui hardware outlet north"],
        ["Customer created", `ID: ${id}\nname: nr-ui hardware outlet\nactive: yes`],
      ]),
    );
  });

  it("renames a supplier, with the name before and after in the Prod audit (AUD-002)", async () => {
    const id = await createInProd(admin, "suppliers", "Create supplier", "nr-ui fasteners");

    await rowMenu(admin, id, "Edit");
    await admin.fillLabel("Name", "nr-ui fasteners and bolts");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    await admin.waitForText("nr-ui fasteners and bolts");

    // By label, not ID alone: each kind numbers on its own, so another file's location may share the ID.
    const rows = await auditRows(admin, `${id} — nr-ui fasteners`);
    expect(rows.map(([, account, , channel, action, , changes]) => [account, channel, action, changes])).toEqual(
      expect.arrayContaining([
        ["admin", "UI", "Supplier renamed", "name: nr-ui fasteners → nr-ui fasteners and bolts"],
        ["admin", "UI", "Supplier created", `ID: ${id}\nname: nr-ui fasteners\nactive: yes`],
      ]),
    );
    // One admin session made both changes: its short id is on each row (AUD-001).
    expect([...new Set(rows.map(([, , session]) => session))]).toEqual([expect.stringMatching(/^[0-9a-f]{8}$/)]);
  });

  it("deactivates a location, which stays listed as Inactive, and reactivates it, both audited (AUD-003, LFC-019)", async () => {
    const id = await createInProd(admin, "locations", "Create location", "nr-ui old warehouse");

    await rowMenu(admin, id, "Deactivate");
    await admin.waitFor("[role=alertdialog]");
    await admin.click("[role=alertdialog] button[data-variant=destructive-solid]");
    await admin.waitUntil(`!document.querySelector("[role=alertdialog]")`);
    expect((await listRows(admin, "prod", "locations")).find(([rowId]) => rowId === id)).toEqual([id, "nr-ui old warehouse", "Inactive"]);

    await rowMenu(admin, id, "Reactivate");
    await admin.waitFor("[role=alertdialog]");
    await admin.clickRole("button", "Reactivate");
    await admin.waitUntil(`!document.querySelector("[role=alertdialog]")`);
    expect((await listRows(admin, "prod", "locations")).find(([rowId]) => rowId === id)?.[2]).toBe("Active");

    expect(await auditOf(admin, `${id} — nr-ui old warehouse`)).toEqual(
      expect.arrayContaining([
        ["Location deactivated", "active: yes → no"],
        ["Location reactivated", "active: no → yes"],
      ]),
    );
  });

  it("shows the conflict when another session renamed the location first, and keeps that name (AUD-024)", async () => {
    const id = await createInProd(admin, "locations", "Create location", "nr-ui dock");
    // Both sessions load the same version and open the rename.
    for (const browser of [admin, other]) {
      await listRows(browser, "prod", "locations");
      await rowMenu(browser, id, "Edit");
      await browser.waitFor("[role=dialog]");
    }
    await admin.fillLabel("Name", "nr-ui dock stale");

    await other.fillLabel("Name", "nr-ui dock first");
    await other.click("[role=dialog] button[type=submit]");
    await other.waitUntil(`!document.querySelector("[role=dialog]")`);
    await other.waitForText("nr-ui dock first");

    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitFor("[role=dialog] [role=alert]");
    expect(await admin.text("[role=dialog] [role=alert]")).toBe("This location was changed since you loaded the page. Check it and try again.");
    // The list behind the dialog refreshed to the other session's name.
    await admin.waitUntil(
      `[...document.querySelectorAll("main tbody tr")].some((row) => row.cells[0].innerText.trim() === ${JSON.stringify(id)} && row.cells[1].innerText.trim() === "nr-ui dock first")`,
    );
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);

    expect((await listRows(admin, "prod", "locations")).find(([rowId]) => rowId === id)).toEqual([id, "nr-ui dock first", "Active"]);
  });

  it("keeps each row's menu reachable on a phone: the table scrolls, the page doesn't", async () => {
    await listRows(admin, "test", "customers");
    await admin.waitUntil(ready(button("Actions for 00000001")));
    try {
      await admin.setViewport(390, 844);
      // The design system's tables scroll sideways in their own labelled region with the ID column sticky,
      // so a menu may start out of view; scrolled to, it sits inside the region and the window.
      const reachable = await admin.evaluate<boolean>(`(() => {
        const box = document.querySelector("main [data-slot=table-container]");
        const buttons = [...box.querySelectorAll("tbody button")];
        const pageFits = document.documentElement.scrollWidth <= window.innerWidth;
        return pageFits && box.getAttribute("role") === "region" && box.tabIndex === 0 && buttons.length > 0 &&
          buttons.every((button) => {
            button.scrollIntoView({ block: "nearest", inline: "nearest" });
            const edge = Math.min(box.getBoundingClientRect().right, window.innerWidth);
            const sticky = box.querySelector("tbody td").getBoundingClientRect().right;
            const { left, right } = button.getBoundingClientRect();
            return right <= edge + 0.5 && left >= sticky - 0.5;
          });
      })()`);
      expect(reachable).toBe(true);
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
      // Only the list's own Search button: nothing that changes data.
      expect(await una.evaluate<string[]>(`[...document.querySelectorAll("main button")].map((b) => b.textContent.trim())`)).toEqual(["Search"]);
    }
  });
});

describe.each([
  ["locations", "Search locations"],
  ["customers", "Search customers"],
  ["suppliers", "Search suppliers"],
])("sorting and searching the %s list (#217)", (kind, searchLabel) => {
  let admin: Browser;
  /** The shown rows as `[ID, name]`, in order. */
  const shown = () => admin.evaluate<string[][]>(`[...document.querySelectorAll("main tbody tr")].map((row) => [...row.cells].slice(0, 2).map((cell) => cell.innerText.trim()))`);
  /** Waits until the page's address has this query and the table under it is the new one. */
  const atQuery = (query: string) =>
    admin.waitUntil(`location.search === ${JSON.stringify(query)} && document.querySelector("main [aria-sort]") && !document.querySelector("main table").closest("[hidden]")`);

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
  });
  afterAll(() => admin.close());

  it("sorts by ID the other way, then by name, with a header click", async () => {
    await admin.open(`${baseUrl}/admin/test/${kind}`);
    await admin.waitUntil(`document.querySelector("main th[aria-sort=ascending]")?.innerText.trim() === "ID"`);
    const byId = await shown();

    await clickHydrated(admin, "main th a[href$='sort=id&dir=desc']");
    await atQuery("?sort=id&dir=desc");
    expect(await shown()).toEqual([...byId].reverse());

    await clickHydrated(admin, "main th a[href$='sort=name&dir=asc']");
    await atQuery("?sort=name&dir=asc");
    await admin.waitUntil(`document.querySelector("main th[aria-sort=ascending]")?.innerText.trim() === "Name"`);
    const byName = await shown();
    expect(byName).toEqual([...byId].sort(([a, x], [b, y]) => (x < y ? -1 : x > y ? 1 : a.localeCompare(b))));
  });

  it("searches the ID and name, keeping the sort, marking matches, and clears back", async () => {
    await admin.open(`${baseUrl}/admin/test/${kind}?sort=name&dir=desc`);
    await atQuery("?sort=name&dir=desc");
    await admin.waitUntil(`Boolean(document.querySelector("main [role=search] input[name=q]")) && Object.keys(document.querySelector("main [role=search] button")).some((key) => key.startsWith("__reactFiber"))`);
    expect(await admin.text("main [role=search] label")).toBe(searchLabel);
    const all = await shown();
    // A word of the last name, so the search has something to find and, usually, something to leave out.
    const word = all.at(-1)![1].split(/[\s,]+/)[0];
    await admin.fill("main [role=search] input[name=q]", word);
    await admin.click("main [role=search] button[type=submit]");
    await atQuery(`?q=${encodeURIComponent(word)}&sort=name&dir=desc`);
    await admin.waitFor("main [role=status]");

    const found = await shown();
    expect(found).toEqual(all.filter(([id, name]) => `${id} ${name}`.toLowerCase().includes(word.toLowerCase())));
    expect(await admin.text("main [role=status]")).toBe(`${found.length} result${found.length === 1 ? "" : "s"} for “${word}” · Clear search`);
    expect(await admin.evaluate<number>(`document.querySelectorAll("main tbody mark").length`)).toBeGreaterThanOrEqual(found.length);

    await clickHydrated(admin, "main [role=status] a");
    await atQuery("?sort=name&dir=desc");
    await admin.waitUntil(`document.querySelector("main [role=search] input[name=q]").value === "" && !document.querySelector("main [role=status]")`);
    expect(await shown()).toEqual(all);
  });
});
