import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const PASSWORD = "matapi first password";

interface MaterialRow {
  id: string;
  description: string;
  baseUnit: string;
  version: number;
}

/** Calls the API as an external tool does: the bearer token, and the given headers only. */
async function api(
  method: string,
  path: string,
  secret: string,
  { key, generation, body }: { key?: string; generation?: number; body?: unknown } = {},
) {
  const headers: Record<string, string> = { authorization: `Bearer ${secret}`, "content-type": "application/json" };
  if (key) headers["idempotency-key"] = key;
  if (generation !== undefined) headers["dataset-generation"] = String(generation);
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, replayed: response.headers.get("idempotent-replayed"), text: await response.text() };
}
const json = (response: { text: string }) => JSON.parse(response.text);
/** A write with a fresh key, as a careful client sends it. */
const write = (method: string, path: string, secret: string, body: unknown, generation?: number) =>
  api(method, path, secret, { key: randomUUID(), body, generation });

describe("materials through the API (R07)", () => {
  let admin: Browser;
  let adminSecret: string;

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, "matapi-ops");
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await api("GET", "/api/tokens", adminSecret)).data as { id: string; name: string }[]).find(
      (token) => token.name === "matapi-ops",
    )!;
    await api("DELETE", `/api/tokens/${own.id}`, adminSecret, { key: randomUUID() });
    await admin.close();
  });

  it("creates materials in Prod with consecutive eight-digit IDs, once per key (MAT-001, MAT-002, API-021)", async () => {
    const key = randomUUID();
    const body = { type: "raw", description: "matapi bolt", baseUnit: "each" };
    const first = await api("POST", "/api/tenants/prod/materials", adminSecret, { key, body });
    const replay = await api("POST", "/api/tenants/prod/materials", adminSecret, { key, body });
    const second = await write("POST", "/api/tenants/prod/materials", adminSecret, { ...body, description: "matapi nut" });

    expect(first.status).toBe(200);
    expect(replay.replayed).toBe("true");
    expect(replay.text).toBe(first.text);
    const firstId = json(first).data.id as string;
    expect(firstId).toMatch(/^\d{8}$/);
    expect(json(second).data.id).toBe(String(Number(firstId) + 1).padStart(8, "0"));
    const prod = json(await api("GET", "/api/tenants/prod/materials", adminSecret)).data as MaterialRow[];
    expect(prod.filter(({ description }) => description === "matapi bolt")).toHaveLength(1);
  });

  it("starts Test with the demo materials, and needs the Test generation to write there (TEN-001, API-034)", async () => {
    const test = json(await api("GET", "/api/tenants/test/materials", adminSecret)).data as MaterialRow[];
    expect(test.slice(0, 2).map(({ id, description }) => `${id} ${description}`)).toEqual([
      "00000001 Steel sheet 2 mm",
      "00000002 Bolt M8",
    ]);
    const { generation } = json(await api("GET", "/api/tenants/test", adminSecret)).data as { generation: number };
    const body = { type: "finished", description: "matapi test cabinet", baseUnit: "each" };

    const missing = await write("POST", "/api/tenants/test/materials", adminSecret, body);
    const created = await write("POST", "/api/tenants/test/materials", adminSecret, body, generation);

    expect(missing.status).toBe(428);
    expect(json(missing).error.code).toBe("GENERATION_REQUIRED");
    expect(created.status).toBe(200);
    expect(Number(json(created).data.id)).toBeGreaterThan(test.length);
  });

  it("refuses an incomplete material with every missing field named (MAT-005, MAT-008, API-018)", async () => {
    const response = await write("POST", "/api/tenants/prod/materials", adminSecret, { type: "service" });

    expect(response.status).toBe(400);
    expect(Object.keys(json(response).error.fieldErrors).sort()).toEqual(["baseUnit", "description", "type"]);
  });

  it("edits at the loaded version, refuses a stale one and any ID change (API-029, MAT-004)", async () => {
    const created = json(
      await write("POST", "/api/tenants/prod/materials", adminSecret, { type: "raw", description: "matapi plate", baseUnit: "kg" }),
    ).data as MaterialRow;
    const path = `/api/tenants/prod/materials/${created.id}`;

    const edited = await write("PATCH", path, adminSecret, { version: created.version, description: "matapi plate 2 mm" });
    const stale = await write("PATCH", path, adminSecret, { version: created.version, description: "matapi older" });
    const renamed = await write("PATCH", path, adminSecret, { version: created.version + 1, id: "00000999" });

    expect(json(edited).data).toMatchObject({ id: created.id, description: "matapi plate 2 mm", version: created.version + 1 });
    expect(stale.status).toBe(409);
    expect(json(stale).error.code).toBe("VERSION_CONFLICT");
    expect(renamed.status).toBe(400);
    expect(json(renamed).error.fieldErrors).toEqual({ id: ["A material's ID can't be changed."] });
    expect(json(await api("GET", path, adminSecret)).data).toMatchObject({ id: created.id, description: "matapi plate 2 mm" });
  });

  it("adds, changes and removes a conversion, also for a unit with a Polish letter in the path", async () => {
    const created = json(
      await write("POST", "/api/tenants/prod/materials", adminSecret, { type: "raw", description: "matapi panel", baseUnit: "szt." }),
    ).data as MaterialRow;
    const conversions = `/api/tenants/prod/materials/${created.id}/conversions`;

    const zero = await write("POST", conversions, adminSecret, { unit: "płyta", numerator: "4", denominator: "0" });
    const added = await write("POST", conversions, adminSecret, { unit: "płyta", numerator: "4", denominator: "1" });
    const one = `${conversions}/${encodeURIComponent("płyta")}`;
    const changed = await write("PATCH", one, adminSecret, { numerator: "6", denominator: "1", version: 1 });
    const read = json(await api("GET", `/api/tenants/prod/materials/${created.id}`, adminSecret)).data;
    const removed = await write("DELETE", one, adminSecret, { version: 2 });

    expect(zero.status).toBe(400);
    expect(json(zero).error.fieldErrors).toHaveProperty("denominator");
    expect(json(added).data).toEqual({ unit: "płyta", numerator: "4", denominator: "1", inverse: "0.25", version: 1 });
    expect(json(changed).data).toMatchObject({ unit: "płyta", numerator: "6", version: 2 });
    expect(read.conversions).toEqual([{ unit: "płyta", numerator: "6", denominator: "1", inverse: "0.166667", version: 2 }]);
    expect(json(removed).data).toEqual({ unit: "płyta" });
    expect(json(await api("GET", `/api/tenants/prod/materials/${created.id}`, adminSecret)).data.conversions).toEqual([]);
  });

  it("lets a normal user's token read materials but not change them (TEN-004, API-010)", async () => {
    await write("POST", "/api/users", adminSecret, { username: "matapi-una", password: PASSWORD });
    const una = openBrowser();
    try {
      await signIn(una, baseUrl, PASSWORD, "matapi-una");
      await openTokens(una, baseUrl);
      const unaSecret = await createToken(una, "matapi-una-cli");

      const list = await api("GET", "/api/tenants/test/materials", unaSecret);
      const create = await write("POST", "/api/tenants/prod/materials", unaSecret, {
        type: "raw",
        description: "matapi forbidden",
        baseUnit: "kg",
      });

      expect(list.status).toBe(200);
      expect(create.status).toBe(403);
      expect(json(create).error.code).toBe("FORBIDDEN");
      const prod = json(await api("GET", "/api/tenants/prod/materials", adminSecret)).data as MaterialRow[];
      expect(prod.map(({ description }) => description)).not.toContain("matapi forbidden");
    } finally {
      await una.close();
    }
  });
});
