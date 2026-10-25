import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { allPages, callApi, json, type UserRow } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAs, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own accounts: other files share the app, and users are never deleted.
const UNA = "apiu-una";
const UNA_PASSWORD = "apiu una's first password";
const UNA_NEW_PASSWORD = "apiu una's second password";
/** Deactivated by the API-031 test; left inactive. */
const DORA = "apiu-dora";
const ADMIN_TOKEN = "apiu-ops";

const api = (method: string, path: string, secret: string, options?: { key?: string; body?: unknown }) =>
  callApi(baseUrl, method, path, secret, options);
/** A write as a well-behaved client sends it: a fresh Idempotency-Key, and the body. */
const write = (method: string, path: string, secret: string, body?: unknown) =>
  api(method, path, secret, { key: randomUUID(), body });

// The user routes end to end with real bearer tokens: TEN-005, TEN-006, TEN-008, API-010.
describe("the users API", () => {
  let admin: Browser;
  let una: Browser;
  let adminSecret: string;
  let unaSecret: string;
  const userRow = async (username: string): Promise<UserRow | undefined> =>
    (json(await api("GET", "/api/users", adminSecret)).data as UserRow[]).find((user) => user.username === username);

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, ADMIN_TOKEN);
    expect((await write("POST", "/api/users", adminSecret, { username: UNA, password: UNA_PASSWORD })).status).toBe(200);

    await signInAs(una, baseUrl, UNA, UNA_PASSWORD);
    await openTokens(una, baseUrl);
    unaSecret = await createToken(una, "apiu-una-cli");
  });
  afterAll(async () => {
    try {
      // Other files expect the admin to hold no tokens: revoke this file's with itself. Without one,
      // beforeAll failed first: leave its error to explain the run.
      if (adminSecret) {
        const own = (json(await api("GET", "/api/tokens", adminSecret)).data as { id: string; name: string }[]).find(
          (token) => token.name === ADMIN_TOKEN,
        );
        expect(own).toBeDefined();
        expect((await write("DELETE", `/api/tokens/${own!.id}`, adminSecret)).status).toBe(200);
      }
    } finally {
      await Promise.all([admin, una].map((browser) => browser.close()));
    }
  });

  it("refuses a normal user's token on the password route, for their own id too (TEN-005)", async () => {
    const before = (await userRow(UNA))!;
    const adminRow = (await userRow("admin"))!;

    for (const { id, version } of [before, adminRow]) {
      const response = await write("PUT", `/api/users/${id}/password`, unaSecret, { password: "apiu taken over", version });

      expect(response.status).toBe(403);
      expect(json(response).error.code).toBe("FORBIDDEN");
    }
    // Nothing changed: the version stands, and a reset would have ended this very token.
    expect(await userRow(UNA)).toEqual(before);
    expect((await api("GET", "/api/tenants", unaSecret)).status).toBe(200);
  });

  it("refuses a normal user's token on creating and changing users, but not on their own settings (API-010)", async () => {
    const before = (await userRow(UNA))!;

    const created = await write("POST", "/api/users", unaSecret, { username: "apiu-mallory", password: UNA_PASSWORD });
    const changed = await write("PATCH", `/api/users/${before.id}`, unaSecret, { active: false, version: before.version });

    for (const response of [created, changed]) {
      expect(response.status).toBe(403);
      expect(json(response).error.code).toBe("FORBIDDEN");
    }
    expect(await userRow("apiu-mallory")).toBeUndefined();
    expect(await userRow(UNA)).toEqual(before);
    const own = await write("PATCH", "/api/preferences", unaSecret, { theme: "dark" });
    expect(own.status).toBe(200);
    expect(json(own).data).toEqual({ locale: "en", theme: "dark" });
  });

  it("deactivates a user through PATCH /api/users/{id} with a Global audit entry, leaving both tenants' records and audits as they were (API-031)", async () => {
    const created = await write("POST", "/api/users", adminSecret, { username: DORA, password: UNA_PASSWORD });
    expect(created.status, created.text).toBe(200);
    const dora = (await userRow(DORA))!;
    /** Each tenant's master data, current stock and audit, read whole (`allPages`) so a change past the first page counts. */
    const tenants = async () => {
      const read = async (path: string) => json(await api("GET", path, adminSecret)).data;
      const snapshot: Record<string, unknown> = {};
      for (const tenant of ["test", "prod"]) {
        for (const kind of ["materials", "locations", "customers", "suppliers"]) {
          snapshot[`${tenant} ${kind}`] = await allPages(async (page) => read(`/api/tenants/${tenant}/${kind}?page=${page}`));
        }
        snapshot[`${tenant} stock`] = await allPages(async (page) => (await read(`/api/tenants/${tenant}/reports/stock?page=${page}`)).rows);
        snapshot[`${tenant} audit`] = (await read(`/api/tenants/${tenant}/audit?limit=100`)).entries;
      }
      return snapshot;
    };
    const before = await tenants();

    const changed = await write("PATCH", `/api/users/${dora.id}`, adminSecret, { active: false, version: dora.version });
    expect(changed.status, changed.text).toBe(200);
    expect(json(changed).data).toMatchObject({ id: dora.id, active: false, version: dora.version + 1 });

    const global = (json(await api("GET", "/api/audit?limit=100", adminSecret)).data.entries as {
      action: string; subject: { type: string; id: string }; channel: string; token: { name: string } | null; before: unknown; after: unknown;
    }[]).filter(({ subject }) => subject.id === dora.id);
    expect(global.map(({ action }) => action)).toEqual(["users.user.deactivated", "users.user.created"]);
    expect(global[0]).toMatchObject({ subject: { type: "User" }, channel: "api", token: { name: ADMIN_TOKEN }, before: { active: true }, after: { active: false } });
    expect(await tenants()).toEqual(before);
  });

  it("offers no way to delete a user, even to the admin (TEN-008)", async () => {
    const before = (await userRow(UNA))!;

    expect((await write("DELETE", `/api/users/${before.id}`, adminSecret)).status).toBe(405);
    expect(await userRow(UNA)).toEqual(before);
  });

  it("ends the user's sessions and tokens on the admin's password reset; only the new password works (TEN-006)", async () => {
    const before = (await userRow(UNA))!;

    const reset = await write("PUT", `/api/users/${before.id}/password`, adminSecret, {
      password: UNA_NEW_PASSWORD,
      version: before.version,
    });

    expect(reset.status).toBe(200);
    expect(json(reset).data).toMatchObject({ id: before.id, username: UNA, active: true, version: before.version + 1 });
    expect((await api("GET", "/api/tenants", unaSecret)).status).toBe(401);
    await una.open(`${baseUrl}/admin`);
    await una.waitFor("#username");
    expect(new URL(await una.url()).pathname).toBe("/login");

    await signIn(una, baseUrl, UNA_PASSWORD, UNA);
    await una.waitFor("[role=alert]");
    expect(await una.text("[role=alert]")).toBe("Invalid username or password. Check both and try again. If you cannot sign in, contact your administrator.");

    await signInAs(una, baseUrl, UNA, UNA_NEW_PASSWORD);
    expect(new URL(await una.url()).pathname).toBe("/admin");
  });
});
