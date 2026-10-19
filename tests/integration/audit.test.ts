import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { choosePreference, signedInAs, signIn, signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account: other files share the app, and users are never deleted.
const USERNAME = "audit-alice";
const PASSWORD = "audit alice's first password";
const NEW_PASSWORD = "audit alice's second password";

/** One audit row's cells: time, account, session, channel, action, subject, changes. */
type Row = [string, string, string, string, string, string, string];

/** The Global audit's rows about this file's account, newest first. */
async function auditRows(browser: Browser): Promise<Row[]> {
  await browser.open(`${baseUrl}/admin/audit`);
  await browser.waitFor("table");
  const rows = await browser.evaluate<string[][]>(
    `[...document.querySelectorAll("tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim()))`,
  );
  return rows.filter((cells) => cells[5] === USERNAME) as Row[];
}

/**
 * A page condition on this file's own row of /admin/users: other files' accounts share the list (one
 * of them may well be inactive), so a page-wide check would wait on the wrong row.
 */
const ownRow = (condition: string) =>
  `[...document.querySelectorAll("tbody tr")].some((row) => row.innerText.startsWith(${JSON.stringify(`${USERNAME}	`)}) && ${condition})`;

/** Opens the account's row menu on /admin/users and picks an item, then confirms if asked. */
async function rowAction(admin: Browser, item: string, confirm?: string) {
  await admin.clickRole("button", `Actions for ${USERNAME}`);
  await admin.clickRole("menuitem", item);
  if (confirm) {
    await admin.waitFor("[role=alertdialog]");
    await admin.clickRole("button", confirm);
    await admin.waitUntil(`!document.querySelector("[role=alertdialog]")`);
  }
}

describe("every change is kept in an append-only audit", () => {
  let admin: Browser;
  let alice: Browser;
  let adminSession: string;

  beforeAll(async () => {
    [admin, alice] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
  });
  afterAll(() => Promise.all([admin, alice].map((browser) => browser.close())));

  it("records the admin's account changes, newest first, with account, session and channel (AUD-001, AUD-003, AUD-015)", async () => {
    await admin.open(`${baseUrl}/admin/users`);
    await admin.waitFor("table");
    await admin.clickRole("button", "Create user");
    await admin.fillLabel("Username", USERNAME);
    await admin.fillLabel("Initial password", PASSWORD);
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    await admin.waitForText(USERNAME);

    await rowAction(admin, "Reset password");
    await admin.fillLabel("New password", NEW_PASSWORD);
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);

    await rowAction(admin, "Deactivate", "Deactivate");
    await admin.waitUntil(ownRow(`row.innerText.includes("Inactive")`));

    const rows = await auditRows(admin);
    expect(await admin.title()).toBe("Global audit · Caveman Planning Good");
    expect(rows.map(([, account, , channel, action, , changes]) => [account, channel, action, changes])).toEqual([
      ["admin", "UI", "User deactivated", "active: yes → no"],
      ["admin", "UI", "Password reset", "Password replaced (not recorded)"],
      ["admin", "UI", "User created", `username: ${USERNAME}\nrole: user\nactive: yes`],
    ]);
    for (const [time] of rows) expect(time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    adminSession = rows[0][2];
    expect(adminSession).toMatch(/^[0-9a-f]{8}$/);
    expect(rows.map(([, , session]) => session)).toEqual([adminSession, adminSession, adminSession]);
  });

  it("never shows a password anywhere in the audit (AUD-028)", async () => {
    const page = await admin.evaluate<string>("document.body.innerText");

    expect(page).not.toContain(PASSWORD);
    expect(page).not.toContain(NEW_PASSWORD);
    expect(page).not.toContain("argon2");
  });

  it("lets a normal user read the same audit, with nothing to change (AUD-009)", async () => {
    await admin.open(`${baseUrl}/admin/users`);
    await admin.waitFor("table");
    await rowAction(admin, "Reactivate", "Reactivate");
    await admin.waitUntil(ownRow(`!row.innerText.includes("Inactive")`));

    await signIn(alice, baseUrl, NEW_PASSWORD, USERNAME);
    await alice.waitUntil(signedInAs(USERNAME));
    await alice.clickRole("link", "Audit");
    await alice.waitFor("table");

    expect(new URL(await alice.url()).pathname).toBe("/admin/audit");
    expect((await auditRows(alice)).map(([, , , , action]) => action)).toEqual([
      "User reactivated",
      "User deactivated",
      "Password reset",
      "User created",
    ]);
    expect(await alice.evaluate<number>(`document.querySelectorAll("main button, main input, main select").length`)).toBe(0);
  });

  it("records a user's own theme change under their own session (AUD-008)", async () => {
    await alice.open(`${baseUrl}/admin`);
    await choosePreference(alice, "dark");

    const [latest] = await auditRows(alice);
    expect(latest.slice(1)).toEqual([
      USERNAME,
      expect.stringMatching(/^[0-9a-f]{8}$/),
      "UI",
      "Language or theme changed",
      USERNAME,
      "theme: light → dark",
    ]);
    expect(latest[2]).not.toBe(adminSession);
  });

  it("serves the audit read-only through the API (AUD-010)", async () => {
    const call = (method: string) =>
      alice.evaluate<{ status: number; body: unknown }>(
        `fetch("/api/audit", { method: ${JSON.stringify(method)} }).then(async (r) => ({ status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : null }))`,
      );

    const read = await call("GET");
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ ok: true, data: { entries: expect.arrayContaining([expect.objectContaining({ actor: expect.objectContaining({ username: USERNAME }) })]) } });
    for (const method of ["PATCH", "PUT", "DELETE", "POST"]) expect((await call(method)).status).toBe(405);
    expect((await auditRows(alice)).length).toBe(5);
  });

  it("shows neither audit to a visitor who isn't signed in", async () => {
    const visitor = openBrowser();
    try {
      await visitor.open(`${baseUrl}/admin/audit`);
      await visitor.waitFor("#username");
      expect(new URL(await visitor.url()).pathname).toBe("/login");

      const statuses = await visitor.evaluate<number[]>(
        `Promise.all(["/api/audit", "/api/tenants/test/audit"].map((path) => fetch(path).then((r) => r.status)))`,
      );
      expect(statuses).toEqual([401, 401]);
    } finally {
      await visitor.close();
    }
  });

  it("keeps each tenant's audit to itself: no account changes there", async () => {
    await alice.open(`${baseUrl}/admin/test`);
    // The page streams in after the static shell (strip, footer), first inside a hidden container:
    // wait until its link is really shown.
    await alice.waitUntil(
      `[...document.querySelectorAll("a")].some((a) => a.innerText === "Audit — Test" && !a.closest("[hidden]"))`,
    );
    await alice.clickRole("link", "Audit — Test");
    // Other files write Test records (materials), so the audit may hold entries: wait for its
    // table or its empty state, shown, then check that none of them is an account change.
    await alice.waitUntil(
      `[...document.querySelectorAll("main table, main [data-slot=empty-state]")].some((e) => !e.closest("[hidden]")) || document.body.innerText.includes("Nothing has been recorded yet.")`,
    );
    const actions = await alice.evaluate<string[]>(
      `[...document.querySelectorAll("main tbody tr")].map((row) => row.cells[4]?.innerText.trim() ?? "")`,
    );

    expect(actions.filter((action) => action.startsWith("User ") || action.startsWith("Password"))).toEqual([]);
    expect(new URL(await alice.url()).pathname).toBe("/admin/test/audit");
    expect(await alice.title()).toBe("Test · Audit");
    expect(await alice.text("h1")).toBe("Audit — Test");
  });
});
