import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { choosePreference, openAccountMenu, restoreDefaultPreferences, signInAsAdmin, signOut } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

interface DocumentState {
  lang: string;
  isDark: boolean;
  heading: string | undefined;
}

/** What the reader sees: <html lang>, the theme class and the page heading. */
const documentState = (browser: Browser) =>
  browser.evaluate<DocumentState>(`({
    lang: document.documentElement.lang,
    isDark: document.documentElement.classList.contains("dark"),
    heading: document.querySelector("h1")?.textContent,
  })`);

/** Waits until the page shows `heading` in place, without a reload. */
const waitForHeading = (browser: Browser, heading: string) =>
  browser.waitUntil(`document.querySelector("h1")?.textContent === ${JSON.stringify(heading)}`);

// UX-001, UX-002, UX-005, UX-006, UX-007. The two-account half of UX-003 joins once E01-S02 (#16) can
// create a second account; the service tests cover it until then.
describe("language and theme", () => {
  let browser: Browser;

  beforeAll(() => {
    browser = openBrowser();
  });
  afterAll(async () => {
    await restoreDefaultPreferences(browser, baseUrl, adminPassword);
    await browser.close();
  });

  it("starts a new account in English and light (UX-001)", async () => {
    await signInAsAdmin(browser, baseUrl, adminPassword);

    expect(await documentState(browser)).toEqual({ lang: "en", isDark: false, heading: "Cave control" });
  });

  it("switches to Polish in place (UX-002)", async () => {
    await choosePreference(browser, "pl");
    await waitForHeading(browser, "Kontrola jaskini");

    expect(await documentState(browser)).toMatchObject({ lang: "pl", isDark: false });
    expect(await browser.text(`${await openAccountMenu(browser)} form[data-action=sign-out] button`)).toBe("Wyloguj");
  });

  it("switches to dark, and back to light (UX-006, UX-005)", async () => {
    await choosePreference(browser, "dark");
    await browser.waitUntil(`document.documentElement.classList.contains("dark")`);
    expect((await documentState(browser)).isDark).toBe(true);

    await choosePreference(browser, "light");
    await browser.waitUntil(`!document.documentElement.classList.contains("dark")`);
    expect((await documentState(browser)).isDark).toBe(false);

    await choosePreference(browser, "dark");
    await browser.waitUntil(`document.documentElement.classList.contains("dark")`);
  });

  it("shows the sign-in page in English and light once signed out", async () => {
    await signOut(browser);
    await browser.waitUntil(`!document.documentElement.classList.contains("dark")`);

    expect(await documentState(browser)).toMatchObject({ lang: "en", isDark: false });
  });

  it("keeps Polish and dark after signing in again (UX-007)", async () => {
    await signInAsAdmin(browser, baseUrl, adminPassword);

    expect(await documentState(browser)).toEqual({ lang: "pl", isDark: true, heading: "Kontrola jaskini" });
  });

  // The script's behaviour is unit-tested in jsdom (preferences/theme.test.ts); here, that it ships.
  it("serves the theme script in every page's static <head>", async () => {
    const html = await (await fetch(`${baseUrl}/`)).text();

    expect(html).toContain(`document.cookie.split("; ").indexOf("cpg_theme=dark")`);
  });
});
