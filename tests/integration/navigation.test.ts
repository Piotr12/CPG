import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clickHydrated, openBrowser, type Browser } from "./browser";
import {
  choosePreference,
  closeAccountMenu,
  hydrated,
  openAccountMenu,
  restoreDefaultPreferences,
  signedInAndHydrated,
  signIn,
  signInAsAdmin,
} from "./sign-in";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

/** 32 characters, the longest username there is: the sidebar must still fit. */
const NAV_USER = "nav-ursula-with-a-very-long-name";
const NAV_PASSWORD = "nav ursula's first password";

interface Entry {
  label: string;
  href: string;
  current: boolean;
}

/** The sidebar's entries (the tree, not the brand or the switch), in order, with the open screen marked. */
const ENTRIES = "[data-slot=sidebar] [data-slot=sidebar-menu] a";
const sidebarEntries = (browser: Browser) =>
  browser.evaluate<Entry[]>(`[...document.querySelectorAll(${JSON.stringify(ENTRIES)})]
    .map((link) => ({ label: link.textContent.trim(), href: link.getAttribute("href"), current: link.getAttribute("aria-current") === "page" }))`);
const labels = async (browser: Browser) => (await sidebarEntries(browser)).map((entry) => entry.label);
const currentEntry = async (browser: Browser) => (await sidebarEntries(browser)).filter((entry) => entry.current).map((entry) => entry.label);

/** The visitor bar's links. */
const visitorEntries = (browser: Browser) =>
  browser.evaluate<Entry[]>(`[...document.querySelectorAll("[data-visitor-bar] nav a")]
    .map((link) => ({ label: link.textContent, href: link.getAttribute("href"), current: link.getAttribute("aria-current") === "page" }))`);

/** Whether anything sticks out sideways: the page, or the sidebar's, the drawer's or a bar's own content. */
const overflows = (browser: Browser) =>
  browser.evaluate<boolean>(`(() => {
    const boxes = document.querySelectorAll("[data-slot=sidebar-header], [data-slot=sidebar-content], [data-slot=sidebar-footer], [data-mobile-bar], [data-visitor-bar]");
    return document.documentElement.scrollWidth > innerWidth || [...boxes].some((box) => box.offsetParent && box.scrollWidth > box.clientWidth);
  })()`);

/** Where the footer sits against the viewport, measured before any scrolling. */
const footerBox = (browser: Browser) =>
  browser.evaluate<{ top: number; bottom: number; height: number }>(`(() => {
    const box = [...document.querySelectorAll("footer")].at(-1).getBoundingClientRect();
    return { top: box.top + scrollY, bottom: box.bottom + scrollY, height: innerHeight };
  })()`);

/** A side of the TEST | PROD switch in the sidebar. */
const switchLink = (href: string) => `[data-slot=sidebar] [data-tenant-switch] a[href='${href}']`;

/** The tenant header row the page shows: Next.js keeps earlier pages' rows mounted but hidden. */
const shownHeader = `[...document.querySelectorAll("[role=region][data-tenant]")].find((row) => row.offsetParent)`;
const header = (browser: Browser) =>
  browser.evaluate<{ tenant: string; name: string; text: string }>(`(() => {
    const row = ${shownHeader};
    const name = row.getAttribute("aria-labelledby").split(" ").map((id) => document.getElementById(id).textContent).join(" ");
    return { tenant: row.dataset.tenant, name, text: row.textContent };
  })()`);

const sidebar = `document.querySelector("[data-slot=sidebar]")`;
const sidebarWidth = (browser: Browser) =>
  browser.evaluate<number>(`Math.round(document.querySelector("[data-slot=sidebar-container]").getBoundingClientRect().width)`);
const pathname = async (browser: Browser) => new URL(await browser.url()).pathname;

/** Opens a signed-in page and waits until the sidebar has streamed in and React has hydrated it. */
async function openPage(browser: Browser, path: string) {
  await browser.open(`${baseUrl}${path}`);
  await browser.waitUntil(`[...document.querySelectorAll(${JSON.stringify(ENTRIES)})].some((link) => !link.closest("[hidden]") && ${hydrated("link")})`);
}

/** Opens a page as a visitor and waits until the visitor bar is hydrated. */
async function openVisitorPage(browser: Browser, path: string) {
  await browser.open(`${baseUrl}${path}`);
  await browser.waitUntil(hydrated(`document.querySelector("[data-visitor-bar] nav a")`));
}

/** Follows a sidebar entry and waits until the page has arrived and the sidebar marks it. */
async function follow(browser: Browser, href: string, label: string) {
  await clickHydrated(browser, `${ENTRIES}[href='${href}']`);
  await browser.waitUntil(`location.pathname === ${JSON.stringify(href)}`);
  await browser.waitUntil(
    `[...document.querySelectorAll(${JSON.stringify(`${ENTRIES}[aria-current=page]`)})].map((link) => link.textContent.trim()).join() === ${JSON.stringify(label)}`,
  );
}

const ADMIN_TREE = [
  { label: "Overview", href: "/admin/test" },
  { label: "Materials", href: "/admin/test/materials" },
  { label: "Locations", href: "/admin/test/locations" },
  { label: "Customers", href: "/admin/test/customers" },
  { label: "Suppliers", href: "/admin/test/suppliers" },
  { label: "Planning parameters", href: "/admin/test/planning-parameters" },
  { label: "Safety stock", href: "/admin/test/safety-stock" },
  { label: "BOMs", href: "/admin/test/boms" },
  { label: "Import", href: "/admin/test/import" },
  { label: "Customer orders", href: "/admin/test/customer-orders" },
  { label: "Stock", href: "/admin/test/stock" },
  { label: "Audit", href: "/admin/test/audit" },
  { label: "Users", href: "/admin/users" },
  { label: "Tenants", href: "/admin" },
  { label: "Global audit", href: "/admin/audit" },
  { label: "Help", href: "/help" },
];

// Issue #58, spec 2026-10-19--2048UTC-sidebar-navigation: one sidebar on every page, a Test | Prod
// switch, by role, as an icon rail and as a drawer on a phone. The visitor's bar keeps #43's way in.
describe("sidebar navigation", () => {
  let visitor: Browser;
  let admin: Browser;
  let ursula: Browser;

  beforeAll(async () => {
    [visitor, admin, ursula] = [openBrowser(), openBrowser(), openBrowser()];
    await Promise.all([visitor, admin, ursula].map((browser) => browser.setViewport(1280, 800)));
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await createUser(admin, baseUrl, NAV_USER, NAV_PASSWORD);
    await signIn(ursula, baseUrl, NAV_PASSWORD, NAV_USER);
    await ursula.waitUntil(signedInAndHydrated(NAV_USER));
  });
  afterAll(async () => {
    // The admin is shared with every other file; ursula is this file's own account and keeps hers.
    await admin.setViewport(1280, 800);
    await restoreDefaultPreferences(admin, baseUrl, adminPassword);
    await Promise.all([visitor, admin, ursula].map((browser) => browser.close()));
  });

  it("shows a visitor a slim bar with Help and Sign in, and Sign in on the homepage, footer in view at 1280×800", async () => {
    await openVisitorPage(visitor, "/");

    expect(await visitorEntries(visitor)).toEqual([
      { label: "Help", href: "/help", current: false },
      { label: "Sign in", href: "/login", current: false },
    ]);
    expect(await visitor.evaluate<boolean>(`!document.querySelector("[data-slot=sidebar-container], [data-mobile-bar]")`)).toBe(true);
    expect(await visitor.text("main a[href='/login']")).toBe("Sign in");
    const footer = await footerBox(visitor);
    expect(footer.bottom).toBeLessThanOrEqual(footer.height);

    await visitor.click("main a[href='/login']");
    await visitor.waitFor("#username");
    expect(await pathname(visitor)).toBe("/login");
    await visitor.waitUntil(`document.querySelector("[data-visitor-bar] a[href='/login']").getAttribute("aria-current") === "page"`);
  });

  it("offers a signed-in account Open CPG on the homepage, with the sidebar beside it and the footer in view", async () => {
    await openPage(ursula, "/");

    expect(await ursula.text("main a[href='/admin']")).toBe("Open CPG");
    expect(await ursula.evaluate<boolean>(`!document.querySelector("main a[href='/login']")`)).toBe(true);
    const footer = await footerBox(ursula);
    expect(footer.bottom).toBeLessThanOrEqual(footer.height);
  });

  it("gives the admin every screen at 1280 px, each one click away and marked on arrival", async () => {
    await openPage(admin, "/admin/test/materials");

    expect(await sidebarEntries(admin)).toEqual(ADMIN_TREE.map((entry) => ({ ...entry, current: entry.label === "Materials" })));
    expect(await sidebarWidth(admin)).toBe(256);

    for (const { label, href } of ADMIN_TREE) await follow(admin, href, label);
    expect(await pathname(admin)).toBe("/help");
  });

  it("switches tenant on the same screen and back, and from a record to the other tenant's list (TEN-010, TEN-012)", async () => {
    await openPage(admin, "/admin/test/materials");

    await clickHydrated(admin, switchLink("/admin/prod/materials"));
    await admin.waitUntil(`location.pathname === "/admin/prod/materials" && ${shownHeader}?.dataset.tenant === "prod"`);
    expect(await currentEntry(admin)).toEqual(["Materials"]);
    expect(await admin.evaluate<string>(`document.querySelector("[data-slot=sidebar] [data-tenant-switch] [aria-current=page]").textContent`)).toBe("Prod");

    await clickHydrated(admin, switchLink("/admin/test/materials"));
    await admin.waitUntil(`location.pathname === "/admin/test/materials" && ${shownHeader}?.dataset.tenant === "test"`);

    await openPage(admin, "/admin/test/materials/00000001");
    await clickHydrated(admin, switchLink("/admin/prod/materials"));
    await admin.waitUntil(`location.pathname === "/admin/prod/materials"`);
  });

  it("lets a normal user switch from Prod to Test and back in the sidebar at 1280 px, with no other step (TEN-010)", async () => {
    await openPage(ursula, "/admin/prod/materials");
    const current = () =>
      ursula.evaluate<string>(`document.querySelector("[data-slot=sidebar] [data-tenant-switch] [aria-current=page]").textContent`);
    await ursula.waitUntil(`${shownHeader}?.dataset.tenant === "prod"`);
    expect(await current()).toBe("Prod");

    await clickHydrated(ursula, switchLink("/admin/test/materials"));
    await ursula.waitUntil(`location.pathname === "/admin/test/materials" && ${shownHeader}?.dataset.tenant === "test"`);
    expect(await current()).toBe("Test");
    expect(await currentEntry(ursula)).toEqual(["Materials"]);
    // Test's own first material, shown: the Prod page stays mounted but hidden (display: none), and may have a 00000001 too.
    await ursula.waitUntil(
      `[...document.querySelectorAll("main tbody tr")].some((row) => row.offsetParent && row.innerText.startsWith("00000001\\tSteel sheet 2 mm"))`,
    );

    await clickHydrated(ursula, switchLink("/admin/prod/materials"));
    await ursula.waitUntil(`location.pathname === "/admin/prod/materials" && ${shownHeader}?.dataset.tenant === "prod"`);
    expect(await current()).toBe("Prod");
  });

  it("names the scope in the header row: TEST or PROD on tenant pages, GLOBAL and shared elsewhere (TEN-011)", async () => {
    await openPage(admin, "/admin/prod/customers");
    await admin.waitUntil(`${shownHeader}?.textContent.includes("Customers")`);
    expect(await header(admin)).toMatchObject({ tenant: "prod", name: "PROD Active tenant", text: expect.stringContaining("Master data") });

    await openPage(admin, "/admin/users");
    await admin.waitUntil(`${shownHeader}?.textContent.includes("Users")`);
    expect(await header(admin)).toMatchObject({
      tenant: "global",
      name: "GLOBAL Shared by Test and Prod — switching tenant doesn't change this page",
    });
    // A fresh load of a shared page targets Test; the switch re-targets the tree without leaving the page (Q7).
    expect(await admin.evaluate<string>(`document.querySelector("[data-slot=sidebar] [data-tenant-switch]").getAttribute("aria-label")`)).toBe(
      "Menu shows: Test",
    );
    await clickHydrated(admin, "[data-slot=sidebar] [data-tenant-switch] button[aria-pressed=false]");
    await admin.waitUntil(`!!document.querySelector("[data-slot=sidebar] a[href='/admin/prod/materials']")`);
    expect(await admin.evaluate<string>(`document.querySelector("[data-slot=sidebar] [data-tenant-switch]").getAttribute("aria-label")`)).toBe(
      "Menu shows: Prod",
    );
    expect(await pathname(admin)).toBe("/admin/users");
  });

  it("gives a normal user no Administration, and /admin/users still sends them back (regression)", async () => {
    await openPage(ursula, "/admin/tokens");

    expect(await labels(ursula)).toEqual([
      "Overview",
      "Materials",
      "Locations",
      "Customers",
      "Suppliers",
      "Planning parameters",
      "Safety stock",
      "BOMs",
      "Customer orders",
      "Stock",
      "Audit",
      "Global audit",
      "Help",
    ]);
    expect(await currentEntry(ursula)).toEqual([]);
    expect(await ursula.evaluate<string>(`document.querySelector("[data-slot=sidebar] [data-action=account-menu]").dataset.active`)).toBe("true");

    await ursula.open(`${baseUrl}/admin/users`);
    await ursula.waitUntil(`location.pathname === "/admin"`);
    await ursula.waitFor("main h1");
    expect(await pathname(ursula)).toBe("/admin");
  });

  it("collapses to an icon rail, where the Master data fly-out reaches Locations, and expands back", async () => {
    await openPage(admin, "/admin/test/materials");

    await clickHydrated(admin, "[data-action=toggle-sidebar]");
    await admin.waitUntil(`${sidebar}.dataset.state === "collapsed"`);
    await admin.waitUntil(`Math.round(document.querySelector("[data-slot=sidebar-container]").getBoundingClientRect().width) === 48`);
    expect(await overflows(admin)).toBe(false);

    await clickHydrated(admin, "[data-group=masterData]");
    await admin.waitUntil(`!!document.querySelector("[role=menu] a[href='/admin/test/locations']")`);
    await admin.click("[role=menu] a[href='/admin/test/locations']");
    await admin.waitUntil(`location.pathname === "/admin/test/locations" && !document.querySelector("[role=menu]")`);
    expect(await admin.evaluate<string>(`${sidebar}.dataset.state`)).toBe("collapsed");

    await clickHydrated(admin, "[data-action=toggle-sidebar]");
    await admin.waitUntil(`${sidebar}.dataset.state === "expanded"`);
    await admin.waitUntil(`Math.round(document.querySelector("[data-slot=sidebar-container]").getBoundingClientRect().width) === 256`);
    expect(await currentEntry(admin)).toEqual(["Locations"]);
  });

  describe.each([
    ["the normal user", () => ursula, false],
    ["the admin", () => admin, true],
  ] as const)("at 390 px, for %s", (_, who, isAdmin) => {
    const menuButton = `document.querySelector("[data-action=open-menu]")`;
    const drawer = "[data-slot=sidebar][data-mobile=true]";

    it("opens the drawer from Menu, closes it with Escape and gives focus back to Menu", async () => {
      const browser = who();
      await browser.setViewport(390, 844);
      await browser.open(`${baseUrl}/admin/test`);
      await browser.waitUntil(`${hydrated(menuButton)} && !!${menuButton}.offsetParent`);
      expect(await overflows(browser)).toBe(false);

      await browser.click("[data-action=open-menu]");
      await browser.waitUntil(`!!document.querySelector(${JSON.stringify(`${drawer} a[href='/admin/test/materials']`)})`);
      expect(await browser.evaluate<boolean>(`!!document.querySelector(${JSON.stringify(`${drawer} [data-group=administration]`)})`)).toBe(isAdmin);
      expect(await overflows(browser)).toBe(false);

      await browser.press("Escape");
      await browser.waitUntil(`!document.querySelector(${JSON.stringify(drawer)})`);
      await browser.waitUntil(`document.activeElement === ${menuButton}`);
    });

    it("closes the drawer when one of its links is followed", async () => {
      const browser = who();
      await browser.click("[data-action=open-menu]");
      await browser.waitUntil(`!!document.querySelector(${JSON.stringify(`${drawer} a[href='/admin/test/suppliers']`)})`);
      await clickHydrated(browser, `${drawer} a[href='/admin/test/suppliers']`);
      await browser.waitUntil(`location.pathname === "/admin/test/suppliers" && !document.querySelector(${JSON.stringify(drawer)})`);
    });

    it("switches tenant from the top bar, one tap away", async () => {
      const browser = who();
      await clickHydrated(browser, "[data-mobile-bar] [data-tenant-switch] a[href='/admin/prod/suppliers']");
      await browser.waitUntil(`location.pathname === "/admin/prod/suppliers" && ${shownHeader}?.dataset.tenant === "prod"`);
      expect(await overflows(browser)).toBe(false);
      await browser.setViewport(1280, 800);
    });
  });

  it("keeps the footer within two screens of the top of the homepage at 390×844", async () => {
    await ursula.setViewport(390, 844);
    try {
      await ursula.open(`${baseUrl}/`);
      await ursula.waitUntil(signedInAndHydrated(NAV_USER));

      const footer = await footerBox(ursula);
      expect(footer.top).toBeLessThan(2 * footer.height);
      expect(await overflows(ursula)).toBe(false);
    } finally {
      await ursula.setViewport(1280, 800);
    }
  });

  it("fits at 1280 px in Polish and dark with the longest username, its account card speaking Polish", async () => {
    await openPage(ursula, "/admin/test/materials");
    await choosePreference(ursula, "pl");
    await choosePreference(ursula, "dark");
    await closeAccountMenu(ursula);

    await openPage(ursula, "/admin/test/materials");
    expect(await labels(ursula)).toEqual([
      "Przegląd",
      "Materiały",
      "Lokalizacje",
      "Klienci",
      "Dostawcy",
      "Parametry planowania",
      "Zapas bezpieczeństwa",
      "BOM-y",
      "Zamówienia klientów",
      "Zapas",
      "Audyt",
      "Audyt globalny",
      "Pomoc",
    ]);
    expect(await ursula.evaluate<boolean>(`document.documentElement.classList.contains("dark")`)).toBe(true);
    expect(await overflows(ursula)).toBe(false);
    // The long name truncates inside the card instead of widening the sidebar.
    expect(await sidebarWidth(ursula)).toBe(256);

    const panel = await openAccountMenu(ursula);
    expect(await ursula.evaluate<string | null>(`document.querySelector("[data-slot=popover-content]").getAttribute("lang")`)).toBe("pl");
    expect(await ursula.text(`${panel} form[data-action=sign-out] button`)).toBe("Wyloguj");
    expect(await ursula.text(`${panel} a[href='/admin/tokens']`)).toBe("Tokeny API");
    expect(await ursula.text(`${panel} strong`)).toBe(NAV_USER);
    expect(await overflows(ursula)).toBe(false);
    await closeAccountMenu(ursula);
  });
});
