import type { Browser } from "./browser";

/** Signs in through the /login form and waits for the page the form lands on. */
export async function signIn(browser: Browser, baseUrl: string, password: string, username = "admin") {
  await browser.open(`${baseUrl}/login`);
  await browser.waitFor("#username");
  await browser.fill("#username", username);
  await browser.fill("#password", password);
  await browser.click("button[type=submit]");
}

/** Signs the admin in and waits until /admin shows its data. */
export async function signInAsAdmin(browser: Browser, baseUrl: string, password: string) {
  await signIn(browser, baseUrl, password);
  await browser.waitFor("[data-slot=badge]");
}

/**
 * Clicks a language or theme switch on /admin once React has hydrated it (a click on the static HTML
 * would be lost), then waits for the re-rendered page to mark the choice as current.
 */
export async function choosePreference(browser: Browser, value: string) {
  const button = JSON.stringify(`button[value=${value}]`);
  await browser.waitUntil(`Object.keys(document.querySelector(${button}) ?? {}).some((key) => key.startsWith("__reactFiber"))`);
  await browser.click(`button[value=${value}]`);
  await browser.waitUntil(`document.querySelector(${button})?.getAttribute("aria-pressed") === "true"`);
}

/**
 * Puts the admin back on English and light, so files that run later see the defaults. Call it from
 * the `afterAll` of any file that changes the admin's preferences.
 */
export async function restoreDefaultPreferences(browser: Browser, baseUrl: string, password: string) {
  await browser.open(`${baseUrl}/admin`);
  await browser.waitUntil(`document.querySelector("[data-slot=badge], #username")`);
  if (new URL(await browser.url()).pathname === "/login") await signInAsAdmin(browser, baseUrl, password);
  await choosePreference(browser, "en");
  await choosePreference(browser, "light");
}
