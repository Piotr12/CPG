import type { Browser } from "./browser";
import { signedInAs } from "./sign-in";

/** Opens the tokens screen from the menu. */
export async function openTokens(browser: Browser, baseUrl: string) {
  await browser.open(`${baseUrl}/admin`);
  await browser.waitUntil(signedInAs());
  await browser.clickRole("link", "API tokens");
  await browser.waitFor("table");
}

/** Submits the Create token dialog; resolves once the form answers with the secret or an error. */
export async function submitToken(browser: Browser, name: string) {
  await browser.clickRole("button", "Create token");
  await browser.fillLabel("Name", name);
  await browser.click("[role=dialog] button[type=submit]");
  await browser.waitUntil(`document.querySelector("#api-token-secret") || document.querySelector("[role=dialog] [role=alert]")`);
}

/** Creates a token on the open tokens screen and returns its secret, read from the one-time panel. */
export async function createToken(browser: Browser, name: string): Promise<string> {
  await submitToken(browser, name);
  const secret = await browser.evaluate<string>(`document.querySelector("#api-token-secret").value`);
  await browser.clickRole("button", "Done");
  await browser.waitUntil(`!document.querySelector("[role=dialog]")`);
  await browser.waitForText(name);
  return secret;
}
