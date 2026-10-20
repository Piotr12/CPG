import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { choosePreference, closeAccountMenu, restoreDefaultPreferences, signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const topicIds = (browser: Browser) =>
  browser.evaluate<string[]>(`[...document.querySelectorAll("main section[id]")].map((section) => section.id)`);

/** Searches help through its form, the way a reader does. */
async function search(browser: Browser, query: string) {
  await browser.fill("input[name=q]", query);
  await browser.click("form[role=search] button[type=submit]");
  await browser.waitUntil(`new URL(location.href).searchParams.get("q") === ${JSON.stringify(query)}`);
  await browser.waitFor("main h1");
}

// UX-013: searchable help, reachable from every page, in the reader's language.
describe("help", () => {
  let browser: Browser;

  beforeAll(() => {
    browser = openBrowser();
  });
  afterAll(async () => {
    await restoreDefaultPreferences(browser, baseUrl, adminPassword);
    await browser.close();
  });

  it.each(["/", "/login"])("is linked from %s", async (path) => {
    await browser.open(`${baseUrl}${path}`);
    await browser.waitFor("nav a[href='/help']");

    expect(await browser.text("nav a[href='/help']")).toBe("Help");
  });

  it("finds the sign-in topic by searching", async () => {
    await browser.click("nav a[href='/help']");
    await browser.waitFor("section#signing-in");
    await search(browser, "sign");

    expect(await topicIds(browser)).toContain("signing-in");
    expect(await browser.text("main h1")).toBe("Help");
  });

  it("speaks Polish to a Polish account, linked from /admin, and finds “logowanie” and the import guide (UX-015)", async () => {
    await signInAsAdmin(browser, baseUrl, adminPassword);
    await choosePreference(browser, "pl");
    await closeAccountMenu(browser);
    await browser.waitFor("nav a[href='/help']");
    expect(await browser.text("nav a[href='/help']")).toBe("Pomoc");

    await browser.click("nav a[href='/help']");
    await browser.waitFor("section#signing-in");
    await search(browser, "logowanie");

    expect(await browser.text("main h1")).toBe("Pomoc");
    expect(await topicIds(browser)).toContain("signing-in");
    expect(await browser.text("section#signing-in h2")).toBe("Logowanie");

    await search(browser, "skoroszyt");
    expect(await topicIds(browser)).toContain("import");
    expect(await browser.text("section#import h2")).toBe("Import z arkusza");
    expect(await browser.text("section#import")).toContain("Pobierz szablon");
    expect(await browser.text("section#import")).toContain("wykonaj próbę");
  });
});
