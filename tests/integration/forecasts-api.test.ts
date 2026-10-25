import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { allPages, callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const PASSWORD = "fcapi first password";

const api = (method: string, path: string, secret: string, options: { key?: string; generation?: number; body?: unknown } = {}) =>
  callApi(baseUrl, method, path, secret, options);

describe("forecasts through the API (E08-S03, R07)", () => {
  let admin: Browser;
  let adminSecret: string;
  /** This file's own Prod masters: a finished material that converts cases, and two locations. */
  let cabinet: string;
  let plant: string;
  let packer: string;

  /** A write with a fresh key, as a careful client sends it. */
  const write = (method: string, path: string, body: unknown, generation?: number) =>
    api(method, path, adminSecret, { key: randomUUID(), body, generation });
  const createMaster = async (path: string, body: unknown) => json(await write("POST", `/api/tenants/prod/${path}`, body)).data.id as string;
  const forecasts = async (query = "") =>
    json(await api("GET", `/api/tenants/prod/forecasts${query}`, adminSecret)).data as { material: string; location: string; date: string; quantity: string }[];
  const mine = async (query = "") => (await forecasts(query)).filter(({ material }) => material === cabinet);
  /** The Prod audit entries of one forecast, by action: entries of one millisecond come in any order. */
  const audit = async (subject: string) => {
    const entries = (json(await api("GET", "/api/tenants/prod/audit?limit=100", adminSecret)).data.entries as {
      action: string;
      subject: { id: string };
      before: unknown;
      after: unknown;
    }[]).filter((entry) => entry.subject.id === subject);
    return Object.fromEntries(entries.map((entry) => [entry.action, entry]));
  };

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, "fcapi-ops");
    cabinet = await createMaster("materials", { type: "finished", description: "fcapi cabinet", baseUnit: "each" });
    expect((await write("POST", `/api/tenants/prod/materials/${cabinet}/conversions`, { unit: "case", numerator: "12", denominator: "1" })).status).toBe(200);
    plant = await createMaster("locations", { name: "fcapi plant" });
    packer = await createMaster("locations", { name: "fcapi packer" });
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await api("GET", "/api/tokens", adminSecret)).data as { id: string; name: string }[]).find((token) => token.name === "fcapi-ops")!;
    await api("DELETE", `/api/tokens/${own.id}`, adminSecret, { key: randomUUID() });
    await admin.close();
  });

  it("stores a forecast per material, location and day with no customer, once per key, and lists the days in order (DEM-001, R03, API-021)", async () => {
    const key = randomUUID();
    const body = { material: cabinet, location: plant, date: "2027-03-02", quantity: "40" };
    const first = await api("POST", "/api/tenants/prod/forecasts", adminSecret, { key, body });
    const replay = await api("POST", "/api/tenants/prod/forecasts", adminSecret, { key, body });
    await write("POST", "/api/tenants/prod/forecasts", { ...body, date: "2027-03-01", quantity: "25.5" });
    await write("POST", "/api/tenants/prod/forecasts", { ...body, location: packer, quantity: "7" });
    const number = await write("POST", "/api/tenants/prod/forecasts", { ...body, date: "2027-03-09", quantity: 5 });

    expect(json(first).data).toEqual({ ...body, quantity: "40.000000", version: 1 });
    expect(replay.replayed).toBe("true");
    expect(number.status).toBe(400);
    expect((await mine()).map(({ location, date, quantity }) => `${location} ${date} ${quantity}`)).toEqual([
      `${plant} 2027-03-01 25.500000`,
      `${plant} 2027-03-02 40.000000`,
      `${packer} 2027-03-02 7.000000`,
    ]);
  });

  it("refuses a second forecast for the same material, location and day (D04)", async () => {
    const again = await write("POST", "/api/tenants/prod/forecasts", { material: cabinet, location: plant, date: "2027-03-02", quantity: "99" });

    expect(again.status).toBe(409);
    expect(json(again).error.code).toBe("FORECAST_EXISTS");
    expect((await mine()).find(({ location, date }) => location === plant && date === "2027-03-02")?.quantity).toBe("40.000000");
  });

  it("converts a quantity entered in another unit, and refuses a unit the material doesn't convert (MAT-019, MAT-023)", async () => {
    const cases = await write("POST", "/api/tenants/prod/forecasts", { material: cabinet, location: plant, date: "2027-04-01", quantity: "2.5", unit: "case" });
    const pallet = await write("POST", "/api/tenants/prod/forecasts", { material: cabinet, location: plant, date: "2027-04-02", quantity: "1", unit: "pallet" });

    expect(json(cases).data).toMatchObject({ quantity: "30.000000" });
    expect(pallet.status).toBe(400);
    expect(Object.keys(json(pallet).error.fieldErrors)).toEqual(["unit"]);
  });

  it("narrows the list by material and location, and refuses a filter that is no business ID", async () => {
    expect(new Set((await forecasts(`?material=${cabinet}&location=${packer}`)).map(({ material, location }) => `${material}@${location}`))).toEqual(
      new Set([`${cabinet}@${packer}`]),
    );
    expect((await mine(`?location=${plant}`)).every(({ location }) => location === plant)).toBe(true);
    expect((await api("GET", "/api/tenants/prod/forecasts?material=cabinet", adminSecret)).status).toBe(400);
  });

  it("audits a change with before and after and a removal as a tombstone with what it held (AUD-002, AUD-005, API-029)", async () => {
    const one = `/api/tenants/prod/forecasts/${cabinet}/${plant}/2027-03-01`;
    const changed = await write("PATCH", one, { quantity: "30", version: 1 });
    const stale = await write("PATCH", one, { quantity: "35", version: 1 });
    const removed = await write("DELETE", one, { version: 2 });

    expect(json(changed).data).toMatchObject({ quantity: "30.000000", version: 2 });
    expect(stale.status).toBe(409);
    expect(json(stale).error.code).toBe("VERSION_CONFLICT");
    expect(json(removed).data).toEqual({ material: cabinet, location: plant, date: "2027-03-01" });
    expect((await mine()).some(({ location, date }) => location === plant && date === "2027-03-01")).toBe(false);
    const entries = await audit(`${cabinet}/${plant}/2027-03-01`);
    expect(Object.keys(entries).sort()).toEqual(["forecasts.forecast.created", "forecasts.forecast.removed", "forecasts.forecast.updated"]);
    expect(entries["forecasts.forecast.updated"]).toMatchObject({ before: { quantity: "25.500000" }, after: { quantity: "30.000000" } });
    expect(entries["forecasts.forecast.removed"]).toMatchObject({
      before: { material: cabinet, location: plant, date: "2027-03-01", quantity: "30.000000" },
      after: null,
    });
  });

  it("locks the base unit while a forecast holds a quantity in it", async () => {
    const plain = await createMaster("materials", { type: "finished", description: "fcapi plain cabinet", baseUnit: "each" });
    expect((await write("POST", "/api/tenants/prod/forecasts", { material: plain, location: plant, date: "2027-03-02", quantity: "3" })).status).toBe(200);
    const { version } = json(await api("GET", `/api/tenants/prod/materials/${plain}`, adminSecret)).data as { version: number };

    const rebased = await write("PATCH", `/api/tenants/prod/materials/${plain}`, { version, baseUnit: "pcs" });

    expect([rebased.status, json(rebased).error.code]).toEqual([409, "BASE_UNIT_IN_USE"]);
  });

  it("refuses an inactive material or location in a new forecast, and stores nothing (MAT-029, LFC-019, INV-020)", async () => {
    const retired = await createMaster("materials", { type: "finished", description: "fcapi retired cabinet", baseUnit: "each" });
    const closed = await createMaster("locations", { name: "fcapi closed plant" });
    const deactivate = async (path: string) => {
      const { version } = json(await api("GET", `/api/tenants/prod/${path}`, adminSecret)).data as { version: number };
      expect((await write("PATCH", `/api/tenants/prod/${path}`, { version, active: false })).status).toBe(200);
    };
    await deactivate(`materials/${retired}`);
    await deactivate(`locations/${closed}`);

    const material = await write("POST", "/api/tenants/prod/forecasts", { material: retired, location: plant, date: "2027-05-01", quantity: "1" });
    const location = await write("POST", "/api/tenants/prod/forecasts", { material: cabinet, location: closed, date: "2027-05-01", quantity: "1" });

    expect([material.status, json(material).error.code]).toEqual([409, "MATERIAL_INACTIVE"]);
    expect([location.status, json(location).error.code]).toEqual([409, "LOCATION_INACTIVE"]);
    expect((await forecasts()).filter((row) => row.material === retired || row.location === closed)).toEqual([]);
  });

  it("starts Test with the dataset's forecasts in pages of 100, and needs the Test generation to write there (TEN-001, D06, API-034)", async () => {
    type Row = { material: string; location: string; date: string };
    const testPage = async (query: string) => json(await api("GET", `/api/tenants/test/forecasts${query}`, adminSecret)).data as Row[];
    const first = await testPage("");
    expect(await testPage("?page=1")).toEqual(first);
    // A year of weekdays for each of the twelve finished products, at the plant that makes it: some 3,100 rows.
    expect(first).toHaveLength(100);
    const demo = await allPages((page) => testPage(`?page=${page}`));
    expect(demo.length).toBeGreaterThan(3000);
    expect(demo.slice(0, 100)).toEqual(first);
    expect(new Set(demo.map(({ material, location }) => `${material}@${location}`)).size).toBe(12);
    expect(demo.every(({ location }) => location === "00000001")).toBe(true);
    const key = ({ material, location, date }: Row) => `${material}@${location}@${date}`;
    const keys = demo.map(key);
    expect(keys).toEqual([...keys].sort());
    const malformed = await api("GET", "/api/tenants/test/forecasts?page=0", adminSecret);
    expect(malformed.status).toBe(400);
    expect(Object.keys(json(malformed).error.fieldErrors)).toEqual(["page"]);

    const missing = await write("POST", "/api/tenants/test/forecasts", { material: "00000005", location: "00000001", date: "2030-01-01", quantity: "1" });
    expect(missing.status).toBe(428);
  });

  it("doesn't find a Prod-only material from Test, so no Test forecast can name one (TEN-014)", async () => {
    const generation = (json(await api("GET", "/api/tenants/test", adminSecret)).data as { generation: number }).generation;
    const inTest = new Set((json(await api("GET", "/api/tenants/test/materials", adminSecret)).data as { id: string }[]).map(({ id }) => id));
    // Both tenants number from 00000001, so create Prod materials until one gets an ID Test lacks.
    let prodOnly = "";
    for (let attempt = 0; attempt <= inTest.size && !prodOnly; attempt += 1) {
      const id = await createMaster("materials", { type: "finished", description: "fcapi prod-only cabinet", baseUnit: "each" });
      if (!inTest.has(id)) prodOnly = id;
    }

    const refused = await write("POST", "/api/tenants/test/forecasts", { material: prodOnly, location: "00000001", date: "2030-01-01", quantity: "1" }, generation);

    expect([refused.status, json(refused).error.code]).toEqual([404, "MATERIAL_NOT_FOUND"]);
  });

  it("lets a normal user's token read forecasts but not change them (TEN-004, API-010)", async () => {
    await write("POST", "/api/users", { username: "fcapi-una", password: PASSWORD });
    const una = openBrowser();
    try {
      await signIn(una, baseUrl, PASSWORD, "fcapi-una");
      await openTokens(una, baseUrl);
      const unaSecret = await createToken(una, "fcapi-una-cli");

      expect((await api("GET", "/api/tenants/prod/forecasts", unaSecret)).status).toBe(200);
      const create = await api("POST", "/api/tenants/prod/forecasts", unaSecret, {
        key: randomUUID(),
        body: { material: cabinet, location: plant, date: "2027-06-01", quantity: "1" },
      });
      expect([create.status, json(create).error.code]).toEqual([403, "FORBIDDEN"]);
    } finally {
      await una.close();
    }
  });

  it("searches and sorts the list on the server with the filters, and refuses a sort key it doesn't list (#221)", async () => {
    const crate = await createMaster("materials", { type: "finished", description: "fcsq crate", baseUnit: "each" });
    for (const [location, date] of [[plant, "2027-05-02"], [packer, "2027-05-03"], [plant, "2027-05-01"]]) {
      expect((await write("POST", "/api/tenants/prod/forecasts", { material: crate, location, date, quantity: "5" })).status).toBe(200);
    }
    const days = async (query: string) => (await forecasts(query)).map(({ location, date }) => `${location}@${date}`);

    expect(await days("?q=fcsq")).toEqual([`${plant}@2027-05-01`, `${plant}@2027-05-02`, `${packer}@2027-05-03`]);
    expect(await days("?q=fcsq&sort=date&dir=desc")).toEqual([`${packer}@2027-05-03`, `${plant}@2027-05-02`, `${plant}@2027-05-01`]);
    expect(await days(`?q=FCSQ+crate&location=${plant}&sort=date&dir=desc`)).toEqual([`${plant}@2027-05-02`, `${plant}@2027-05-01`]);
    expect(await days("?q=fcsq&surprise=1")).toHaveLength(3);

    const refused = await api("GET", "/api/tenants/prod/forecasts?sort=id", adminSecret);
    expect(refused.status).toBe(400);
    expect(json(refused).error).toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { sort: ["Sort by one of this list's columns."] } });
  });
});
