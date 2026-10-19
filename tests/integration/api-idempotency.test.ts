import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const PASSWORD = "idem first password";

interface UserRow {
  id: string;
  username: string;
  active: boolean;
  version: number;
}

/** Calls the API as an external tool does: the bearer token, and the given headers only. */
async function api(method: string, path: string, secret: string, { key, body }: { key?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${secret}`, "content-type": "application/json" };
  if (key) headers["idempotency-key"] = key;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, replayed: response.headers.get("idempotent-replayed"), text: await response.text() };
}
const json = (response: { text: string }) => JSON.parse(response.text);

describe("API writes are safe to retry, and stale edits are rejected", () => {
  let admin: Browser;
  let adminSecret: string;
  const userRow = async (username: string): Promise<UserRow> =>
    (json(await api("GET", "/api/users", adminSecret)).data as UserRow[]).find((user) => user.username === username)!;

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, "idem-ops");
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await api("GET", "/api/tokens", adminSecret)).data as { id: string; name: string }[]).find(
      (token) => token.name === "idem-ops",
    )!;
    await api("DELETE", `/api/tokens/${own.id}`, adminSecret, { key: randomUUID() });
    await admin.close();
  });

  it("refuses a write without an Idempotency-Key (API-019)", async () => {
    const response = await api("POST", "/api/users", adminSecret, { body: { username: "idem-nokey", password: PASSWORD } });

    expect(response.status).toBe(400);
    expect(json(response).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(await userRow("idem-nokey")).toBeUndefined();
  });

  it("creates once and replays the first answer for the same key and body (API-020, API-021)", async () => {
    const key = randomUUID();
    const first = await api("POST", "/api/users", adminSecret, { key, body: { username: "idem-carol", password: PASSWORD } });
    const again = await api("POST", "/api/users", adminSecret, { key, body: { username: "idem-carol", password: PASSWORD } });

    expect(first.status).toBe(200);
    expect(first.replayed).toBeNull();
    expect(again.status).toBe(200);
    expect(again.replayed).toBe("true");
    expect(again.text).toBe(first.text);
    const users = json(await api("GET", "/api/users", adminSecret)).data as UserRow[];
    expect(users.filter((user) => user.username === "idem-carol")).toHaveLength(1);
  });

  it("refuses the key with another body, or for another operation (API-022, API-023)", async () => {
    const key = randomUUID();
    await api("POST", "/api/users", adminSecret, { key, body: { username: "idem-dave", password: PASSWORD } });

    const otherBody = await api("POST", "/api/users", adminSecret, { key, body: { username: "idem-dave2", password: PASSWORD } });
    expect(otherBody.status).toBe(409);
    expect(json(otherBody).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await userRow("idem-dave2")).toBeUndefined();

    const dave = await userRow("idem-dave");
    const otherOperation = await api("PATCH", `/api/users/${dave.id}`, adminSecret, {
      key,
      body: { active: false, version: dave.version },
    });
    expect(otherOperation.status).toBe(409);
    expect(json(otherOperation).error.message).toMatch(/another request \(POST \/api\/users\)/);
    expect((await userRow("idem-dave")).active).toBe(true);
  });

  it("keeps one account's key apart from another's (API-025)", async () => {
    const key = randomUUID();
    await api("POST", "/api/users", adminSecret, { key, body: { username: "idem-erin", password: PASSWORD } });
    const erin = openBrowser();
    try {
      await signIn(erin, baseUrl, PASSWORD, "idem-erin");
      await openTokens(erin, baseUrl);
      const erinSecret = await createToken(erin, "idem-erin-cli");

      const own = await api("PATCH", "/api/preferences", erinSecret, { key, body: { theme: "dark" } });

      expect(own.status).toBe(200);
      expect(own.replayed).toBeNull();
      expect(json(own).data).toEqual({ locale: "en", theme: "dark" });
    } finally {
      await erin.close();
    }
  });

  it("rejects a stale version through the API and keeps the newer change (API-029, AUD-025)", async () => {
    const carol = await userRow("idem-carol");

    const first = await api("PATCH", `/api/users/${carol.id}`, adminSecret, {
      key: randomUUID(),
      body: { active: false, version: carol.version },
    });
    const stale = await api("PATCH", `/api/users/${carol.id}`, adminSecret, {
      key: randomUUID(),
      body: { active: true, version: carol.version },
    });

    expect(first.status).toBe(200);
    expect(json(first).data).toMatchObject({ active: false, version: carol.version + 1 });
    expect(stale.status).toBe(409);
    expect(json(stale).error.code).toBe("VERSION_CONFLICT");
    expect(await userRow("idem-carol")).toMatchObject({ active: false, version: carol.version + 1 });
  });

  it("shows a conflict in the UI when the user changed after the page loaded, and refreshes the row (AUD-024)", async () => {
    await admin.open(`${baseUrl}/admin/users`);
    await admin.waitFor("table");
    await admin.clickRole("button", "Actions for idem-carol");
    await admin.clickRole("menuitem", "Reset password");
    await admin.fillLabel("New password", "idem second password");

    // Someone else reactivates carol while the dialog is open.
    const carol = await userRow("idem-carol");
    const elsewhere = await api("PATCH", `/api/users/${carol.id}`, adminSecret, {
      key: randomUUID(),
      body: { active: true, version: carol.version },
    });
    expect(elsewhere.status).toBe(200);

    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitFor("[role=dialog] [role=alert]");
    expect(await admin.text("[role=dialog] [role=alert]")).toBe(
      "This user was changed since you loaded the page. Check the list and try again.",
    );
    // The list behind the dialog refreshed: carol is active again, as the other change left her.
    await admin.waitUntil(
      `[...document.querySelectorAll("tbody tr")].some((row) => row.innerText.startsWith("idem-carol\\t") && row.innerText.includes("Active"))`,
    );
    await admin.clickRole("button", "Cancel");
  });

  it("replays a token revoke made with another of the caller's tokens", async () => {
    await openTokens(admin, baseUrl);
    await createToken(admin, "idem-spare");
    const spare = (json(await api("GET", "/api/tokens", adminSecret)).data as { id: string; name: string }[]).find(
      (token) => token.name === "idem-spare",
    )!;
    const key = randomUUID();

    const first = await api("DELETE", `/api/tokens/${spare.id}`, adminSecret, { key });
    const again = await api("DELETE", `/api/tokens/${spare.id}`, adminSecret, { key });

    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(again.replayed).toBe("true");
    expect(json(again)).toEqual({ ok: true, data: { id: spare.id } });
  });
});
