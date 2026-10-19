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

/** The menu's account button (768–1279 px); its text is the signed-in account's name. */
const ACCOUNT_BUTTON = "header [data-action=account-menu]";
const accountButton = `document.querySelector(${JSON.stringify(ACCOUNT_BUTTON)})`;
/** True once React has hydrated an element, so a click on it isn't lost. */
export const hydrated = (element: string) => `Object.keys(${element} ?? {}).some((key) => key.startsWith("__reactFiber"))`;

/**
 * A page condition: the menu has streamed in (outside Next.js's hidden staging container) and names
 * `username` as signed in, or any account when `username` is omitted.
 */
export const signedInAs = (username?: string) =>
  `!!${accountButton} && !${accountButton}.closest("[hidden]")` +
  (username === undefined ? "" : ` && ${accountButton}.textContent === ${JSON.stringify(username)}`);

/**
 * A page condition: `username` is signed in and React has hydrated the bar, which also sets the
 * account's language and theme on <html>.
 */
export const signedInAndHydrated = (username: string) => `${signedInAs(username)} && ${hydrated(accountButton)}`;

/** Signs `username` in and waits until the hydrated bar names them. */
export async function signInAs(browser: Browser, baseUrl: string, username: string, password: string) {
  await signIn(browser, baseUrl, password, username);
  await browser.waitUntil(signedInAndHydrated(username));
}

/** The account controls in the bar itself (from 1280 px), and in the popover (768–1279 px). */
const INLINE_PANEL = "header [data-account-panel=inline]";
const POPOVER_PANEL = "[data-slot=popover-content] [data-account-panel]";

/**
 * Brings the account controls (language, theme, sign-out) into reach and returns a selector for them:
 * the bar's own row from 1280 px; otherwise the popover, opened unless it already is.
 */
export async function openAccountMenu(browser: Browser): Promise<string> {
  await browser.waitUntil(`${signedInAs()} && ${hydrated(accountButton)}`);
  if (await browser.evaluate<boolean>(`!!document.querySelector(${JSON.stringify(INLINE_PANEL)})?.offsetParent`)) {
    return INLINE_PANEL;
  }
  if ((await browser.evaluate<string | null>(`${accountButton}.getAttribute("aria-expanded")`)) !== "true") {
    await browser.click(ACCOUNT_BUTTON);
  }
  await browser.waitUntil(`!!document.querySelector(${JSON.stringify(`${POPOVER_PANEL} form[data-action=sign-out]`)})`);
  return POPOVER_PANEL;
}

/**
 * Closes the account popover with Escape and waits until it has gone, closing animation included, so
 * the next click on the page can't land on it. Without an open popover (the controls are in the bar
 * from 1280 px) it does nothing: a stray Escape from agent-browser leaves every later page load in that
 * session stuck mid-stream.
 */
export async function closeAccountMenu(browser: Browser) {
  if (!(await browser.evaluate<boolean>(`!!document.querySelector("[data-slot=popover-content]")`))) return;
  await browser.press("Escape");
  await browser.waitUntil(`!document.querySelector("[data-slot=popover-content]")`);
}

/** Signs out from the menu and waits for the sign-in page. */
export async function signOut(browser: Browser) {
  const panel = await openAccountMenu(browser);
  await browser.click(`${panel} form[data-action=sign-out] button`);
  await browser.waitFor("#username");
}

/**
 * Clicks a language or theme switch in the menu's account controls once React has hydrated it (a click
 * on the static HTML would be lost), then waits for the re-rendered page to mark the choice as current.
 * A popover stays open, so several choices in a row work.
 */
export async function choosePreference(browser: Browser, value: string) {
  const selector = `${await openAccountMenu(browser)} button[value=${value}]`;
  const button = JSON.stringify(selector);
  await browser.waitUntil(hydrated(`document.querySelector(${button})`));
  await browser.click(selector);
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
