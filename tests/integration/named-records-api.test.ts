import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const PASSWORD = "nrapi first password";

interface NamedRecordRow {
  id: string;
  name: string;
  active: boolean;
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

/** Each kind, with its error-code prefix and the first demo record Test starts with. */
const KINDS = [
  { kind: "locations", code: "LOCATION", firstDemo: "00000001 Main plant, Wrocław" },
  { kind: "customers", code: "CUSTOMER", firstDemo: "00000001 Hardware Store Chain Sp. z o.o." },
  { kind: "suppliers", code: "SUPPLIER", firstDemo: "00000001 Steel Service Centre Sp. z o.o." },
] as const;

describe("locations, customers and suppliers through the API (R07)", () => {
  let admin: Browser;
  let adminSecret: string;
  let una: Browser;
  let unaSecret: string;

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, "nrapi-ops");
    await write("POST", "/api/users", adminSecret, { username: "nrapi-una", password: PASSWORD });
    una = openBrowser();
    await signIn(una, baseUrl, PASSWORD, "nrapi-una");
    await openTokens(una, baseUrl);
    unaSecret = await createToken(una, "nrapi-una-cli");
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await api("GET", "/api/tokens", adminSecret)).data as { id: string; name: string }[]).find(
      (token) => token.name === "nrapi-ops",
    )!;
    await api("DELETE", `/api/tokens/${own.id}`, adminSecret, { key: randomUUID() });
    await una.close();
    await admin.close();
  });

  describe.each(KINDS)("$kind", ({ kind, code, firstDemo }) => {
    const collection = (tenant: string) => `/api/tenants/${tenant}/${kind}`;

    it("creates in Prod with consecutive eight-digit IDs, once per key (spec Q2, API-021)", async () => {
      const key = randomUUID();
      const body = { name: `nrapi ${kind} first` };
      const first = await api("POST", collection("prod"), adminSecret, { key, body });
      const replay = await api("POST", collection("prod"), adminSecret, { key, body });
      const second = await write("POST", collection("prod"), adminSecret, { name: `nrapi ${kind} second` });

      expect(first.status).toBe(200);
      expect(replay.replayed).toBe("true");
      expect(replay.text).toBe(first.text);
      const firstId = json(first).data.id as string;
      expect(firstId).toMatch(/^\d{8}$/);
      expect(json(second).data).toMatchObject({ id: String(Number(firstId) + 1).padStart(8, "0"), active: true, version: 1 });
      const prod = json(await api("GET", collection("prod"), adminSecret)).data as NamedRecordRow[];
      expect(prod.filter(({ name }) => name === `nrapi ${kind} first`)).toHaveLength(1);
    });

    it("starts Test with the demo records, and needs the Test generation to write there (TEN-001, API-034)", async () => {
      const test = json(await api("GET", collection("test"), adminSecret)).data as NamedRecordRow[];
      expect(`${test[0]!.id} ${test[0]!.name}`).toBe(firstDemo);
      const { generation } = json(await api("GET", "/api/tenants/test", adminSecret)).data as { generation: number };

      const missing = await write("POST", collection("test"), adminSecret, { name: `nrapi ${kind} test` });
      const created = await write("POST", collection("test"), adminSecret, { name: `nrapi ${kind} test` }, generation);

      expect(missing.status).toBe(428);
      expect(json(missing).error.code).toBe("GENERATION_REQUIRED");
      expect(created.status).toBe(200);
    });

    it("renames and deactivates at the loaded version, refusing a stale one and an ID change (API-029, LFC-019)", async () => {
      const created = json(await write("POST", collection("prod"), adminSecret, { name: `nrapi ${kind} edit` })).data as NamedRecordRow;
      const path = `${collection("prod")}/${created.id}`;

      const renamed = await write("PATCH", path, adminSecret, { version: 1, name: `nrapi ${kind} renamed` });
      const deactivated = await write("PATCH", path, adminSecret, { version: 2, active: false });
      const stale = await write("PATCH", path, adminSecret, { version: 1, name: `nrapi ${kind} older` });
      const idChange = await write("PATCH", path, adminSecret, { version: 3, id: "00000999", active: true });

      expect(json(renamed).data).toMatchObject({ name: `nrapi ${kind} renamed`, version: 2 });
      expect(json(deactivated).data).toMatchObject({ active: false, version: 3 });
      expect(stale.status).toBe(409);
      expect(json(stale).error.code).toBe("VERSION_CONFLICT");
      expect(idChange.status).toBe(400);
      expect(json(idChange).error.fieldErrors).toEqual({ id: ["A record's ID can't be changed."] });
      expect(json(await api("GET", path, adminSecret)).data).toMatchObject({ name: `nrapi ${kind} renamed`, active: false });
    });

    it("answers an ID the tenant doesn't have, or a malformed one, with 404 (TEN-014)", async () => {
      for (const id of ["99999999", "abc"]) {
        const response = await api("GET", `${collection("prod")}/${id}`, adminSecret);
        expect(response.status).toBe(404);
        expect(json(response).error.code).toBe(`${code}_NOT_FOUND`);
      }
    });

    it("lets a normal user's token read but not change them (TEN-004, API-010)", async () => {
      const list = await api("GET", collection("test"), unaSecret);
      const create = await write("POST", collection("prod"), unaSecret, { name: `nrapi ${kind} forbidden` });

      expect(list.status).toBe(200);
      expect(create.status).toBe(403);
      expect(json(create).error.code).toBe("FORBIDDEN");
      const prod = json(await api("GET", collection("prod"), adminSecret)).data as NamedRecordRow[];
      expect(prod.map(({ name }) => name)).not.toContain(`nrapi ${kind} forbidden`);
    });
  });
});
