import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const TARA_PASSWORD = "tara's first password";
const OMAR_PASSWORD = "omar's first password";

/** Calls the API the way an external tool does: no cookies, only the bearer token. */
async function api(path: string, secret: string, method = "GET") {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { authorization: `Bearer ${secret}` } });
  const body = response.headers.get("content-type")?.includes("json") ? await response.json() : null;
  return { status: response.status, body };
}

interface TokenRow {
  id: string;
  name: string;
  lastUsedAt: string | null;
}

/** Creates a normal user on /admin/users. */
async function createUser(admin: Browser, username: string, password: string) {
  await admin.open(`${baseUrl}/admin/users`);
  await admin.waitFor("table");
  await admin.clickRole("button", "Create user");
  await admin.fillLabel("Username", username);
  await admin.fillLabel("Initial password", password);
  await admin.click("[role=dialog] button[type=submit]");
  await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
  await admin.waitForText(username);
}

/** Opens the tokens screen from the header link. */
async function openTokens(browser: Browser) {
  await browser.open(`${baseUrl}/admin`);
  await browser.waitFor("main strong");
  await browser.clickRole("link", "API tokens");
  await browser.waitFor("table");
}

/** Submits the Create token dialog; resolves once the form answers with the secret or an error. */
async function submitToken(browser: Browser, name: string) {
  await browser.clickRole("button", "Create token");
  await browser.fillLabel("Name", name);
  await browser.click("[role=dialog] button[type=submit]");
  await browser.waitUntil(`document.querySelector("#api-token-secret") || document.querySelector("[role=dialog] [role=alert]")`);
}

/** Creates a token on the tokens screen and returns its secret, read from the one-time panel. */
async function createToken(browser: Browser, name: string): Promise<string> {
  await submitToken(browser, name);
  const secret = await browser.evaluate<string>(`document.querySelector("#api-token-secret").value`);
  await browser.clickRole("button", "Done");
  await browser.waitUntil(`!document.querySelector("[role=dialog]")`);
  await browser.waitForText(name);
  return secret;
}

describe("named API tokens", () => {
  let admin: Browser;
  let tara: Browser;
  let omar: Browser;
  const secrets: Record<string, string> = {};

  beforeAll(async () => {
    [admin, tara, omar] = [openBrowser(), openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await createUser(admin, "tara", TARA_PASSWORD);
    await createUser(admin, "omar", OMAR_PASSWORD);
    await signIn(tara, baseUrl, TARA_PASSWORD, "tara");
    await signIn(omar, baseUrl, OMAR_PASSWORD, "omar");
  });
  afterAll(() => Promise.all([admin, tara, omar].map((browser) => browser.close())));

  it("lets a normal user create a token whose secret is shown once (API-001, API-006)", async () => {
    await openTokens(tara);
    expect(await tara.title()).toBe("API tokens · Caveman Planning Good");
    expect(await tara.text("main p")).toMatch(/until you revoke it\. Tokens never expire\.$/);

    secrets.agent1 = await createToken(tara, "agent1");

    expect(secrets.agent1).toMatch(/^cpg_[A-Za-z0-9_-]{43}$/);
    await tara.open(`${baseUrl}/admin/tokens`);
    await tara.waitFor("table");
    expect(await tara.texts("tbody td:first-child")).toEqual(["agent1"]);
    expect(await tara.evaluate<boolean>(`document.documentElement.outerHTML.includes(${JSON.stringify(secrets.agent1)})`)).toBe(
      false,
    );
  });

  it("authenticates the API with the owner's rights and offers no way to mint (API-010, API-032)", async () => {
    const tenants = await api("/api/tenants", secrets.agent1);
    expect(tenants.status).toBe(200);
    expect(tenants.body.data.map((tenant: { code: string }) => tenant.code)).toEqual(["test", "prod"]);

    const users = await api("/api/users", secrets.agent1);
    expect(users.status).toBe(403);
    expect(users.body.error.code).toBe("FORBIDDEN");

    expect((await api("/api/tokens", secrets.agent1, "POST")).status).toBe(405);
    expect((await api("/api/tokens", "cpg_not-a-real-token")).status).toBe(401);
  });

  it("keeps names unique per account only (API-003, API-004)", async () => {
    await submitToken(tara, "agent1");
    expect(await tara.text("[role=dialog] [role=alert]")).toBe("You already have a token with that name.");
    await tara.clickRole("button", "Cancel");
    await tara.waitUntil(`!document.querySelector("[role=dialog]")`);

    secrets.agent2 = await createToken(tara, "agent2");
    await openTokens(omar);
    secrets.omar = await createToken(omar, "agent1");

    expect((await api("/api/tenants", secrets.omar)).status).toBe(200);
  });

  it("revokes a token through the API at once, leaving the other working (API-008, API-007)", async () => {
    const listed = (await api("/api/tokens", secrets.agent2)).body.data as TokenRow[];
    expect(listed.map((token) => token.name)).toEqual(["agent2", "agent1"]);
    const agent1 = listed.find((token) => token.name === "agent1")!;
    expect(agent1.lastUsedAt).not.toBeNull();

    const revoked = await api(`/api/tokens/${agent1.id}`, secrets.agent2, "DELETE");
    expect(revoked).toEqual({ status: 200, body: { ok: true, data: { id: agent1.id } } });

    const refused = await api("/api/tenants", secrets.agent1);
    expect(refused.status).toBe(401);
    expect(refused.body.error.message).toBe("Invalid or revoked token.");
    expect((await api("/api/tenants", secrets.agent2)).status).toBe(200);

    await tara.open(`${baseUrl}/admin/tokens`);
    await tara.waitFor("table");
    expect(await tara.texts("tbody tr")).toEqual([expect.stringMatching(/^agent2\t.+ UTC\t\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/)]);
  });

  it("gives the admin's own token admin rights, and revokes it from the screen (API-002)", async () => {
    await openTokens(admin);
    secrets.admin = await createToken(admin, "ops");

    expect((await api("/api/users", secrets.admin)).status).toBe(200);

    await admin.clickRole("button", "Revoke ops");
    await admin.waitFor("[role=alertdialog]");
    expect(await admin.text("[role=alertdialog] p")).toBe("Anything using it stops working at once.");
    await admin.clickRole("button", "Revoke");
    await admin.waitForText("No tokens yet.");
    expect((await api("/api/users", secrets.admin)).status).toBe(401);
  });

  it("ends every token of a user the admin resets or deactivates, for reads and writes (API-011, API-012)", async () => {
    const tokenId = ((await api("/api/tokens", secrets.agent2)).body.data as TokenRow[])[0].id;

    await admin.open(`${baseUrl}/admin/users`);
    await admin.waitFor("table");
    await admin.clickRole("button", "Actions for tara");
    await admin.clickRole("menuitem", "Reset password");
    await admin.fillLabel("New password", "tara's second password");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);

    await admin.clickRole("button", "Actions for omar");
    await admin.clickRole("menuitem", "Deactivate");
    await admin.waitFor("[role=alertdialog]");
    await admin.clickRole("button", "Deactivate");
    await admin.waitForText("Inactive");

    for (const secret of [secrets.agent2, secrets.omar]) {
      expect((await api("/api/tenants", secret)).status).toBe(401);
      expect((await api(`/api/tokens/${tokenId}`, secret, "DELETE")).status).toBe(401);
    }
  });
});
