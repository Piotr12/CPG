import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signInAs, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own accounts and records: other files share the app, and users are never deleted.
const UNA = "roapi-una";
const UNA_PASSWORD = "roapi una's first password";
const ADMIN_TOKEN = "roapi-ops";

interface TenantRow {
  code: string;
  generation: number;
  readOnly: boolean;
}

const api = (method: string, path: string, secret: string, options?: { key?: string; body?: unknown; generation?: number }) =>
  callApi(baseUrl, method, path, secret, options);
/** A write as a well-behaved client sends it: a fresh Idempotency-Key, and the body. */
const write = (method: string, path: string, secret: string, body?: unknown, generation?: number) =>
  api(method, path, secret, { key: randomUUID(), body, generation });

// Read-only tenants through the API (spec .ai/specs/2026-10-19--2018UTC-read-only-tenants.md):
// TEN-017, TEN-018, TEN-020, TEN-021, API-030, AUD-016.
describe("read-only tenants through the API (R05)", () => {
  let admin: Browser;
  let una: Browser;
  let adminSecret: string;
  let unaSecret: string;
  let plate: { id: string; version: number };
  const tenants = async () => json(await api("GET", "/api/tenants", adminSecret)).data as TenantRow[];
  const setReadOnly = (tenant: string, readOnly: boolean, secret = adminSecret) =>
    write("PATCH", `/api/tenants/${tenant}`, secret, { readOnly });

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, ADMIN_TOKEN);
    expect((await write("POST", "/api/users", adminSecret, { username: UNA, password: UNA_PASSWORD })).status).toBe(200);
    plate = json(
      await write("POST", "/api/tenants/prod/materials", adminSecret, { type: "raw", description: "roapi plate", baseUnit: "kg" }),
    ).data;
  });
  afterAll(async () => {
    try {
      // Later files write to both tenants, and expect the admin to hold no tokens.
      if (adminSecret) {
        for (const tenant of ["test", "prod"]) expect((await setReadOnly(tenant, false)).status).toBe(200);
        const own = (json(await api("GET", "/api/tokens", adminSecret)).data as { id: string; name: string }[]).find(
          (token) => token.name === ADMIN_TOKEN,
        );
        expect((await write("DELETE", `/api/tokens/${own!.id}`, adminSecret)).status).toBe(200);
      }
    } finally {
      await Promise.all([admin, una].map((browser) => browser.close()));
    }
  });

  it("lets only the admin set the flag, and shows it in the tenant metadata", async () => {
    await signInAs(una, baseUrl, UNA, UNA_PASSWORD);
    await openTokens(una, baseUrl);
    unaSecret = await createToken(una, "roapi-una-cli");

    const refused = await setReadOnly("prod", true, unaSecret);
    expect(refused.status).toBe(403);
    expect((await tenants()).map(({ code, readOnly }) => `${code} ${readOnly}`)).toEqual(["test false", "prod false"]);

    const set = await setReadOnly("prod", true);
    expect(set.status).toBe(200);
    expect(json(set).data).toMatchObject({ code: "prod", readOnly: true });
    expect((await tenants()).map(({ code, readOnly }) => `${code} ${readOnly}`)).toEqual(["test false", "prod true"]);
    expect(json(await api("GET", "/api/tenants/prod", unaSecret)).data).toMatchObject({ readOnly: true });
  });

  it("refuses the admin token's business writes to read-only Prod, changing nothing (TEN-017, API-030)", async () => {
    const created = await write("POST", "/api/tenants/prod/materials", adminSecret, {
      type: "raw",
      description: "roapi refused",
      baseUnit: "kg",
    });
    const edited = await write("PATCH", `/api/tenants/prod/materials/${plate.id}`, adminSecret, {
      version: plate.version,
      description: "roapi plate edited",
    });

    for (const response of [created, edited]) {
      expect(response.status).toBe(409);
      expect(json(response).error.code).toBe("TENANT_READ_ONLY");
    }
    const prod = json(await api("GET", "/api/tenants/prod/materials", adminSecret)).data as { description: string }[];
    expect(prod.map(({ description }) => description)).toContain("roapi plate");
    expect(prod.map(({ description }) => description)).not.toContain("roapi refused");
    expect(json(await api("GET", `/api/tenants/prod/materials/${plate.id}`, adminSecret)).data).toMatchObject({
      description: "roapi plate",
      version: plate.version,
    });
  });

  it("still reads Prod's data and audit, for every account (TEN-018)", async () => {
    for (const secret of [adminSecret, unaSecret]) {
      expect((await api("GET", "/api/tenants/prod/materials", secret)).status).toBe(200);
      expect((await api("GET", "/api/tenants/prod/audit", secret)).status).toBe(200);
    }
  });

  it("keeps Test writable while Prod is read-only (TEN-021)", async () => {
    const { generation } = (await tenants()).find(({ code }) => code === "test")!;

    const created = await write(
      "POST",
      "/api/tenants/test/materials",
      adminSecret,
      { type: "raw", description: "roapi test bolt", baseUnit: "each" },
      generation,
    );

    expect(created.status).toBe(200);
  });

  it("lets account work go on with both tenants read-only (TEN-020)", async () => {
    expect((await setReadOnly("test", true)).status).toBe(200);

    const user = await write("POST", "/api/users", adminSecret, { username: "roapi-ben", password: "roapi ben's password" });
    const preferences = await write("PATCH", "/api/preferences", unaSecret, { theme: "dark" });
    const extra = await createToken(una, "roapi-una-extra");
    const ownTokens = json(await api("GET", "/api/tokens", unaSecret)).data as { id: string; name: string }[];
    const revoked = await write("DELETE", `/api/tokens/${ownTokens.find(({ name }) => name === "roapi-una-extra")!.id}`, extra);

    expect(user.status).toBe(200);
    expect(json(preferences).data).toMatchObject({ theme: "dark" });
    expect(revoked.status).toBe(200);
    expect((await tenants()).map(({ readOnly }) => readOnly)).toEqual([true, true]);
  });

  it("records each flag change in the Global audit, before and after (AUD-016)", async () => {
    const { entries } = json(await api("GET", "/api/audit?limit=50", adminSecret)).data as {
      entries: { action: string; subject: { id: string }; before: unknown; after: unknown; token: { name: string } | null }[];
    };
    const changes = entries.filter(({ action }) => action === "tenants.tenant.read-only-changed");

    expect(changes.slice(0, 2).map(({ subject, before, after, token }) => ({ tenant: subject.id, before, after, token: token?.name }))).toEqual([
      { tenant: "test", before: { readOnly: false }, after: { readOnly: true }, token: ADMIN_TOKEN },
      { tenant: "prod", before: { readOnly: false }, after: { readOnly: true }, token: ADMIN_TOKEN },
    ]);
  });

  it("lets the same write through once Prod is writable again (E2E-011)", async () => {
    expect(json(await setReadOnly("prod", false)).data).toMatchObject({ readOnly: false });

    const edited = await write("PATCH", `/api/tenants/prod/materials/${plate.id}`, adminSecret, {
      version: plate.version,
      description: "roapi plate edited",
    });

    expect(edited.status).toBe(200);
    expect(json(edited).data).toMatchObject({ description: "roapi plate edited" });
  });
});
