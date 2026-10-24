import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clickHydrated, openBrowser, type Browser } from "./browser";
import { signedInAs, signIn, signInAsAdmin } from "./sign-in";

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
  await browser.waitUntil(signedInAs("alice"));
}

/** Opens alice's row menu on /admin/users and picks an item. */
async function aliceMenu(admin: Browser, item: string) {
  await admin.clickRole("button", "Actions for alice");
  await admin.clickRole("menuitem", item);
}

/**
 * A JavaScript condition on alice's row of the users table. Other files share this database and
 * leave their own users behind, so assertions look at alice's row only.
 */
const aliceRow = (condition: string) =>
  `[...document.querySelectorAll("tbody tr")].some((row) => row.innerText.startsWith("alice\\t") && ${condition})`;

/**
 * Where a page the reader may not open sends them: /admin, or /login. The layout streams the signed-in
 * account before the page's own gate redirects, so wait for the URL to leave the page first.
 */
async function landsOn(browser: Browser, url: string) {
  await browser.open(url);
  await browser.waitUntil(`location.pathname !== ${JSON.stringify(new URL(url).pathname)}`);
  await browser.waitFor("main");
  await browser.waitUntil(`!!document.querySelector("#username") || (${signedInAs()})`);
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
    // The status is a StatusBadge, whose icon is a flex item: innerText may break the line before its label.
    expect(await ownRows(admin, "tbody tr")).toEqual([expect.stringMatching(/^admin\tadmin\t\s*Active\t\d{4}-\d{2}-\d{2}/)]);
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
      await aliceA.waitUntil(signedInAs("alice"));

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
    expect(await aliceA.text("[role=alert]")).toBe("Invalid username or password. Check both and try again. If you cannot sign in, contact your administrator.");

    await signInAsAlice(aliceA, ALICE_NEW_PASSWORD);
    await signInAsAlice(aliceB, ALICE_NEW_PASSWORD);
  });

  it("signs alice out everywhere on deactivation and refuses her sign-in (TEN-007)", async () => {
    await aliceMenu(admin, "Deactivate");
    await admin.waitFor("[role=alertdialog]");
    expect(await admin.text("[role=alertdialog] p")).toContain("can't sign in until reactivated");
    await admin.clickRole("button", "Deactivate");
    await admin.waitUntil(aliceRow(`row.innerText.includes("Inactive")`));

    expect(await landsOn(aliceA, `${baseUrl}/admin`)).toBe("/login");
    expect(await landsOn(aliceB, `${baseUrl}/admin`)).toBe("/login");
    await signIn(aliceA, baseUrl, ALICE_NEW_PASSWORD, "alice");
    await aliceA.waitFor("[role=alert]");
    expect(await aliceA.text("[role=alert]")).toBe("Invalid username or password. Check both and try again. If you cannot sign in, contact your administrator.");
  });

  it("reactivates alice, who signs in with her current password", async () => {
    await aliceMenu(admin, "Reactivate");
    await admin.waitFor("[role=alertdialog]");
    expect(await admin.text("[role=alertdialog] p")).toContain("Reset it too if the account may have been compromised");
    await admin.clickRole("button", "Reactivate");
    await admin.waitUntil(aliceRow(`!row.innerText.includes("Inactive")`));

    await signInAsAlice(aliceB, ALICE_NEW_PASSWORD);
    expect(await pathname(aliceB)).toBe("/admin");
  });
});

describe("sorting and searching the users list (#217)", () => {
  let admin: Browser;
  /** The shown usernames, in order. */
  const usernames = () => admin.evaluate<string[]>(`[...document.querySelectorAll("main tbody tr")].map((row) => row.cells[0].innerText.trim())`);
  /** Waits until the page's address has this query and the table under it is the new one. */
  const atQuery = (query: string) =>
    admin.waitUntil(`location.search === ${JSON.stringify(query)} && document.querySelector("main [aria-sort]") && !document.querySelector("main table").closest("[hidden]")`);

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
  });
  afterAll(() => admin.close());

  it("lists the admin first, then sorts by username both ways with a header click", async () => {
    await admin.open(`${baseUrl}/admin/users`);
    await admin.waitUntil(`document.querySelector("main th[aria-sort=ascending]")?.innerText.trim() === "Role"`);
    const byRole = await usernames();
    expect(byRole[0]).toBe("admin");

    await clickHydrated(admin, "main th a[href$='sort=username&dir=asc']");
    await atQuery("?sort=username&dir=asc");
    const ascending = await usernames();
    expect(ascending).toEqual([...byRole].sort());

    await clickHydrated(admin, "main th a[href$='sort=username&dir=desc']");
    await atQuery("?sort=username&dir=desc");
    await admin.waitUntil(`document.querySelector("main th[aria-sort=descending]")?.innerText.trim() === "Username"`);
    expect(await usernames()).toEqual([...ascending].reverse());
  });

  it("searches the username, keeping the sort, marking matches, and clears back", async () => {
    await admin.open(`${baseUrl}/admin/users?sort=username&dir=desc`);
    await atQuery("?sort=username&dir=desc");
    await admin.waitUntil(`Boolean(document.querySelector("main [role=search] input[name=q]")) && Object.keys(document.querySelector("main [role=search] button")).some((key) => key.startsWith("__reactFiber"))`);
    const all = await usernames();
    await admin.fill("main [role=search] input[name=q]", "ADMI");
    await admin.click("main [role=search] button[type=submit]");
    await atQuery("?q=ADMI&sort=username&dir=desc");
    await admin.waitFor("main [role=status]");

    const found = await usernames();
    expect(found).toEqual(all.filter((username) => username.includes("admi")));
    expect(found).toContain("admin");
    expect(await admin.evaluate<string[]>(`[...document.querySelectorAll("main tbody mark")].map((mark) => mark.textContent)`)).toEqual(found.map(() => "admi"));

    await clickHydrated(admin, "main [role=status] a");
    await atQuery("?sort=username&dir=desc");
    await admin.waitUntil(`!document.querySelector("main [role=status]")`);
    expect(await usernames()).toEqual(all);
  });
});
