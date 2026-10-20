import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens as openTokensAt, submitToken } from "./tokens";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const TARA_PASSWORD = "tara's first password";
const OMAR_PASSWORD = "omar's first password";

/** Calls the API the way an external tool does: no cookies, only the bearer token, and a fresh key on writes. */
async function api(path: string, secret: string, method = "GET") {
  const headers: Record<string, string> = { authorization: `Bearer ${secret}` };
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const response = await fetch(`${baseUrl}${path}`, { method, headers });
  const body = response.headers.get("content-type")?.includes("json") ? await response.json() : null;
  return { status: response.status, body };
}

interface TokenRow {
  id: string;
  name: string;
  lastUsedAt: string | null;
}

const openTokens = (browser: Browser) => openTokensAt(browser, baseUrl);

describe("named API tokens", () => {
  let admin: Browser;
  let tara: Browser;
  let omar: Browser;
  const secrets: Record<string, string> = {};

  beforeAll(async () => {
    [admin, tara, omar] = [openBrowser(), openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await createUser(admin, baseUrl, "tara", TARA_PASSWORD);
    await createUser(admin, baseUrl, "omar", OMAR_PASSWORD);
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

  it("keeps every Revoke in view with the longest name, on a desktop and on a phone", async () => {
    const longest = "Nightly-ERP-export-for-the-Jozefoslaw-plant-scheduler-bot-v2-oka";
    expect(longest).toHaveLength(64);
    const longSecret = await createToken(tara, longest);
    /** Whether every row's Revoke sits inside the table's box and the window, with no sideways scroll. */
    const revokeInView = () =>
      tara.evaluate<boolean>(`(() => {
        const box = document.querySelector("table").parentElement;
        const edge = Math.min(box.getBoundingClientRect().right, window.innerWidth);
        const buttons = [...document.querySelectorAll("tbody button")];
        return buttons.length === 3 && box.scrollWidth <= box.clientWidth &&
          buttons.every((button) => button.getBoundingClientRect().right <= edge);
      })()`);

    try {
      await tara.setViewport(1100, 760);
      expect(await revokeInView()).toBe(true);
      await tara.setViewport(390, 844);
      expect(await revokeInView()).toBe(true);
    } finally {
      await tara.setViewport(1280, 720);
    }
    const id = ((await api("/api/tokens", longSecret)).body.data as TokenRow[]).find((t) => t.name === longest)!.id;
    expect((await api(`/api/tokens/${id}`, longSecret, "DELETE")).status).toBe(200);
  });

  it("revokes only the caller's own token through the API, at once, leaving the other working (API-008, API-007)", async () => {
    const listed = (await api("/api/tokens", secrets.agent2)).body.data as TokenRow[];
    expect(listed.map((token) => token.name)).toEqual(["agent2", "agent1"]);
    const agent1 = listed.find((token) => token.name === "agent1")!;
    expect(agent1.lastUsedAt).not.toBeNull();

    const foreign = await api(`/api/tokens/${agent1.id}`, secrets.omar, "DELETE");
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("TOKEN_NOT_FOUND");
    expect((await api("/api/tenants", secrets.agent1)).status).toBe(200);

    const cookieOnly = await fetch(`${baseUrl}/api/tokens/${agent1.id}`, { method: "DELETE" });
    expect(cookieOnly.status).toBe(401);

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

  it("keeps token creation and revocation in the Global audit, naming the token behind an API call (AUD-007, AUD-014)", async () => {
    const audit = (await api("/api/audit?limit=100", secrets.agent2)).body.data.entries as {
      action: string;
      subject: { label: string };
      actor: { username: string };
      channel: string;
      token: { name: string } | null;
    }[];
    const about = (name: string) =>
      audit
        .filter((entry) => entry.subject.label === name && entry.actor.username === "tara")
        .map(({ action, channel, token }) => [action, channel, token?.name ?? null]);

    expect(about("agent1")).toEqual([
      ["tokens.api-token.revoked", "api", "agent2"],
      ["tokens.api-token.created", "ui", null],
    ]);
    expect(JSON.stringify(audit)).not.toContain(secrets.agent1);
  });

  it("gives the admin's own token admin rights but no way to mint, and revokes it from the screen (API-002, API-032)", async () => {
    await openTokens(admin);
    secrets.admin = await createToken(admin, "ops");

    expect((await api("/api/users", secrets.admin)).status).toBe(200);
    expect((await api("/api/tokens", secrets.admin, "POST")).status).toBe(405);

    await admin.clickRole("button", "Revoke ops");
    await admin.waitFor("[role=alertdialog]");
    expect(await admin.text("[role=alertdialog] p")).toBe("Anything using it stops working at once.");
    await admin.clickRole("button", "Revoke");
    await admin.waitForText("No tokens yet.");
    expect((await api("/api/users", secrets.admin)).status).toBe(401);
  });

  it("ends every token of a user the admin resets or deactivates, for reads and writes, and audits each (API-011, API-012, AUD-014)", async () => {
    const taraTokens = (await api("/api/tokens", secrets.agent2)).body.data as TokenRow[];
    const omarTokens = (await api("/api/tokens", secrets.omar)).body.data as TokenRow[];
    const tokenId = taraTokens[0].id;

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
    // Scoped to omar's row: other files leave their own inactive users in this shared database.
    await admin.waitUntil(
      `[...document.querySelectorAll("tbody tr")].some((row) => row.innerText.startsWith("omar\\t") && row.innerText.includes("Inactive"))`,
    );

    for (const secret of [secrets.agent2, secrets.omar]) {
      expect((await api("/api/tenants", secret)).status).toBe(401);
      expect((await api(`/api/tokens/${tokenId}`, secret, "DELETE")).status).toBe(401);
    }

    // Every token the reset and the deactivation deleted is revoked in the Global audit, by the admin.
    await openTokens(admin);
    const auditor = await createToken(admin, "tokens-auditor");
    const audit = (await api("/api/audit?limit=100", auditor)).body.data.entries as {
      action: string;
      subject: { type: string; id: string; label: string };
      actor: { username: string };
      channel: string;
    }[];
    const ended = [...taraTokens, ...omarTokens];
    expect(ended.length).toBeGreaterThanOrEqual(2);
    const revocations = audit
      .filter(({ action, subject }) => action === "tokens.api-token.revoked" && ended.some(({ id }) => id === subject.id))
      .map(({ action, subject, actor, channel }) => [action, subject.label, actor.username, channel]);
    expect(revocations.sort()).toEqual(ended.map(({ name }) => ["tokens.api-token.revoked", name, "admin", "ui"]).sort());
  });
});
