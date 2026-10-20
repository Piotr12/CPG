import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const PASSWORD = "bomapi first password";

interface Line {
  material: string;
  quantity: string;
  enteredQuantity?: string;
  enteredUnit?: string;
}

describe("BOMs through the API (R07)", () => {
  let admin: Browser;
  let adminSecret: string;
  /** This file's own Prod materials, by role. */
  const ids: Record<"steel" | "bolt" | "panel" | "cabinet" | "subA" | "subB", string> = {} as never;

  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}, secret = adminSecret) =>
    callApi(baseUrl, method, path, secret, options);
  /** A write with a fresh key, as a careful client sends it. */
  const write = (method: string, path: string, body: unknown, secret = adminSecret) => api(method, path, { key: randomUUID(), body }, secret);
  const material = async (type: string, description: string, baseUnit: string) =>
    json(await write("POST", "/api/tenants/prod/materials", { type, description, baseUnit })).data.id as string;
  const recipe = (output: string, priority: number, components: { material: string; quantity: string; unit: string }[], dates = {}) => ({
    output,
    priority,
    validFrom: "2027-01-01",
    components,
    ...dates,
  });

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, "bomapi-ops");
    ids.steel = await material("raw", "bomapi steel", "kg");
    ids.bolt = await material("raw", "bomapi bolt", "each");
    await write("POST", `/api/tenants/prod/materials/${ids.bolt}/conversions`, { unit: "case", numerator: "12", denominator: "1" });
    ids.panel = await material("intermediate", "bomapi panel", "each");
    ids.cabinet = await material("finished", "bomapi cabinet", "each");
    ids.subA = await material("intermediate", "bomapi sub A", "each");
    ids.subB = await material("intermediate", "bomapi sub B", "each");
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find((token) => token.name === "bomapi-ops")!;
    await api("DELETE", `/api/tokens/${own.id}`, { key: randomUUID() });
    await admin.close();
  });

  it("creates a BOM once per key, storing 2 case as 24 each, and keeps revision 1 after a change (BOM-001, BOM-020, MAT-019)", async () => {
    const key = randomUUID();
    const body = recipe(ids.cabinet, 1, [
      { material: ids.panel, quantity: "4", unit: "each" },
      { material: ids.bolt, quantity: "2", unit: "case" },
    ]);
    const first = await api("POST", "/api/tenants/prod/boms", { key, body });
    const replay = await api("POST", "/api/tenants/prod/boms", { key, body });

    expect(first.status).toBe(200);
    expect(replay.replayed).toBe("true");
    const bom = json(first).data;
    expect(bom).toMatchObject({ output: ids.cabinet, revision: 1, validThrough: null, active: true });
    expect((bom.components as Line[])[1]).toMatchObject({ material: ids.bolt, quantity: "24.000000", enteredQuantity: "2", enteredUnit: "case" });

    const changed = await write("PATCH", `/api/tenants/prod/boms/${bom.id}`, {
      version: bom.version,
      components: [
        { material: ids.panel, quantity: "4", unit: "each" },
        { material: ids.bolt, quantity: "3", unit: "case" },
      ],
    });
    expect(json(changed).data).toMatchObject({ revision: 2, revisions: [{ number: 2 }, { number: 1 }] });
    const old = json(await api("GET", `/api/tenants/prod/boms/${bom.id}/revisions/1`)).data;
    expect(old).toMatchObject({ number: 1, current: false });
    expect((old.components as Line[])[1].quantity).toBe("24.000000");

    const stale = await write("PATCH", `/api/tenants/prod/boms/${bom.id}`, { version: bom.version, priority: 5 });
    expect(stale.status).toBe(409);
    expect(json(stale).error.code).toBe("VERSION_CONFLICT");
  });

  it("refuses an equal-priority overlap and a cycle, naming the other BOM and the path (BOM-015, BOM-025)", async () => {
    const first = json(await write("POST", "/api/tenants/prod/boms", recipe(ids.panel, 1, [{ material: ids.steel, quantity: "4.5", unit: "kg" }], { validThrough: "2027-03-31" }))).data;
    const overlap = await write(
      "POST",
      "/api/tenants/prod/boms",
      recipe(ids.panel, 1, [{ material: ids.steel, quantity: "5", unit: "kg" }], { validFrom: "2027-03-01" }),
    );
    expect(overlap.status).toBe(409);
    expect(json(overlap).error).toMatchObject({ code: "BOM_PRIORITY_CONFLICT", message: expect.stringContaining(`: BOM ${first.id} (2027-03-01 – 2027-03-31).`) });

    await write("POST", "/api/tenants/prod/boms", recipe(ids.subA, 1, [{ material: ids.subB, quantity: "1", unit: "each" }]));
    const cycle = await write("POST", "/api/tenants/prod/boms", recipe(ids.subB, 1, [{ material: ids.subA, quantity: "1", unit: "each" }]));
    expect(cycle.status).toBe(409);
    expect(json(cycle).error).toMatchObject({ code: "BOM_CYCLE", message: expect.stringContaining(`${ids.subB} bomapi sub B → ${ids.subA} bomapi sub A →(BOM `) });
  });

  it("puts a line's error on its path, and locks the output's type once used (MAT-023, MAT-011)", async () => {
    const pallet = await write("POST", "/api/tenants/prod/boms", recipe(ids.cabinet, 7, [{ material: ids.bolt, quantity: "1", unit: "pallet" }]));
    expect(pallet.status).toBe(400);
    expect(json(pallet).error.fieldErrors).toEqual({ "components.0.unit": ["This material has no conversion from this unit to its base unit."] });

    const cabinet = json(await api("GET", `/api/tenants/prod/materials/${ids.cabinet}`)).data;
    const retype = await write("PATCH", `/api/tenants/prod/materials/${ids.cabinet}`, { version: cabinet.version, type: "intermediate" });
    expect(retype.status).toBe(409);
    expect(json(retype).error.code).toBe("MATERIAL_TYPE_IN_USE");
  });

  it("starts Test with the demo BOMs, and needs the Test generation to write there (TEN-001, API-034)", async () => {
    const test = json(await api("GET", "/api/tenants/test/boms")).data as { id: string; output: string; components: Line[] }[];
    expect(test.slice(0, 3).map(({ id, output }) => `${id} ${output}`)).toEqual(["00000001 00000004", "00000002 00000005", "00000003 00000005"]);

    const missing = await write("POST", "/api/tenants/test/boms", recipe("00000004", 9, [{ material: "00000001", quantity: "1", unit: "kg" }]));
    expect(missing.status).toBe(428);
    expect(json(missing).error.code).toBe("GENERATION_REQUIRED");
  });

  it("lets a normal user's token read BOMs but not change them (TEN-004, API-010)", async () => {
    await write("POST", "/api/users", { username: "bomapi-una", password: PASSWORD });
    const una = openBrowser();
    try {
      await signIn(una, baseUrl, PASSWORD, "bomapi-una");
      await openTokens(una, baseUrl);
      const unaSecret = await createToken(una, "bomapi-una-cli");

      expect((await api("GET", "/api/tenants/prod/boms", {}, unaSecret)).status).toBe(200);
      const create = await write("POST", "/api/tenants/prod/boms", recipe(ids.cabinet, 8, [{ material: ids.panel, quantity: "1", unit: "each" }]), unaSecret);
      expect(create.status).toBe(403);
      expect(json(create).error.code).toBe("FORBIDDEN");
    } finally {
      await una.close();
    }
  });
});
