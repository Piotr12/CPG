import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const PASSWORD = "ppapi first password";

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

describe("planning parameters and safety-stock targets through the API (R07)", () => {
  let admin: Browser;
  let adminSecret: string;
  /** This file's own Prod masters: a raw and an intermediate material, two locations. */
  let raw: string;
  let panel: string;
  let plant: string;
  let packer: string;

  const createMaster = async (path: string, body: unknown) => json(await write("POST", `/api/tenants/prod/${path}`, adminSecret, body)).data.id as string;

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, "ppapi-ops");
    raw = await createMaster("materials", { type: "raw", description: "ppapi steel", baseUnit: "kg" });
    panel = await createMaster("materials", { type: "intermediate", description: "ppapi panel", baseUnit: "each" });
    plant = await createMaster("locations", { name: "ppapi plant" });
    packer = await createMaster("locations", { name: "ppapi packer" });
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await api("GET", "/api/tokens", adminSecret)).data as { id: string; name: string }[]).find(
      (token) => token.name === "ppapi-ops",
    )!;
    await api("DELETE", `/api/tokens/${own.id}`, adminSecret, { key: randomUUID() });
    await admin.close();
  });

  it("adds a set once per key, changes it at its version and removes it (MAT-015, MAT-016, API-021, API-029)", async () => {
    const key = randomUUID();
    const body = { material: panel, location: plant, procurement: "make", leadTimeDays: 2, minimumQuantity: "50", lotMultiple: "10" };
    const first = await api("POST", "/api/tenants/prod/planning-parameters", adminSecret, { key, body });
    const replay = await api("POST", "/api/tenants/prod/planning-parameters", adminSecret, { key, body });
    const bought = await write("POST", "/api/tenants/prod/planning-parameters", adminSecret, { ...body, location: packer, procurement: "buy" });
    const one = `/api/tenants/prod/planning-parameters/${panel}/${plant}`;
    const changed = await write("PATCH", one, adminSecret, { version: 1, leadTimeDays: 3 });
    const stale = await write("PATCH", one, adminSecret, { version: 1, leadTimeDays: 4 });

    expect(json(first).data).toEqual({ ...body, minimumQuantity: "50.000000", lotMultiple: "10.000000", version: 1 });
    expect(replay.replayed).toBe("true");
    expect(bought.status).toBe(200);
    expect(json(changed).data).toMatchObject({ leadTimeDays: 3, version: 2 });
    expect(stale.status).toBe(409);
    expect(json(stale).error.code).toBe("VERSION_CONFLICT");
    const all = json(await api("GET", "/api/tenants/prod/planning-parameters", adminSecret)).data as {
      material: string;
      location: string;
      procurement: string;
    }[];
    const mine = all.filter(({ material }) => material === panel);
    expect(mine.map(({ location, procurement }) => [location, procurement])).toEqual([
      [plant, "make"],
      [packer, "buy"],
    ]);

    const removed = await write("DELETE", one, adminSecret, { version: 2 });
    expect(json(removed).data).toEqual({ material: panel, location: plant });
  });

  it("refuses Make for a raw material, a duplicate pair, and a quantity sent as a number (MAT-014, R03)", async () => {
    const body = { material: raw, location: plant, procurement: "make", leadTimeDays: 14, minimumQuantity: "500", lotMultiple: "100" };
    const make = await write("POST", "/api/tenants/prod/planning-parameters", adminSecret, body);
    const buy = await write("POST", "/api/tenants/prod/planning-parameters", adminSecret, { ...body, procurement: "buy" });
    const again = await write("POST", "/api/tenants/prod/planning-parameters", adminSecret, { ...body, procurement: "buy" });
    const number = await write("POST", "/api/tenants/prod/planning-parameters", adminSecret, { ...body, location: packer, lotMultiple: 100 });

    expect(make.status).toBe(400);
    expect(json(make).error.fieldErrors).toEqual({ procurement: ["A raw material is always bought: choose Buy."] });
    expect(buy.status).toBe(200);
    expect(again.status).toBe(409);
    expect(json(again).error.code).toBe("PLANNING_PARAMETERS_EXIST");
    expect(number.status).toBe(400);
  });

  it("keeps targets per date, refuses a second one on the same date, and locks the base unit (DEM-015…017)", async () => {
    const target = { material: raw, location: plant, effectiveFrom: "2027-01-01", quantity: "100" };
    const january = await write("POST", "/api/tenants/prod/safety-stock-targets", adminSecret, target);
    const february = await write("POST", "/api/tenants/prod/safety-stock-targets", adminSecret, { ...target, effectiveFrom: "2027-02-01", quantity: "150" });
    const twice = await write("POST", "/api/tenants/prod/safety-stock-targets", adminSecret, { ...target, quantity: "120" });
    const changed = await write("PATCH", `/api/tenants/prod/safety-stock-targets/${raw}/${plant}/2027-01-01`, adminSecret, { quantity: "90", version: 1 });

    expect(json(january).data).toEqual({ ...target, quantity: "100.000000", version: 1 });
    expect(february.status).toBe(200);
    expect(twice.status).toBe(409);
    expect(json(twice).error.code).toBe("SAFETY_STOCK_TARGET_EXISTS");
    expect(json(changed).data).toMatchObject({ quantity: "90.000000", version: 2 });

    const material = json(await api("GET", `/api/tenants/prod/materials/${raw}`, adminSecret)).data as { version: number };
    const rebased = await write("PATCH", `/api/tenants/prod/materials/${raw}`, adminSecret, { version: material.version, baseUnit: "t" });
    expect(rebased.status).toBe(409);
    expect(json(rebased).error.code).toBe("BASE_UNIT_IN_USE");
  });

  it("starts Test with the demo rows, and needs the Test generation to write there (TEN-001, API-034)", async () => {
    const sets = json(await api("GET", "/api/tenants/test/planning-parameters", adminSecret)).data as { material: string; location: string }[];
    const targets = json(await api("GET", "/api/tenants/test/safety-stock-targets", adminSecret)).data as { material: string }[];
    expect(sets.slice(0, 2).map(({ material, location }) => `${material}@${location}`)).toEqual(["00000001@00000001", "00000002@00000001"]);
    expect(targets.length).toBeGreaterThanOrEqual(3);

    const missing = await write("POST", "/api/tenants/test/safety-stock-targets", adminSecret, {
      material: "00000005",
      location: "00000001",
      effectiveFrom: "2030-01-01",
      quantity: "1",
    });
    expect(missing.status).toBe(428);
  });

  it("lets a normal user's token read both lists but not change them (TEN-004, API-010)", async () => {
    await write("POST", "/api/users", adminSecret, { username: "ppapi-una", password: PASSWORD });
    const una = openBrowser();
    try {
      await signIn(una, baseUrl, PASSWORD, "ppapi-una");
      await openTokens(una, baseUrl);
      const unaSecret = await createToken(una, "ppapi-una-cli");

      expect((await api("GET", "/api/tenants/prod/planning-parameters", unaSecret)).status).toBe(200);
      expect((await api("GET", "/api/tenants/prod/safety-stock-targets", unaSecret)).status).toBe(200);
      const create = await write("POST", "/api/tenants/prod/safety-stock-targets", unaSecret, {
        material: panel,
        location: plant,
        effectiveFrom: "2027-01-01",
        quantity: "1",
      });
      expect(create.status).toBe(403);
      expect(json(create).error.code).toBe("FORBIDDEN");
    } finally {
      await una.close();
    }
  });
});
