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

interface BomRow {
  id: string;
  output: string;
  priority: number;
  revision: number;
  version: number;
  components: Line[];
}

describe("BOMs through the API (R07)", () => {
  let admin: Browser;
  let adminSecret: string;
  /** This file's own Prod materials, by role. */
  const ids: Record<"steel" | "bolt" | "panel" | "cabinet" | "subA" | "subB" | "subC" | "frame", string> = {} as never;

  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}, secret = adminSecret) =>
    callApi(baseUrl, method, path, secret, options);
  /** A write with a fresh key, as a careful client sends it. */
  const write = (method: string, path: string, body: unknown, secret = adminSecret) => api(method, path, { key: randomUUID(), body }, secret);
  const material = async (type: string, description: string, baseUnit: string) =>
    json(await write("POST", "/api/tenants/prod/materials", { type, description, baseUnit })).data.id as string;
  const boms = async (tenant: string) => json(await api("GET", `/api/tenants/${tenant}/boms`)).data as BomRow[];
  const testGeneration = async () => (json(await api("GET", "/api/tenants/test")).data as { generation: number }).generation;
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
    ids.subC = await material("intermediate", "bomapi sub C", "each");
    ids.frame = await material("intermediate", "bomapi frame", "each");
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
    expect(json(replay).data).toMatchObject({ id: bom.id, version: bom.version, revision: 1 });
    expect((await boms("prod")).filter(({ output }) => output === ids.cabinet).map(({ id }) => id)).toEqual([bom.id]);
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

  it("refuses an equal-priority overlap, naming the other BOM and the shared days (BOM-015)", async () => {
    const first = json(await write("POST", "/api/tenants/prod/boms", recipe(ids.panel, 1, [{ material: ids.steel, quantity: "4.5", unit: "kg" }], { validThrough: "2027-03-31" }))).data;
    const overlap = await write(
      "POST",
      "/api/tenants/prod/boms",
      recipe(ids.panel, 1, [{ material: ids.steel, quantity: "5", unit: "kg" }], { validFrom: "2027-03-01" }),
    );
    expect(overlap.status).toBe(409);
    expect(json(overlap).error).toMatchObject({ code: "BOM_PRIORITY_CONFLICT", message: expect.stringContaining(`: BOM ${first.id} (2027-03-01 – 2027-03-31).`) });
  });

  it("refuses a PATCH that would make A → B → C → A with the full path, writing nothing (BOM-025)", async () => {
    const create = async (output: string, component: string) =>
      json(await write("POST", "/api/tenants/prod/boms", recipe(output, 1, [{ material: component, quantity: "1", unit: "each" }]))).data as BomRow;
    const a = await create(ids.subA, ids.subB);
    const b = await create(ids.subB, ids.subC);
    const c = json(await write("POST", "/api/tenants/prod/boms", recipe(ids.subC, 1, [{ material: ids.steel, quantity: "1", unit: "kg" }]))).data as BomRow;

    const cycle = await write("PATCH", `/api/tenants/prod/boms/${c.id}`, { version: c.version, components: [{ material: ids.subA, quantity: "1", unit: "each" }] });

    expect(cycle.status).toBe(409);
    expect(json(cycle).error).toMatchObject({
      code: "BOM_CYCLE",
      message:
        `This BOM would make a cycle: ${ids.subC} bomapi sub C →(BOM ${c.id}) ${ids.subA} bomapi sub A →(BOM ${a.id}) ` +
        `${ids.subB} bomapi sub B →(BOM ${b.id}) ${ids.subC} bomapi sub C.`,
    });
    const after = json(await api("GET", `/api/tenants/prod/boms/${c.id}`)).data;
    expect(after).toMatchObject({ revision: 1, version: c.version, revisions: [{ number: 1 }] });
    expect((after.components as Line[]).map(({ material }) => material)).toEqual([ids.steel]);
  });

  it("keeps the revision and version when a PATCH resends the same recipe reordered or in another unit (BOM-023)", async () => {
    const created = json(
      await write(
        "POST",
        "/api/tenants/prod/boms",
        recipe(ids.frame, 1, [
          { material: ids.steel, quantity: "4", unit: "kg" },
          { material: ids.bolt, quantity: "2", unit: "case" },
        ]),
      ),
    ).data as BomRow;
    const path = `/api/tenants/prod/boms/${created.id}`;

    const reordered = await write("PATCH", path, {
      version: created.version,
      components: [
        { material: ids.bolt, quantity: "2", unit: "case" },
        { material: ids.steel, quantity: "4", unit: "kg" },
      ],
    });
    const otherUnit = await write("PATCH", path, {
      version: created.version,
      components: [
        { material: ids.steel, quantity: "4", unit: "kg" },
        { material: ids.bolt, quantity: "24", unit: "each" },
      ],
    });

    for (const response of [reordered, otherUnit]) {
      expect(response.status).toBe(200);
      expect(json(response).data).toMatchObject({ id: created.id, revision: 1, version: created.version, revisions: [{ number: 1 }] });
    }
    const stored = json(await api("GET", path)).data;
    expect(stored).toMatchObject({ revision: 1, version: created.version, revisions: [{ number: 1 }] });
    expect((stored.components as Line[])[1]).toMatchObject({ material: ids.bolt, quantity: "24.000000", enteredQuantity: "2", enteredUnit: "case" });
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

  it("starts Test with the dataset's 16 BOMs, and needs the Test generation to write there (TEN-001, API-034)", async () => {
    const test = json(await api("GET", "/api/tenants/test/boms")).data as BomRow[];
    expect(test).toHaveLength(16);
    expect(test.slice(0, 3).map(({ id, output }) => `${id} ${output}`)).toEqual(["00000001 00000004", "00000005 00000005", "00000002 00000015"]);
    expect(test.filter(({ output }) => output === "00000026").map(({ id, priority }) => `${id} ${priority}`)).toEqual(["00000014 1", "00000015 2", "00000016 3"]);

    const missing = await write("POST", "/api/tenants/test/boms", recipe("00000004", 9, [{ material: "00000001", quantity: "1", unit: "kg" }]));
    expect(missing.status).toBe(428);
    expect(json(missing).error.code).toBe("GENERATION_REQUIRED");
  });

  it("doesn't resolve a Prod-only material in a Test BOM, and doesn't find a Prod-only BOM from Test (TEN-014)", async () => {
    // Both tenants number from 00000001 and other files create records in both, so a Prod ID is
    // only "Prod-only" once it passes Test's highest.
    const testMaterials = new Set((json(await api("GET", "/api/tenants/test/materials")).data as { id: string }[]).map(({ id }) => id));
    let prodOnlyMaterial = "";
    for (let attempt = 0; attempt <= testMaterials.size && !prodOnlyMaterial; attempt += 1) {
      const id = await material("intermediate", `bomapi prod-only ${attempt}`, "each");
      if (!testMaterials.has(id)) prodOnlyMaterial = id;
    }
    const testBoms = new Set((await boms("test")).map(({ id }) => id));
    let prodOnlyBom: BomRow | undefined;
    for (let attempt = 0; attempt <= testBoms.size && !prodOnlyBom; attempt += 1) {
      const created = json(await write("POST", "/api/tenants/prod/boms", recipe(prodOnlyMaterial, attempt + 1, [{ material: ids.steel, quantity: "1", unit: "kg" }])))
        .data as BomRow;
      if (!testBoms.has(created.id)) prodOnlyBom = created;
    }
    expect(prodOnlyMaterial).not.toBe("");
    expect(prodOnlyBom).toBeDefined();
    const generation = await testGeneration();
    const before = await boms("test");

    const asOutput = await api("POST", "/api/tenants/test/boms", {
      key: randomUUID(),
      generation,
      body: recipe(prodOnlyMaterial, 9, [{ material: "00000001", quantity: "1", unit: "kg" }]),
    });
    const asComponent = await api("POST", "/api/tenants/test/boms", {
      key: randomUUID(),
      generation,
      body: recipe("00000004", 9, [{ material: prodOnlyMaterial, quantity: "1", unit: "each" }]),
    });
    for (const response of [asOutput, asComponent]) {
      expect(response.status).toBe(404);
      expect(json(response).error.code).toBe("MATERIAL_NOT_FOUND");
    }
    expect(await boms("test")).toEqual(before);

    const read = await api("GET", `/api/tenants/test/boms/${prodOnlyBom!.id}`);
    const change = await api("PATCH", `/api/tenants/test/boms/${prodOnlyBom!.id}`, { key: randomUUID(), generation, body: { version: prodOnlyBom!.version, priority: 999 } });
    for (const response of [read, change]) {
      expect(response.status).toBe(404);
      expect(json(response).error.code).toBe("BOM_NOT_FOUND");
    }
    expect(json(await api("GET", `/api/tenants/prod/boms/${prodOnlyBom!.id}`)).data).toMatchObject({
      priority: prodOnlyBom!.priority,
      revision: 1,
      version: prodOnlyBom!.version,
    });
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

  it("searches and sorts the list on the server, and refuses a sort key it doesn't list (#221)", async () => {
    const kiosk = await material("finished", "bomsq kiosk", "each");
    const created: string[] = [];
    for (const priority of [5, 7, 6]) {
      const response = await write("POST", "/api/tenants/prod/boms", recipe(kiosk, priority, [{ material: ids.steel, quantity: "1", unit: "kg" }]));
      expect(response.status).toBe(200);
      created.push(json(response).data.id);
    }
    const list = async (query: string) => {
      const response = await api("GET", `/api/tenants/prod/boms?${query}`);
      expect(response.status).toBe(200);
      return json(response).data as BomRow[];
    };

    expect((await list("q=bomsq")).map(({ priority }) => priority)).toEqual([5, 6, 7]);
    expect((await list("q=bomsq&sort=priority&dir=desc")).map(({ priority }) => priority)).toEqual([7, 6, 5]);
    expect((await list("q=bomsq&sort=id&dir=desc")).map(({ id }) => id)).toEqual([...created].reverse());
    expect(await list("q=bomsq+nothing")).toEqual([]);

    const refused = await api("GET", "/api/tenants/prod/boms?dir=sideways");
    expect(refused.status).toBe(400);
    expect(json(refused).error).toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { dir: ["Sort direction must be asc or desc."] } });
  });
});
