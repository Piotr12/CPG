import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import {
  choosePreference,
  closeAccountMenu,
  openAccountMenu,
  restoreDefaultPreferences,
  signedInAs,
  signIn,
  signInAsAdmin,
} from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

/** 32 characters, the longest username there is: the bar must still fit at 768 px. */
const NAV_USER = "nav-ursula-with-a-very-long-name";
const NAV_PASSWORD = "nav ursula's first password";

interface Entry {
  label: string;
  href: string;
  current: boolean;
}

/** The bar's inline entries (from 768 px), with which one is marked as the open screen. */
const inlineEntries = (browser: Browser) =>
  browser.evaluate<Entry[]>(`[...document.querySelectorAll("header nav a")]
    .filter((link) => !link.closest("[hidden]"))
    .map((link) => ({ label: link.textContent, href: link.getAttribute("href"), current: link.getAttribute("aria-current") === "page" }))`);
const labels = async (browser: Browser) => (await inlineEntries(browser)).map((entry) => entry.label);
const currentEntry = async (browser: Browser) => (await inlineEntries(browser)).filter((entry) => entry.current).map((entry) => entry.label);

/** Whether anything sticks out sideways: the page, or the bar's own content. */
const overflows = (browser: Browser) =>
  browser.evaluate<boolean>(`(() => {
    const bar = document.querySelector("header");
    return document.documentElement.scrollWidth > innerWidth || bar.scrollWidth > bar.clientWidth;
  })()`);

/** Where the footer sits against the viewport, measured before any scrolling. */
const footerBox = (browser: Browser) =>
  browser.evaluate<{ top: number; bottom: number; height: number }>(`(() => {
    const box = [...document.querySelectorAll("footer")].at(-1).getBoundingClientRect();
    return { top: box.top + scrollY, bottom: box.bottom + scrollY, height: innerHeight };
  })()`);

/** Opens a page and waits until the bar has streamed in and React has hydrated it. */
async function openPage(browser: Browser, path: string) {
  await browser.open(`${baseUrl}${path}`);
  await browser.waitUntil(
    `[...document.querySelectorAll("header nav a")].some((link) => !link.closest("[hidden]") && Object.keys(link).some((key) => key.startsWith("__reactFiber")))`,
  );
}

const pathname = async (browser: Browser) => new URL(await browser.url()).pathname;

/** Creates a normal user on /admin/users. */
async function createUser(admin: Browser, username: string, password: string) {
  await admin.open(`${baseUrl}/admin/users`);
  await admin.waitFor("table");
  await admin.clickRole("button", "Create user");
  await admin.fillLabel("Username", username);
  await admin.fillLabel("Initial password", password);
  await admin.click("[role=dialog] button[type=submit]");
  await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
  await admin.waitForText(username);
}

// Issue #43: one menu on every page, by role, usable on a phone; a way in from the homepage.
describe("navigation menu", () => {
  let visitor: Browser;
  let admin: Browser;
  let ursula: Browser;

  beforeAll(async () => {
    [visitor, admin, ursula] = [openBrowser(), openBrowser(), openBrowser()];
    await Promise.all([visitor, admin, ursula].map((browser) => browser.setViewport(1280, 800)));
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await createUser(admin, NAV_USER, NAV_PASSWORD);
    await signIn(ursula, baseUrl, NAV_PASSWORD, NAV_USER);
    await ursula.waitUntil(signedInAs(NAV_USER));
  });
  afterAll(async () => {
    // The admin is shared with every other file; ursula is this file's own account and keeps hers.
    await admin.setViewport(1280, 800);
    await restoreDefaultPreferences(admin, baseUrl, adminPassword);
    await Promise.all([visitor, admin, ursula].map((browser) => browser.close()));
  });

  it("shows a visitor Sign in on the homepage, with the footer in view at 1280×800", async () => {
    await openPage(visitor, "/");

    expect(await inlineEntries(visitor)).toEqual([
      { label: "Help", href: "/help", current: false },
      { label: "Sign in", href: "/login", current: false },
    ]);
    expect(await visitor.text("main a[href='/login']")).toBe("Sign in");
    const footer = await footerBox(visitor);
    expect(footer.bottom).toBeLessThanOrEqual(footer.height);

    await visitor.click("main a[href='/login']");
    await visitor.waitFor("#username");
    expect(await pathname(visitor)).toBe("/login");
  });

  it("marks Sign in as the open screen on the sign-in page", async () => {
    await openPage(visitor, "/login");

    expect(await currentEntry(visitor)).toEqual(["Sign in"]);
  });

  it("offers a signed-in account Open CPG on the homepage instead, footer still in view", async () => {
    await openPage(ursula, "/");

    expect(await ursula.text("main a[href='/admin']")).toBe("Open CPG");
    expect(await ursula.evaluate<boolean>(`!document.querySelector("main a[href='/login']")`)).toBe(true);
    const footer = await footerBox(ursula);
    expect(footer.bottom).toBeLessThanOrEqual(footer.height);
  });

  it("gives the admin every screen, Users included, and marks the open one", async () => {
    await openPage(admin, "/admin");

    expect(await inlineEntries(admin)).toEqual([
      { label: "Tenants", href: "/admin", current: true },
      { label: "Test", href: "/admin/test", current: false },
      { label: "Prod", href: "/admin/prod", current: false },
      { label: "Audit", href: "/admin/audit", current: false },
      { label: "API tokens", href: "/admin/tokens", current: false },
      { label: "Users", href: "/admin/users", current: false },
      { label: "Help", href: "/help", current: false },
    ]);

    await admin.clickRole("link", "Users");
    await admin.waitFor("table");
    expect(await pathname(admin)).toBe("/admin/users");
    expect(await currentEntry(admin)).toEqual(["Users"]);

    await openPage(admin, "/admin/test/audit");
    expect(await currentEntry(admin)).toEqual(["Test"]);
  });

  it("gives a normal user no Users entry, and /admin/users still sends them back (regression)", async () => {
    await openPage(ursula, "/admin/tokens");

    expect(await labels(ursula)).toEqual(["Tenants", "Test", "Prod", "Audit", "API tokens", "Help"]);
    expect(await currentEntry(ursula)).toEqual(["API tokens"]);

    await ursula.open(`${baseUrl}/admin/users`);
    await ursula.waitUntil(`location.pathname === "/admin"`);
    await ursula.waitFor("main h1");
    expect(await pathname(ursula)).toBe("/admin");
  });

  it("opens the menu from a button at 360 px, closes it with Escape and gives focus back", async () => {
    await ursula.setViewport(360, 800);
    await openPage(ursula, "/admin");
    const menuButton = `document.querySelector("header [data-action=open-menu]")`;
    await ursula.waitUntil(`Object.keys(${menuButton} ?? {}).some((key) => key.startsWith("__reactFiber"))`);

    // The inline entries and the account button give way to the Menu button.
    expect(await ursula.evaluate<boolean>(`!!document.querySelector("header nav").offsetParent`)).toBe(false);
    expect(await overflows(ursula)).toBe(false);

    await ursula.clickRole("button", "Menu");
    await ursula.waitUntil(`!!document.querySelector("[role=dialog] nav")`);
    expect(
      await ursula.evaluate<string[]>(`[...document.querySelectorAll("[role=dialog] nav a")].map((link) => link.textContent)`),
    ).toEqual(["Tenants", "Test", "Prod", "Audit", "API tokens", "Help"]);
    expect(await ursula.evaluate<string | null>(`document.querySelector("[role=dialog] a[aria-current=page]")?.textContent ?? null`)).toBe(
      "Tenants",
    );
    expect(await ursula.evaluate<boolean>(`!!document.querySelector("[role=dialog] form[data-action=sign-out]")`)).toBe(true);
    expect(await overflows(ursula)).toBe(false);

    await ursula.press("Escape");
    await ursula.waitUntil(`!document.querySelector("[role=dialog]")`);
    await ursula.waitUntil(`document.activeElement === ${menuButton}`);
  });

  it("follows an entry from the sheet and closes it", async () => {
    await ursula.clickRole("button", "Menu");
    await ursula.waitUntil(`!!document.querySelector("[role=dialog] nav")`);
    await ursula.click("[role=dialog] nav a[href='/admin/tokens']");
    await ursula.waitUntil(`location.pathname === "/admin/tokens" && !document.querySelector("[role=dialog]")`);

    expect(await pathname(ursula)).toBe("/admin/tokens");
  });

  it("keeps the footer within two screens of the top of the homepage at 360×800", async () => {
    await openPage(ursula, "/");

    const footer = await footerBox(ursula);
    expect(footer.top).toBeLessThan(2 * footer.height);
    expect(await overflows(ursula)).toBe(false);
  });

  it("fits the bar at 768 px in Polish and dark, with the longest username", async () => {
    await ursula.setViewport(1280, 800);
    await openPage(ursula, "/admin");
    await choosePreference(ursula, "pl");
    await choosePreference(ursula, "dark");
    await closeAccountMenu(ursula);

    await ursula.setViewport(768, 800);
    await openPage(ursula, "/admin");

    expect(await labels(ursula)).toEqual(["Środowiska", "Test", "Prod", "Audyt", "Tokeny API", "Pomoc"]);
    expect(await ursula.evaluate<boolean>(`document.documentElement.classList.contains("dark")`)).toBe(true);
    expect(await overflows(ursula)).toBe(false);

    await openAccountMenu(ursula);
    expect(await ursula.evaluate<string | null>(`document.querySelector("[data-slot=popover-content]").getAttribute("lang")`)).toBe("pl");
    expect(await ursula.text("[data-slot=popover-content] form[data-action=sign-out] button")).toBe("Wyloguj");
    expect(await ursula.text("[data-slot=popover-content] strong")).toBe(NAV_USER);
    expect(await overflows(ursula)).toBe(false);
  });

  it("fits the admin's bar, the widest one with Users, at 768 px in Polish", async () => {
    await openPage(admin, "/admin");
    await choosePreference(admin, "pl");
    await closeAccountMenu(admin);

    await admin.setViewport(768, 800);
    await openPage(admin, "/admin");

    expect(await labels(admin)).toEqual(["Środowiska", "Test", "Prod", "Audyt", "Tokeny API", "Użytkownicy", "Pomoc"]);
    expect(await overflows(admin)).toBe(false);
  });
});
