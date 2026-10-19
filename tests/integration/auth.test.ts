import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");
const sessionCookie = async (browser: Browser) => (await browser.cookies()).find(({ name }) => name === "cpg_session");

describe("signing in", () => {
  let browser: Browser;

  beforeAll(() => {
    browser = openBrowser();
  });
  afterAll(() => browser.close());

  it("sends a visitor who opens /admin to the sign-in page", async () => {
    await browser.open(`${baseUrl}/admin`);
    await browser.waitFor("#username");

    expect(new URL(await browser.url()).pathname).toBe("/login");
    expect(await browser.title()).toBe("Sign in · Caveman Planning Good");
    expect(await browser.texts("[data-slot=badge]")).toEqual([]);
  });

  it("refuses a wrong password with a generic message and no session", async () => {
    await signIn(browser, baseUrl, "not the admin password");
    await browser.waitFor("[role=alert]");

    expect(await browser.text("[role=alert]")).toBe("Invalid username or password.");
    expect(new URL(await browser.url()).pathname).toBe("/login");
    expect(await sessionCookie(browser)).toBeUndefined();
  });

  it("signs the admin in with an httpOnly, secure, lax session cookie", async () => {
    await signInAsAdmin(browser, baseUrl, adminPassword);

    expect(new URL(await browser.url()).pathname).toBe("/admin");
    expect(await browser.text("strong")).toBe("admin");
    expect(await sessionCookie(browser)).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
  });

  it("sends a signed-in admin who opens /login on to /admin", async () => {
    await browser.open(`${baseUrl}/login`);
    await browser.waitFor("[data-slot=badge]");

    expect(new URL(await browser.url()).pathname).toBe("/admin");
  });

  it("signs out, and /admin is closed again", async () => {
    await browser.click("main form button[type=submit]");
    await browser.waitFor("#username");

    expect(new URL(await browser.url()).pathname).toBe("/login");
    expect(await sessionCookie(browser)).toBeUndefined();
    await browser.open(`${baseUrl}/admin`);
    await browser.waitFor("#username");
    expect(new URL(await browser.url()).pathname).toBe("/login");
  });

  it("slows down repeated guessing", async () => {
    // Counted per client and username, so this doesn't lock out the admin.
    for (let attempt = 0; attempt < 6; attempt++) {
      await signIn(browser, baseUrl, "guess", "not-a-user");
      await browser.waitFor("[role=alert]");
    }

    expect(await browser.text("[role=alert]")).toBe("Too many attempts. Try again in a few minutes.");
  });
});
