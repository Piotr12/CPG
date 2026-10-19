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

/** The tenant strip the page shows: Next.js keeps earlier pages' strips mounted but hidden. */
const STRIP = "[role=region][data-tenant]";
const shownStrip = `[...document.querySelectorAll(${JSON.stringify(STRIP)})].find((strip) => strip.offsetParent)`;

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

  // In one browser, so the account decides and not anything the browser kept from the last one.
  it("keeps each account's own language and theme, after signing in again too (UX-003)", async () => {
    const admin = { lang: "pl", isDark: true, heading: "Kontrola jaskini" };
    const bea = { lang: "en", isDark: false, heading: "Cave control" };

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
    for (const [tenant, description] of [
      ["test", "Środowisko Test"],
      ["prod", "Środowisko Prod"],
      ["test", "Środowisko Test"],
    ]) {
      await clickHydrated(browser, `${STRIP} a[href='/admin/${tenant}']`);
      // The strip's sentence streams in the reader's language.
      await browser.waitUntil(
        `${shownStrip}?.dataset.tenant === ${JSON.stringify(tenant)} && ${shownStrip}.innerText.includes(${JSON.stringify(description)})`,
      );

      expect(new URL(await browser.url()).pathname).toBe(`/admin/${tenant}`);
      expect(await documentState(browser)).toMatchObject({ lang: "pl", isDark: true });
    }

    // A soft navigation keeps the root layout, so <html> still holds what signing in set. Open Prod
    // afresh without the theme cookie: the account alone must bring back Polish and dark, and the
    // bar writes the account's theme back into the cookie once it has applied it.
    await browser.evaluate(`(() => { document.cookie = "cpg_theme=; Max-Age=0; Path=/"; return true; })()`);
    expect(await browser.evaluate<boolean>(`document.cookie.includes("cpg_theme=")`)).toBe(false);
    await browser.open(`${baseUrl}/admin/prod`);
    await browser.waitUntil(
      `${shownStrip}?.dataset.tenant === "prod" && ${shownStrip}.innerText.includes("Środowisko Prod") && document.cookie.includes("cpg_theme=")`,
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
