import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clickHydrated, openBrowser, type Browser } from "./browser";
import {
  choosePreference,
  openAccountMenu,
  restoreDefaultPreferences,
  signInAs,
  signInAsAdmin,
  signOut,
} from "./sign-in";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own second account: other files share the app, and users are never deleted.
const BEA = "pref-bea";
const BEA_PASSWORD = "pref bea's first password";

interface DocumentState {
  lang: string;
  isDark: boolean;
  heading: string | undefined;
}

/** What the reader sees: <html lang>, the theme class and the shown page's heading. */
const documentState = (browser: Browser) =>
  browser.evaluate<DocumentState>(`({
    lang: document.documentElement.lang,
    isDark: document.documentElement.classList.contains("dark"),
    heading: [...document.querySelectorAll("h1")].find((heading) => !heading.closest("[hidden]"))?.textContent,
  })`);

/** Waits until the page shows `heading` in place, without a reload. */
const waitForHeading = (browser: Browser, heading: string) =>
  browser.waitUntil(`document.querySelector("h1")?.textContent === ${JSON.stringify(heading)}`);

/** The tenant header row the page shows: Next.js keeps earlier pages' rows mounted but hidden. */
const HEADER = "[role=region][data-tenant]";
const shownHeader = `[...document.querySelectorAll(${JSON.stringify(HEADER)})].find((row) => row.offsetParent)`;

// UX-001 to UX-007.
describe("language and theme", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = openBrowser();
    const admin = openBrowser();
    try {
      await signInAsAdmin(admin, baseUrl, adminPassword);
      await createUser(admin, baseUrl, BEA, BEA_PASSWORD);
    } finally {
      await admin.close();
    }
  });
  afterAll(async () => {
    await restoreDefaultPreferences(browser, baseUrl, adminPassword);
    await browser.close();
  });

  it("starts a new account in English and light (UX-001)", async () => {
    await signInAsAdmin(browser, baseUrl, adminPassword);

    expect(await documentState(browser)).toEqual({ lang: "en", isDark: false, heading: "Tenants" });
  });

  it("switches to Polish in place (UX-002)", async () => {
    await choosePreference(browser, "pl");
    await waitForHeading(browser, "Środowiska");

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
    // The soft navigation from /login keeps the root <html>: the account's language and theme reach
    // it on the client a moment after the Polish page has rendered, so wait for them, then compare.
    await browser.waitUntil(`document.documentElement.lang === "pl" && document.documentElement.classList.contains("dark")`);

    expect(await documentState(browser)).toEqual({ lang: "pl", isDark: true, heading: "Środowiska" });
  });

  // In one browser, so the account decides and not anything the browser kept from the last one.
  it("keeps each account's own language and theme, after signing in again too (UX-003)", async () => {
    const admin = { lang: "pl", isDark: true, heading: "Środowiska" };
    const bea = { lang: "en", isDark: false, heading: "Tenants" };

    for (const [username, password, expected] of [
      [BEA, BEA_PASSWORD, bea],
      ["admin", adminPassword, admin],
      [BEA, BEA_PASSWORD, bea],
      ["admin", adminPassword, admin],
    ] as const) {
      await signOut(browser);
      await signInAs(browser, baseUrl, username, password);
      await browser.waitUntil(`[...document.querySelectorAll("h1")].some((heading) => !heading.closest("[hidden]"))`);

      expect({ username, ...(await documentState(browser)) }).toEqual({ username, ...expected });
    }
  });

  it("keeps Polish and dark while switching between Test and Prod (UX-004, UX-007)", async () => {
    for (const tenant of ["test", "prod", "test"]) {
      // The sidebar's first link to the tenant's home: the brand on a shared page, the switch on the other tenant's.
      await clickHydrated(browser, `[data-slot=sidebar] a[href='/admin/${tenant}']`);
      // The header row's words stream in the reader's language.
      await browser.waitUntil(
        `${shownHeader}?.dataset.tenant === ${JSON.stringify(tenant)} && ${shownHeader}.textContent.includes("Aktywne środowisko")`,
      );

      expect(new URL(await browser.url()).pathname).toBe(`/admin/${tenant}`);
      expect(await documentState(browser)).toMatchObject({ lang: "pl", isDark: true });
    }

    // A soft navigation keeps the root layout, so <html> still holds what signing in set. Open Prod
    // afresh without the theme cookie: the account alone must bring back Polish and dark, and the
    // sidebar writes the account's theme back into the cookie once it has applied it.
    await browser.evaluate(`(() => { document.cookie = "cpg_theme=; Max-Age=0; Path=/"; return true; })()`);
    expect(await browser.evaluate<boolean>(`document.cookie.includes("cpg_theme=")`)).toBe(false);
    await browser.open(`${baseUrl}/admin/prod`);
    await browser.waitUntil(
      `${shownHeader}?.dataset.tenant === "prod" && ${shownHeader}.textContent.includes("Aktywne środowisko") && document.cookie.includes("cpg_theme=")`,
    );

    expect(await documentState(browser)).toMatchObject({ lang: "pl", isDark: true });
    expect(await browser.evaluate<string>(`document.cookie`)).toContain("cpg_theme=dark");
  });

  // The script's behaviour is unit-tested in jsdom (preferences/theme.test.ts); here, that it ships.
  it("serves the theme script in every page's static <head>", async () => {
    const html = await (await fetch(`${baseUrl}/`)).text();

    expect(html).toContain(`document.cookie.split("; ").indexOf("cpg_theme=dark")`);
  });
});
