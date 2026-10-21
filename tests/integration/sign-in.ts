import type { Browser } from "./browser";

/** Signs in through the /login form, from a signed-out browser, and waits for the page the form lands on. */
export async function signIn(browser: Browser, baseUrl: string, password: string, username = "admin") {
  await browser.open(`${baseUrl}/login`);
  await browser.waitFor("#username");
  // The login form may still be static HTML; an early submit can be lost before hydration. And the
  // card must have stopped moving: agent-browser clicks the button where it measured it.
  await browser.waitUntil(`${hydrated('document.querySelector("#username")')} && ${signedOutLayoutSettled}`);
  await browser.fill("#username", username);
  await browser.fill("#password", password);
  await browser.click("button[type=submit]");
}

/** Signs the admin in and waits until /admin shows its data. */
export async function signInAsAdmin(browser: Browser, baseUrl: string, password: string) {
  await signIn(browser, baseUrl, password);
  await browser.waitFor("[data-slot=badge]");
}

/** Rendered for a signed-in account at every width (the mobile top bar, hidden from 768 px), naming the account. */
const SIGNED_IN = "[data-signed-in-as]";
const signedInMarker = `document.querySelector(${JSON.stringify(SIGNED_IN)})`;
/** True once React has hydrated an element, so a click on it isn't lost. */
export const hydrated = (element: string) => `Object.keys(${element} ?? {}).some((key) => key.startsWith("__reactFiber"))`;

const visitorBar = `document.querySelector("[data-visitor-bar]")`;
/**
 * A page condition: a signed-out page's layout is final. Until the visitor bar streams in over the
 * sidebar skeleton (out of Next.js's hidden staging container), the page keeps the skeleton's column,
 * and the swap moves the sign-in card (128 px left and 24 px down at 1280 px). Under load React
 * reveals it after `load` and even after hydration, so a click measured before it lands on the form,
 * not the button, and nothing is submitted (#128). Web fonts swapping in can move the card the same way.
 */
export const signedOutLayoutSettled = `!!${visitorBar} && !${visitorBar}.closest("[hidden]") && document.fonts.status === "loaded"`;

/**
 * A page condition: the sidebar has streamed in (outside Next.js's hidden staging container) and names
 * `username` as signed in, or any account when `username` is omitted.
 */
export const signedInAs = (username?: string) =>
  `!!${signedInMarker} && !${signedInMarker}.closest("[hidden]")` +
  (username === undefined ? "" : ` && ${signedInMarker}.dataset.signedInAs === ${JSON.stringify(username)}`);

/**
 * A page condition: `username` is signed in and React has hydrated the sidebar, which also sets the
 * account's language and theme on <html>.
 */
export const signedInAndHydrated = (username: string) => `${signedInAs(username)} && ${hydrated(signedInMarker)}`;

/** Signs `username` in and waits until the hydrated sidebar names them. */
export async function signInAs(browser: Browser, baseUrl: string, username: string, password: string) {
  await signIn(browser, baseUrl, password, username);
  await browser.waitUntil(signedInAndHydrated(username));
}

/** The account card at the foot of the sidebar (in the drawer below 768 px) and its popover. */
const ACCOUNT_CARD = "[data-action=account-menu]";
const shownAccountCard = `[...document.querySelectorAll(${JSON.stringify(ACCOUNT_CARD)})].find((card) => card.offsetParent)`;
const POPOVER_PANEL = "[data-slot=popover-content] [data-account-panel]";
const DRAWER = "[data-slot=sidebar][data-mobile=true]";

/**
 * Brings the account controls (language, theme, API tokens, sign-out) into reach and returns a
 * selector for them: the account card's popover, opened unless it already is. Below 768 px the card
 * sits in the drawer, which Menu opens first.
 */
export async function openAccountMenu(browser: Browser): Promise<string> {
  await browser.waitUntil(`${signedInAs()} && ${hydrated(signedInMarker)}`);
  const signOutForm = JSON.stringify(`${POPOVER_PANEL} form[data-action=sign-out]`);
  if (await browser.evaluate<boolean>(`!!document.querySelector(${signOutForm})`)) return POPOVER_PANEL;
  if (!(await browser.evaluate<boolean>(`!!${shownAccountCard}`))) {
    await browser.click("[data-action=open-menu]");
    await browser.waitUntil(`!!${shownAccountCard} && ${hydrated(shownAccountCard)}`);
  }
  await browser.waitUntil(hydrated(shownAccountCard));
  await browser.evaluate(`(() => {
    document.querySelectorAll("[data-test-click]").forEach((element) => element.removeAttribute("data-test-click"));
    ${shownAccountCard}.setAttribute("data-test-click", "");
    return true;
  })()`);
  await browser.click("[data-test-click]");
  await browser.waitUntil(`!!document.querySelector(${signOutForm})`);
  return POPOVER_PANEL;
}

/**
 * Closes the account popover (and the drawer below 768 px) with Escape and waits until each has gone,
 * closing animation included, so the next click on the page can't land on it. With nothing open it
 * does nothing: a stray Escape from agent-browser leaves every later page load in that session stuck
 * mid-stream.
 */
export async function closeAccountMenu(browser: Browser) {
  for (const overlay of ["[data-slot=popover-content]", DRAWER]) {
    if (!(await browser.evaluate<boolean>(`!!document.querySelector(${JSON.stringify(overlay)})`))) continue;
    await browser.press("Escape");
    await browser.waitUntil(`!document.querySelector(${JSON.stringify(overlay)})`);
  }
}

/** Signs out from the account card and waits for the sign-in page. */
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
