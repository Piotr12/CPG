import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const ALICE_PASSWORD = "alice's first password";
const ALICE_NEW_PASSWORD = "alice's second password";

const pathname = async (browser: Browser) => new URL(await browser.url()).pathname;
/** This file's accounts: other files share the app (and its never-deleted users), so ignore theirs. */
const OWN_ACCOUNTS = ["admin", "alice"];
const ownRows = async (admin: Browser, selector: string) =>
  (await admin.texts(selector)).filter((text) => OWN_ACCOUNTS.includes(text.split("\t")[0]));

/** Signs alice in and waits for /admin to greet her. */
async function signInAsAlice(browser: Browser, password: string) {
  await signIn(browser, baseUrl, password, "alice");
  await browser.waitUntil(`document.querySelector("strong")?.innerText === "alice"`);
}

/** Opens alice's row menu on /admin/users and picks an item. */
async function aliceMenu(admin: Browser, item: string) {
  await admin.clickRole("button", "Actions for alice");
  await admin.clickRole("menuitem", item);
}

/** Whether a signed-in page still opens /admin, or is sent to /login. */
async function landsOn(browser: Browser, url: string) {
  await browser.open(url);
  await browser.waitFor("main");
  await browser.waitUntil(`!!(document.querySelector("#username") || document.querySelector("strong"))`);
  return pathname(browser);
}

describe("the admin manages normal users", () => {
  let admin: Browser;
  let aliceA: Browser;
  let aliceB: Browser;

  beforeAll(async () => {
    [admin, aliceA, aliceB] = [openBrowser(), openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
  });
  afterAll(() => Promise.all([admin, aliceA, aliceB].map((browser) => browser.close())));

  it("opens the users screen from /admin, with no delete anywhere (TEN-008)", async () => {
    await admin.clickRole("link", "Users");
    await admin.waitFor("table");

    expect(await pathname(admin)).toBe("/admin/users");
    expect(await admin.title()).toBe("Users · Caveman Planning Good");
    expect(await admin.text("main p")).toBe(
      "Users are never deleted. Deactivate an account to end its access; its history keeps its name.",
    );
    expect(await ownRows(admin, "tbody tr")).toEqual([expect.stringMatching(/^admin\tadmin\tActive\t\d{4}-\d{2}-\d{2}/)]);
    const controls = await admin.texts("button, a, [role=menuitem]");
    expect(controls.filter((text) => /delete|remove/i.test(text))).toEqual([]);
  });

  it("creates alice with an initial password (TEN-004)", async () => {
    await admin.clickRole("button", "Create user");
    await admin.fillLabel("Username", "Alice");
    await admin.fillLabel("Initial password", ALICE_PASSWORD);
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    await admin.waitForText("alice");

    expect(await ownRows(admin, "tbody td:first-child")).toEqual(["admin", "alice"]);
  });

  it("refuses a second alice", async () => {
    await admin.clickRole("button", "Create user");
    await admin.fillLabel("Username", "alice");
    await admin.fillLabel("Initial password", ALICE_PASSWORD);
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitFor("[role=dialog] [role=alert]");

    expect(await admin.text("[role=dialog] [role=alert]")).toBe("That username is taken.");
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
  });

  it("lets alice sign in twice, without admin rights or a password change (TEN-004, TEN-005, TEN-009)", async () => {
    await signInAsAlice(aliceA, ALICE_PASSWORD);
    await signInAsAlice(aliceB, ALICE_PASSWORD);

    expect(await pathname(aliceA)).toBe("/admin");
    const page = await aliceA.evaluate<string>("document.body.innerText");
    expect(page).not.toMatch(/Users|Database|password/i);
    expect(await landsOn(aliceA, `${baseUrl}/admin/users`)).toBe("/admin");
  });

  it("lets alice open both tenants, like every active account (TEN-010)", async () => {
    for (const tenant of ["test", "prod"]) {
      await aliceA.open(`${baseUrl}/admin/${tenant}`);
      await aliceA.waitUntil(`document.querySelector("strong")?.innerText === "alice"`);

      expect(await pathname(aliceA)).toBe(`/admin/${tenant}`);
      expect(await aliceA.text("h1")).toMatch(new RegExp(`— ${tenant === "test" ? "Test" : "Prod"}$`));
    }
  });

  it("signs alice out everywhere on a password reset; only the new password works (TEN-006)", async () => {
    await aliceMenu(admin, "Reset password");
    await admin.fillLabel("New password", ALICE_NEW_PASSWORD);
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);

    expect(await landsOn(aliceA, `${baseUrl}/admin`)).toBe("/login");
    expect(await landsOn(aliceB, `${baseUrl}/admin`)).toBe("/login");

    await signIn(aliceA, baseUrl, ALICE_PASSWORD, "alice");
    await aliceA.waitFor("[role=alert]");
    expect(await aliceA.text("[role=alert]")).toBe("Invalid username or password.");

    await signInAsAlice(aliceA, ALICE_NEW_PASSWORD);
    await signInAsAlice(aliceB, ALICE_NEW_PASSWORD);
  });

  it("signs alice out everywhere on deactivation and refuses her sign-in (TEN-007)", async () => {
    await aliceMenu(admin, "Deactivate");
    await admin.waitFor("[role=alertdialog]");
    expect(await admin.text("[role=alertdialog] p")).toContain("can't sign in until reactivated");
    await admin.clickRole("button", "Deactivate");
    await admin.waitForText("Inactive");

    expect(await landsOn(aliceA, `${baseUrl}/admin`)).toBe("/login");
    expect(await landsOn(aliceB, `${baseUrl}/admin`)).toBe("/login");
    await signIn(aliceA, baseUrl, ALICE_NEW_PASSWORD, "alice");
    await aliceA.waitFor("[role=alert]");
    expect(await aliceA.text("[role=alert]")).toBe("Invalid username or password.");
  });

  it("reactivates alice, who signs in with her current password", async () => {
    await aliceMenu(admin, "Reactivate");
    await admin.waitFor("[role=alertdialog]");
    expect(await admin.text("[role=alertdialog] p")).toContain("Reset it too if the account may have been compromised");
    await admin.clickRole("button", "Reactivate");
    await admin.waitUntil(`!document.body.innerText.includes("Inactive")`);

    await signInAsAlice(aliceB, ALICE_NEW_PASSWORD);
    expect(await pathname(aliceB)).toBe("/admin");
  });
});
