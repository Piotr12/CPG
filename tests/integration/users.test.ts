import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json, type UserRow } from "./api";
import { clickHydrated, openBrowser, type Browser } from "./browser";
import { signedInAs, signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const ALICE_PASSWORD = "alice's first password";
const ALICE_NEW_PASSWORD = "alice's second password";
const TOKEN = "users-admin";

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
 * Opens `url` and waits until the browser has arrived at `expected`: the page itself, or where its gate
 * sends a reader who may not open it (/admin, or /login). The layout streams the signed-in account
 * before the page's own gate redirects, so wait for the exact path, never for "the path changed".
 */
async function landsOn(browser: Browser, url: string, expected: string) {
  await browser.open(url);
  await browser.waitUntil(`location.pathname === ${JSON.stringify(expected)}`);
  await browser.waitFor("main");
  await browser.waitUntil(`!!document.querySelector("#username") || (${signedInAs()})`);
  expect(await pathname(browser)).toBe(expected);
}

describe("the admin manages normal users", () => {
  let admin: Browser;
  let aliceA: Browser;
  let aliceB: Browser;
  let secret: string;
  /**
   * The password this file last gave alice, or null when it isn't sure (before she exists, or while a test
   * is changing it). Every test sets up the alice it needs through `alice()`, so it doesn't lean on the
   * test before it having passed, or run (#192).
   */
  let alicePassword: string | null = null;

  const api = (method: string, path: string, body?: unknown) =>
    callApi(baseUrl, method, path, secret, { body, key: method === "GET" ? undefined : randomUUID() });
  const aliceAccount = async () => (json(await api("GET", "/api/users")).data as UserRow[]).find(({ username }) => username === "alice");

  /**
   * Brings alice to `password` and `active` through the API, creating her if she doesn't exist; a no-op
   * when the tests before have left her so. A password reset or a deactivation signs her out everywhere.
   * Then reopens the users screen, so its rows carry her current version.
   */
  async function alice({ password, active = true }: { password: string; active?: boolean }) {
    let account = await aliceAccount();
    if (!account) {
      const created = await api("POST", "/api/users", { username: "alice", password });
      expect(created.status, created.text).toBe(200);
      alicePassword = password;
      account = (await aliceAccount())!;
    } else if (alicePassword !== password) {
      const reset = await api("PUT", `/api/users/${account.id}/password`, { password, version: account.version });
      expect(reset.status, reset.text).toBe(200);
      alicePassword = password;
      account = (await aliceAccount())!;
    }
    if (account.active !== active) expect((await api("PATCH", `/api/users/${account.id}`, { active, version: account.version })).status).toBe(200);
    await openUsers();
  }

  /** Opens the users screen once alice's row menu can be used, or the table when she doesn't exist yet. */
  async function openUsers() {
    await admin.open(`${baseUrl}/admin/users`);
    await admin.waitFor("table");
    await admin.waitUntil(
      `![...document.querySelectorAll("tbody tr")].some((row) => row.innerText.startsWith("alice\\t")) || [...document.querySelectorAll("main button")].some((b) => b.getAttribute("aria-label") === "Actions for alice" && Object.keys(b).some((key) => key.startsWith("__reactFiber")))`,
    );
  }

  /** Signs alice in on `browser` unless she already is. */
  async function aliceSignedIn(browser: Browser, password: string) {
    await browser.open(`${baseUrl}/admin`);
    await browser.waitUntil(`!!document.querySelector("#username") || (${signedInAs("alice")})`);
    if (await browser.evaluate<boolean>(`!!document.querySelector("#username")`)) await signInAsAlice(browser, password);
  }

  beforeAll(async () => {
    [admin, aliceA, aliceB] = [openBrowser(), openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, TOKEN);
  });
  afterAll(async () => {
    try {
      if (secret) {
        const own = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find(({ name }) => name === TOKEN);
        if (own) expect((await api("DELETE", `/api/tokens/${own.id}`)).status).toBe(200);
      }
    } finally {
      await Promise.all([admin, aliceA, aliceB].map((browser) => browser.close()));
    }
  });

  it("opens the users screen from /admin, with no delete anywhere (TEN-008)", async () => {
    await admin.open(`${baseUrl}/admin`);
    await admin.waitUntil(`[...document.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/admin/users" && Object.keys(a).some((key) => key.startsWith("__reactFiber")))`);
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
    await openUsers();
    expect(await aliceAccount(), "alice exists before the test that creates her").toBeUndefined();
    await admin.clickRole("button", "Create user");
    await admin.fillLabel("Username", "Alice");
    await admin.fillLabel("Initial password", ALICE_PASSWORD);
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    await admin.waitForText("alice");
    alicePassword = ALICE_PASSWORD;

    expect(await ownRows(admin, "tbody td:first-child")).toEqual(["admin", "alice"]);
  });

  it("refuses a second alice", async () => {
    await alice({ password: ALICE_PASSWORD });
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
    await alice({ password: ALICE_PASSWORD });
    await aliceSignedIn(aliceA, ALICE_PASSWORD);
    await aliceSignedIn(aliceB, ALICE_PASSWORD);

    expect(await pathname(aliceA)).toBe("/admin");
    expect(await pathname(aliceB)).toBe("/admin");
    const page = await aliceA.evaluate<string>("document.body.innerText");
    expect(page).not.toMatch(/Users|Database|password/i);
    await landsOn(aliceA, `${baseUrl}/admin/users`, "/admin");
  });

  it("lets alice open both tenants, like every active account (TEN-010)", async () => {
    await alice({ password: ALICE_PASSWORD });
    await aliceSignedIn(aliceA, ALICE_PASSWORD);
    for (const tenant of ["test", "prod"]) {
      await aliceA.open(`${baseUrl}/admin/${tenant}`);
      await aliceA.waitUntil(signedInAs("alice"));

      expect(await pathname(aliceA)).toBe(`/admin/${tenant}`);
      expect(await aliceA.text("h1")).toMatch(new RegExp(`— ${tenant === "test" ? "Test" : "Prod"}$`));
    }
  });

  it("signs alice out everywhere on a password reset; only the new password works (TEN-006)", async () => {
    await alice({ password: ALICE_PASSWORD });
    await aliceSignedIn(aliceA, ALICE_PASSWORD);
    await aliceSignedIn(aliceB, ALICE_PASSWORD);
    alicePassword = null;
    await aliceMenu(admin, "Reset password");
    await admin.fillLabel("New password", ALICE_NEW_PASSWORD);
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    alicePassword = ALICE_NEW_PASSWORD;

    await landsOn(aliceA, `${baseUrl}/admin`, "/login");
    await landsOn(aliceB, `${baseUrl}/admin`, "/login");

    await signIn(aliceA, baseUrl, ALICE_PASSWORD, "alice");
    await aliceA.waitFor("[role=alert]");
    expect(await aliceA.text("[role=alert]")).toBe("Invalid username or password. Check both and try again. If you cannot sign in, contact your administrator.");

    await signInAsAlice(aliceA, ALICE_NEW_PASSWORD);
    await signInAsAlice(aliceB, ALICE_NEW_PASSWORD);
    expect([await pathname(aliceA), await pathname(aliceB)]).toEqual(["/admin", "/admin"]);
  });

  it("signs alice out everywhere on deactivation and refuses her sign-in (TEN-007)", async () => {
    await alice({ password: ALICE_NEW_PASSWORD });
    await aliceSignedIn(aliceA, ALICE_NEW_PASSWORD);
    await aliceSignedIn(aliceB, ALICE_NEW_PASSWORD);
    await aliceMenu(admin, "Deactivate");
    await admin.waitFor("[role=alertdialog]");
    expect(await admin.text("[role=alertdialog] p")).toContain("can't sign in until reactivated");
    await admin.clickRole("button", "Deactivate");
    await admin.waitUntil(aliceRow(`row.innerText.includes("Inactive")`));

    await landsOn(aliceA, `${baseUrl}/admin`, "/login");
    await landsOn(aliceB, `${baseUrl}/admin`, "/login");
    await signIn(aliceA, baseUrl, ALICE_NEW_PASSWORD, "alice");
    await aliceA.waitFor("[role=alert]");
    expect(await aliceA.text("[role=alert]")).toBe("Invalid username or password. Check both and try again. If you cannot sign in, contact your administrator.");
  });

  it("reactivates alice, who signs in with her current password", async () => {
    await alice({ password: ALICE_NEW_PASSWORD, active: false });
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
