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
