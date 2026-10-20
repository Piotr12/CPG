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

// Read-only tenants through the API (spec .ai/specs/implemented/2026-10-19--2018UTC-read-only-tenants.md):
// TEN-016, TEN-017, TEN-018, TEN-020, TEN-021, API-030, AUD-016.
describe("read-only tenants through the API (R05)", () => {
  let admin: Browser;
  let una: Browser;
  let adminSecret: string;
  let unaSecret: string;
  let plate: { id: string; version: number };
  let yard: { id: string; name: string; active: boolean; version: number };
  let bracket: { id: string; output: string; version: number };
  let rod: string;
  let forecast: { material: string; location: string; date: string; quantity: string; version: number };
  const tenants = async () => json(await api("GET", "/api/tenants", adminSecret)).data as TenantRow[];
  const setReadOnly = (tenant: string, readOnly: boolean, secret = adminSecret) =>
    write("PATCH", `/api/tenants/${tenant}`, secret, { readOnly });

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, ADMIN_TOKEN);
    expect((await write("POST", "/api/users", adminSecret, { username: UNA, password: UNA_PASSWORD })).status).toBe(200);
    const created = json(
      await write("POST", "/api/tenants/prod/materials", adminSecret, { type: "raw", description: "roapi plate", baseUnit: "kg" }),
    ).data as { id: string };
    const box = await write("POST", `/api/tenants/prod/materials/${created.id}/conversions`, adminSecret, {
      unit: "box",
      numerator: "1",
      denominator: "10",
    });
    expect(box.status).toBe(200);
    plate = json(await api("GET", `/api/tenants/prod/materials/${created.id}`, adminSecret)).data;
    yard = json(await write("POST", "/api/tenants/prod/locations", adminSecret, { name: "roapi yard" })).data;
    // A BOM of this file's own materials, so the BOM writes below leave the plate's conversions alone.
    rod = json(await write("POST", "/api/tenants/prod/materials", adminSecret, { type: "raw", description: "roapi rod", baseUnit: "kg" })).data.id;
    const output = json(
      await write("POST", "/api/tenants/prod/materials", adminSecret, { type: "intermediate", description: "roapi bracket", baseUnit: "each" }),
    ).data.id as string;
    const bom = await write("POST", "/api/tenants/prod/boms", adminSecret, {
      output,
      priority: 1,
      validFrom: "2027-01-01",
      components: [{ material: rod, quantity: "2", unit: "kg" }],
    });
    expect(bom.status).toBe(200);
    bracket = json(bom).data;
    const demand = await write("POST", "/api/tenants/prod/forecasts", adminSecret, {
      material: output,
      location: yard.id,
      date: "2027-02-01",
      quantity: "10",
    });
    expect(demand.status).toBe(200);
    forecast = json(demand).data;
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

  it("refuses a master-data write of every kind, changing nothing (TEN-016, TEN-017)", async () => {
    const material = `/api/tenants/prod/materials/${plate.id}`;
    const conversions = `${material}/conversions`;
    const before = json(await api("GET", material, adminSecret)).data;
    const [box] = before.conversions as { unit: string; version: number }[];

    const refused = {
      "location create": await write("POST", "/api/tenants/prod/locations", adminSecret, { name: "roapi refused depot" }),
      "location update": await write("PATCH", `/api/tenants/prod/locations/${yard.id}`, adminSecret, {
        version: yard.version,
        name: "roapi yard renamed",
      }),
      "location deactivation": await write("PATCH", `/api/tenants/prod/locations/${yard.id}`, adminSecret, {
        version: yard.version,
        active: false,
      }),
      "material deactivation": await write("PATCH", material, adminSecret, { version: plate.version, active: false }),
      "customer create": await write("POST", "/api/tenants/prod/customers", adminSecret, { name: "roapi refused customer" }),
      "supplier create": await write("POST", "/api/tenants/prod/suppliers", adminSecret, { name: "roapi refused supplier" }),
      "conversion add": await write("POST", conversions, adminSecret, { unit: "pallet", numerator: "1", denominator: "400" }),
      "conversion change": await write("PATCH", `${conversions}/box`, adminSecret, { numerator: "1", denominator: "12", version: box.version }),
      "conversion remove": await write("DELETE", `${conversions}/box`, adminSecret, { version: box.version }),
    };

    for (const [attempt, response] of Object.entries(refused)) {
      expect({ attempt, status: response.status, code: json(response).error?.code }).toEqual({ attempt, status: 409, code: "TENANT_READ_ONLY" });
    }
    const named = async (kind: string) =>
      (json(await api("GET", `/api/tenants/prod/${kind}`, adminSecret)).data as { name: string }[]).map(({ name }) => name);
    expect(await named("locations")).not.toContain("roapi refused depot");
    expect(await named("customers")).not.toContain("roapi refused customer");
    expect(await named("suppliers")).not.toContain("roapi refused supplier");
    expect(json(await api("GET", `/api/tenants/prod/locations/${yard.id}`, adminSecret)).data).toEqual(yard);
    expect(json(await api("GET", material, adminSecret)).data).toEqual(before);
    expect(before).toMatchObject({ active: true, version: plate.version, conversions: [expect.objectContaining({ unit: "box", denominator: "10" })] });
  });

  it("refuses a BOM create, recipe change and deactivation in read-only Prod, changing nothing (TEN-016, TEN-017)", async () => {
    const path = `/api/tenants/prod/boms/${bracket.id}`;
    const before = json(await api("GET", path, adminSecret)).data;

    const refused = {
      "BOM create": await write("POST", "/api/tenants/prod/boms", adminSecret, {
        output: bracket.output,
        priority: 2,
        validFrom: "2027-01-01",
        components: [{ material: rod, quantity: "3", unit: "kg" }],
      }),
      "BOM recipe change": await write("PATCH", path, adminSecret, {
        version: bracket.version,
        components: [{ material: rod, quantity: "3", unit: "kg" }],
      }),
      "BOM deactivation": await write("PATCH", path, adminSecret, { version: bracket.version, active: false }),
    };

    for (const [attempt, response] of Object.entries(refused)) {
      expect({ attempt, status: response.status, code: json(response).error?.code }).toEqual({ attempt, status: 409, code: "TENANT_READ_ONLY" });
    }
    const prod = json(await api("GET", "/api/tenants/prod/boms", adminSecret)).data as { id: string; output: string }[];
    expect(prod.filter(({ output }) => output === bracket.output).map(({ id }) => id)).toEqual([bracket.id]);
    expect(json(await api("GET", path, adminSecret)).data).toEqual(before);
    expect(before).toMatchObject({ active: true, revision: 1, version: bracket.version, components: [expect.objectContaining({ material: rod, quantity: "2.000000" })] });
  });

  it("refuses a forecast create, change and removal in read-only Prod, changing nothing (R05)", async () => {
    const path = `/api/tenants/prod/forecasts/${forecast.material}/${forecast.location}/${forecast.date}`;

    const refused = {
      "forecast create": await write("POST", "/api/tenants/prod/forecasts", adminSecret, { ...forecast, date: "2027-02-02" }),
      "forecast change": await write("PATCH", path, adminSecret, { quantity: "99", version: forecast.version }),
      "forecast removal": await write("DELETE", path, adminSecret, { version: forecast.version }),
    };

    for (const [attempt, response] of Object.entries(refused)) {
      expect({ attempt, status: response.status, code: json(response).error?.code }).toEqual({ attempt, status: 409, code: "TENANT_READ_ONLY" });
    }
    const rows = json(await api("GET", `/api/tenants/prod/forecasts?material=${forecast.material}`, adminSecret)).data;
    expect(rows).toEqual([forecast]);
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

  it("refuses the admin's master-data update in read-only Test and keeps the stored values (TEN-016)", async () => {
    const { generation, readOnly } = (await tenants()).find(({ code }) => code === "test")!;
    const [bolt] = json(await api("GET", "/api/tenants/test/materials", adminSecret)).data as {
      id: string;
      description: string;
      version: number;
    }[];

    const edited = await write(
      "PATCH",
      `/api/tenants/test/materials/${bolt.id}`,
      adminSecret,
      { version: bolt.version, description: "roapi renamed" },
      generation,
    );

    expect(readOnly).toBe(true);
    expect(edited.status).toBe(409);
    expect(json(edited).error.code).toBe("TENANT_READ_ONLY");
    expect(json(await api("GET", `/api/tenants/test/materials/${bolt.id}`, adminSecret)).data).toMatchObject({
      description: bolt.description,
      version: bolt.version,
    });
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

  it("lets the refused master-data writes through too once Prod is writable again", async () => {
    // The same requests that were refused: they were valid, and only the flag stopped them.
    const conversion = (json(await api("GET", `/api/tenants/prod/materials/${plate.id}`, adminSecret)).data.conversions as { version: number }[])[0];
    const responses = [
      await write("PATCH", `/api/tenants/prod/locations/${yard.id}`, adminSecret, { version: yard.version, name: "roapi yard renamed" }),
      await write("PATCH", `/api/tenants/prod/materials/${plate.id}/conversions/box`, adminSecret, {
        numerator: "1",
        denominator: "12",
        version: conversion.version,
      }),
      await write("POST", "/api/tenants/prod/customers", adminSecret, { name: "roapi later customer" }),
    ];

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200]);
    expect(json(responses[0]).data).toMatchObject({ name: "roapi yard renamed" });
  });

  it("records making Prod writable again in the Global audit, before and after (AUD-016)", async () => {
    const { entries } = json(await api("GET", "/api/audit?limit=50", adminSecret)).data as {
      entries: { action: string; subject: { id: string }; before: unknown; after: unknown; token: { name: string } | null }[];
    };
    const [latest] = entries.filter(({ action, subject }) => action === "tenants.tenant.read-only-changed" && subject.id === "prod");

    expect(latest).toMatchObject({ before: { readOnly: true }, after: { readOnly: false }, token: { name: ADMIN_TOKEN } });
  });
});
