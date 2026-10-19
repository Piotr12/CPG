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

/** The menu's account button (from 768 px); its text is the signed-in account's name. */
const ACCOUNT_BUTTON = "header [data-action=account-menu]";
const accountButton = `document.querySelector(${JSON.stringify(ACCOUNT_BUTTON)})`;
/** True once React has hydrated an element, so a click on it isn't lost. */
const hydrated = (element: string) => `Object.keys(${element} ?? {}).some((key) => key.startsWith("__reactFiber"))`;

/**
 * A page condition: the menu has streamed in (outside Next.js's hidden staging container) and names
 * `username` as signed in, or any account when `username` is omitted.
 */
export const signedInAs = (username?: string) =>
  `!!${accountButton} && !${accountButton}.closest("[hidden]")` +
  (username === undefined ? "" : ` && ${accountButton}.textContent === ${JSON.stringify(username)}`);

/** Opens the menu's account popover (language, theme, sign-out), unless it is already open. */
export async function openAccountMenu(browser: Browser) {
  await browser.waitUntil(`${signedInAs()} && ${hydrated(accountButton)}`);
  if ((await browser.evaluate<string | null>(`${accountButton}.getAttribute("aria-expanded")`)) !== "true") {
    await browser.click(ACCOUNT_BUTTON);
  }
  await browser.waitUntil(`!!document.querySelector("[data-slot=popover-content] form[data-action=sign-out]")`);
}

/**
 * Closes the account popover with Escape and waits until it has gone, closing animation included, so
 * the next click on the page can't land on it.
 */
export async function closeAccountMenu(browser: Browser) {
  await browser.press("Escape");
  await browser.waitUntil(`!document.querySelector("[data-slot=popover-content]")`);
}

/** Signs out from the menu and waits for the sign-in page. */
export async function signOut(browser: Browser) {
  await openAccountMenu(browser);
  await browser.click("form[data-action=sign-out] button");
  await browser.waitFor("#username");
}

/**
 * Clicks a language or theme switch in the menu's account popover once React has hydrated it (a click
 * on the static HTML would be lost), then waits for the re-rendered page to mark the choice as current.
 * The popover stays open, so several choices in a row work.
 */
export async function choosePreference(browser: Browser, value: string) {
  await openAccountMenu(browser);
  const button = JSON.stringify(`button[value=${value}]`);
  await browser.waitUntil(hydrated(`document.querySelector(${button})`));
  await browser.click(`button[value=${value}]`);
  await browser.waitUntil(`document.querySelector(${button})?.getAttribute("aria-pressed") === "true"`);
}

/**
 * Puts the admin back on English and light, so files that run later see the defaults. Call it from
 * the `afterAll` of any file that changes the admin's preferences.
 */
export async function restoreDefaultPreferences(browser: Browser, baseUrl: string, password: string) {
  await browser.open(`${baseUrl}/admin`);
  // A boolean: returning the element itself makes agent-browser fail with "Object reference chain is too long".
  await browser.waitUntil(`!!document.querySelector("[data-slot=badge], #username")`);
  if (new URL(await browser.url()).pathname === "/login") await signInAsAdmin(browser, baseUrl, password);
  await choosePreference(browser, "en");
  await choosePreference(browser, "light");
}
