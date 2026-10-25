import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Forecast,
  initOrm,
  Location,
  Material,
  MaterialConversion,
  OptimisticLockError,
  selectTenant,
  Tenant,
  TenantAuditEvent,
  type Orm,
  type TenantCode,
} from "@cpg/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { LocationService } from "../locations/location.service";
import { MaterialService } from "../materials/material.service";
import type { AuditActor } from "../audit/actor";
import { hasForecasts } from "./forecast-usage";
import { ForecastService, type ForecastFilter, type NewForecast } from "./forecast.service";
import type { ForecastSort } from "../../validators/forecasts/forecast-list.schema";
import type { ListOptions } from "../../validators/lists/list-query.schema";
import { QUANTITY_ROUNDS_TO_ZERO_MESSAGE, UNIT_NOT_CONVERTIBLE_MESSAGE } from "../../validators/boms/bom-fields.schema";
import { FIXTURE_FORECASTS, FIXTURE_LOCATIONS, FIXTURE_MATERIALS } from "../../../../../tests/setup/demo-fixtures";

const ACTOR: AuditActor = { userId: "admin-id", username: "admin", sessionId: "admin-session", channel: "ui", token: null };

const JANUARY: NewForecast = { material: "00000001", location: "00000001", date: "2027-01-01", quantity: "100" };
const KEY = { material: "00000001", location: "00000001", date: "2027-01-01" };

async function freshOrm(): Promise<Orm> {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-forecasts-")) });
  await migrateDatabase(config);
  return initOrm(toDbOptions(config));
}

describe("ForecastService", () => {
  let orm: Orm;
  const scopedEm = (tenant: TenantCode = "prod") => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const service = (tenant: TenantCode = "prod", em = scopedEm(tenant)) => new ForecastService({ em });
  const spyableEm = () => {
    const em = scopedEm();
    vi.spyOn(em, "transactional").mockImplementation(async (callback) => callback(em));
    return em;
  };
  const audit = () => scopedEm().find(TenantAuditEvent, {}, { orderBy: { occurredAt: "asc", id: "asc" } });

  beforeEach(async () => {
    orm = await freshOrm();
    const em = scopedEm();
    const cabinet = em.create(Material, { code: "00000001", type: "finished", description: "Cabinet, red", baseUnit: "each" });
    em.create(Material, { code: "00000002", type: "raw", description: "Old paint", baseUnit: "l", active: false });
    em.create(MaterialConversion, { material: cabinet, unit: "case", numerator: "12", denominator: "1" });
    em.create(Location, { code: "00000001", name: "Main plant" });
    em.create(Location, { code: "00000002", name: "Old quarry", active: false });
    await em.flush();
  });

  describe("create", () => {
    it("stores a forecast for a day, with no customer, and audits it (DEM-001, R03, AUD-001)", async () => {
      expect(await service().create(JANUARY, ACTOR)).toEqual({ ...KEY, quantity: "100.000000", version: 1 });
      expect(await audit()).toEqual([
        expect.objectContaining({
          action: "forecasts.forecast.created",
          subjectType: "Forecast",
          subjectId: "00000001/00000001/2027-01-01",
          subjectLabel: "00000001 — Cabinet, red at 00000001 — Main plant on 2027-01-01",
          before: null,
          after: { ...KEY, quantity: "100.000000" },
        }),
      ]);
    });

    it("converts a quantity entered in another unit into the base unit (MAT-019)", async () => {
      expect(await service().create({ ...JANUARY, quantity: "2.5", unit: "case" }, ACTOR)).toMatchObject({ quantity: "30.000000" });
      expect(await service().create({ ...JANUARY, date: "2027-01-02", quantity: "3", unit: "each" }, ACTOR)).toMatchObject({
        quantity: "3.000000",
      });
    });

    it("refuses a unit the material doesn't convert, and a quantity that vanishes, on their fields (MAT-023, MAT-032)", async () => {
      await expect(service().create({ ...JANUARY, unit: "pallet" }, ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { unit: [UNIT_NOT_CONVERTIBLE_MESSAGE] },
      });
      const em = scopedEm();
      em.create(MaterialConversion, { material: await em.findOneOrFail(Material, { code: "00000001" }), unit: "mil", numerator: "1", denominator: "1000000" });
      await em.flush();
      await expect(service().create({ ...JANUARY, quantity: "0.1", unit: "mil" }, ACTOR)).rejects.toMatchObject({
        fieldErrors: { quantity: [QUANTITY_ROUNDS_TO_ZERO_MESSAGE] },
      });
      expect(await service().list()).toEqual([]);
      expect(await audit()).toEqual([]);
    });

    it("refuses a forecast entered in the statistical unit, though the material has an SU factor, writing nothing (#239)", async () => {
      const em = scopedEm();
      em.create(MaterialConversion, { material: await em.findOneOrFail(Material, { code: "00000001" }), unit: "SU", numerator: "1", denominator: "1.5" });
      await em.flush();

      await expect(service().create({ ...JANUARY, quantity: "3", unit: "SU" }, ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        status: 400,
        fieldErrors: { unit: [UNIT_NOT_CONVERTIBLE_MESSAGE] },
      });
      expect(await scopedEm().count(Forecast, {})).toBe(0);
      expect(await audit()).toEqual([]);
    });

    it("stores several days of one material and location, ordered by date (DEM-001)", async () => {
      await service().create({ ...JANUARY, date: "2027-01-03" }, ACTOR);
      await service().create(JANUARY, ACTOR);
      await service().create({ ...JANUARY, date: "2027-01-02", quantity: "7" }, ACTOR);

      expect((await service().list()).map(({ date, quantity }) => `${date} ${quantity}`)).toEqual([
        "2027-01-01 100.000000",
        "2027-01-02 7.000000",
        "2027-01-03 100.000000",
      ]);
    });

    it("refuses a second forecast on the same day (D04)", async () => {
      await service().create(JANUARY, ACTOR);

      await expect(service().create({ ...JANUARY, quantity: "120" }, ACTOR)).rejects.toMatchObject({
        code: "FORECAST_EXISTS",
        status: 409,
        message: "Material 00000001 already has a forecast at location 00000001 on 2027-01-01.",
      });
      expect(await service().list()).toHaveLength(1);
    });

    it("maps a clash on the unique key to the same error", async () => {
      await service().create(JANUARY, ACTOR);
      const em = spyableEm();
      vi.spyOn(em, "count").mockResolvedValueOnce(0);

      await expect(service("prod", em).create(JANUARY, ACTOR)).rejects.toMatchObject({ code: "FORECAST_EXISTS" });
      expect(await audit()).toHaveLength(1);
    });

    it("refuses an inactive material or location (MAT-029, LFC-019, INV-020), and another tenant's (TEN-014), writing nothing", async () => {
      await expect(service().create({ ...JANUARY, material: "00000002" }, ACTOR)).rejects.toMatchObject({ code: "MATERIAL_INACTIVE" });
      await expect(service().create({ ...JANUARY, location: "00000002" }, ACTOR)).rejects.toMatchObject({ code: "LOCATION_INACTIVE" });
      await expect(service("test").create(JANUARY, ACTOR)).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND", status: 404 });
      // Test has the material but not the location: Prod's 00000001 stays out of reach.
      const test = scopedEm("test");
      test.create(Material, { code: "00000001", type: "finished", description: "Test cabinet", baseUnit: "each" });
      await test.flush();
      await expect(service("test").create(JANUARY, ACTOR)).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND", status: 404 });

      expect(await service().list()).toEqual([]);
      expect(await service("test").list()).toEqual([]);
      expect(await audit()).toEqual([]);
      expect(await scopedEm("test").count(TenantAuditEvent, {})).toBe(0);
    });
  });

  describe("update and remove", () => {
    beforeEach(async () => {
      await service().create(JANUARY, ACTOR);
    });

    it("changes the quantity at its version and audits it before and after (AUD-002)", async () => {
      expect(await service().update(KEY, { quantity: "80" }, 1, ACTOR)).toMatchObject({ quantity: "80.000000", version: 2 });
      expect((await audit()).at(-1)).toMatchObject({
        action: "forecasts.forecast.updated",
        before: { quantity: "100.000000" },
        after: { quantity: "80.000000" },
      });
    });

    it("writes and records nothing for the same quantity", async () => {
      expect(await service().update(KEY, { quantity: "100" }, 1, ACTOR)).toMatchObject({ version: 1 });
      expect(await service().update(KEY, { quantity: "100", unit: "each" }, 1, ACTOR)).toMatchObject({ version: 1 });
      expect(await audit()).toHaveLength(1);
    });

    it("converts a changed quantity from its unit, and refuses one the material doesn't convert", async () => {
      expect(await service().update(KEY, { quantity: "2", unit: "case" }, 1, ACTOR)).toMatchObject({ quantity: "24.000000" });
      await expect(service().update(KEY, { quantity: "2", unit: "pallet" }, 2, ACTOR)).rejects.toMatchObject({
        fieldErrors: { unit: [UNIT_NOT_CONVERTIBLE_MESSAGE] },
      });
      expect(await audit()).toHaveLength(2);
    });

    it("refuses a stale version, and maps a change landing before the flush the same way", async () => {
      await expect(service().update(KEY, { quantity: "80" }, 2, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      const em = spyableEm();
      vi.spyOn(em, "flush").mockRejectedValueOnce(new OptimisticLockError("The optimistic lock failed"));
      await expect(service("prod", em).update(KEY, { quantity: "80" }, 1, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    });

    it("doesn't find a forecast on another day", async () => {
      await expect(service().update({ ...KEY, date: "2027-01-02" }, { quantity: "1" }, 1, ACTOR)).rejects.toMatchObject({
        code: "FORECAST_NOT_FOUND",
        status: 404,
        message: "Material 00000001 has no forecast at location 00000001 on 2027-01-02.",
      });
    });

    it("keeps an existing forecast editable and removable after its material is deactivated", async () => {
      const em = scopedEm();
      (await em.findOneOrFail(Material, { code: "00000001" })).active = false;
      await em.flush();

      await expect(service().update(KEY, { quantity: "90" }, 1, ACTOR)).resolves.toMatchObject({ quantity: "90.000000" });
      expect(await service().remove(KEY, 2, ACTOR)).toEqual(KEY);
      expect(await service().list()).toEqual([]);
      // The audit entry is the tombstone (AUD-005): it names the forecast and keeps what it held.
      expect((await audit()).at(-1)).toMatchObject({
        action: "forecasts.forecast.removed",
        subjectId: "00000001/00000001/2027-01-01",
        before: { ...KEY, quantity: "90.000000" },
        after: null,
      });
    });
  });

  it("tells materials whether one has forecasts", async () => {
    const em = scopedEm();
    const material = await em.findOneOrFail(Material, { code: "00000001" });
    expect(await hasForecasts(em, material)).toBe(false);
    await service().create(JANUARY, ACTOR);
    expect(await hasForecasts(em, material)).toBe(true);
  });

  it("lists by material, location, then date, and each tenant only its own", async () => {
    const em = scopedEm();
    em.create(Location, { code: "00000003", name: "Warehouse" });
    await em.flush();
    await service().create({ ...JANUARY, location: "00000003" }, ACTOR);
    await service().create({ ...JANUARY, date: "2026-06-01" }, ACTOR);
    await service().create(JANUARY, ACTOR);

    expect((await service().list()).map(({ location, date }) => `${location} ${date}`)).toEqual([
      "00000001 2026-06-01",
      "00000001 2027-01-01",
      "00000003 2027-01-01",
    ]);
    expect(await service("test").list()).toEqual([]);
  });

  it("narrows the list to a material and/or a location, and an unknown one matches nothing", async () => {
    const em = scopedEm();
    em.create(Location, { code: "00000003", name: "Warehouse" });
    em.create(Material, { code: "00000004", type: "finished", description: "Cabinet, blue", baseUnit: "each" });
    await em.flush();
    await service().create(JANUARY, ACTOR);
    await service().create({ ...JANUARY, location: "00000003" }, ACTOR);
    await service().create({ ...JANUARY, material: "00000004" }, ACTOR);
    const days = async (filter: ForecastFilter) =>
      (await service().list(filter)).map(({ material, location }) => `${material}@${location}`);

    expect(await days({})).toEqual(["00000001@00000001", "00000001@00000003", "00000004@00000001"]);
    expect(await days({ material: "00000001" })).toEqual(["00000001@00000001", "00000001@00000003"]);
    expect(await days({ location: "00000001" })).toEqual(["00000001@00000001", "00000004@00000001"]);
    expect(await days({ material: "00000001", location: "00000003" })).toEqual(["00000001@00000003"]);
    expect(await days({ material: "00000009" })).toEqual([]);
  });

  describe("paging", () => {
    const DAYS = 84;
    const day = (offset: number) => new Date(Date.UTC(2027, 0, 1 + offset)).toISOString().slice(0, 10);

    // 3 materials × 2 locations × 84 days = 504 forecasts: more than one read batch of 500. The masters'
    // UUIDs run against their business IDs, and the forecasts are inserted newest material first, so
    // neither UUID nor insertion order matches the list's order.
    beforeEach(async () => {
      const em = scopedEm();
      const materials = [
        em.create(Material, { id: "ffffffff-0000-4000-8000-000000000000", code: "00000004", type: "finished", description: "Desk", baseUnit: "each" }),
        em.create(Material, { id: "00000000-0000-4000-8000-000000000000", code: "00000003", type: "finished", description: "Chair", baseUnit: "each" }),
        await em.findOneOrFail(Material, { code: "00000001" }),
      ];
      const locations = [
        em.create(Location, { id: "00000000-0000-4000-8000-000000000001", code: "00000003", name: "Warehouse" }),
        await em.findOneOrFail(Location, { code: "00000001" }),
      ];
      for (const material of materials) {
        for (const location of locations) {
          for (let offset = DAYS - 1; offset >= 0; offset--) em.create(Forecast, { material, location, date: day(offset), quantity: "1.000000" });
        }
      }
      await em.flush();
    });

    const keys = (views: { material: string; location: string; date: string }[]) =>
      views.map(({ material, location, date }) => `${material}@${location}@${date}`);
    const expected = (materials: string[], locations: string[]) =>
      materials.flatMap((material) => locations.flatMap((location) => Array.from({ length: DAYS }, (_, i) => `${material}@${location}@${day(i)}`)));
    const allPages = async (filter: ForecastFilter, pages: number, options: ListOptions<ForecastSort> = {}) => {
      const result = [];
      for (let page = 1; page <= pages; page++) result.push(...(await service().list(filter, { ...options, page })));
      return result;
    };
    /** Every key, ordered by the given parts of `material@location@date` (0, 1, 2), each `1` or `-1`. */
    const orderedBy = (keys: string[], ...parts: [number, 1 | -1][]) =>
      [...keys].sort((a, b) => {
        const [x, y] = [a.split("@"), b.split("@")];
        for (const [part, sign] of parts) if (x[part] !== y[part]) return x[part] < y[part] ? -sign : sign;
        return 0;
      });
    const ALL = expected(["00000001", "00000003", "00000004"], ["00000001", "00000003"]);

    it("pages by 100 in material, location and date order, a page past the last being empty", async () => {
      expect(await service().count()).toBe(504);
      expect(await service().list()).toEqual(await service().list({}, { page: 1 }));
      expect(await service().list({}, { page: 1 })).toHaveLength(100);
      expect(await service().list({}, { page: 6 })).toHaveLength(4);
      expect(await service().list({}, { page: 7 })).toEqual([]);
      expect(keys(await allPages({}, 6))).toEqual(expected(["00000001", "00000003", "00000004"], ["00000001", "00000003"]));
    });

    it("keeps each forecast's quantity and current version", async () => {
      await service().update({ material: "00000004", location: "00000003", date: day(83) }, { quantity: "7" }, 1, ACTOR);
      const last = (await service().list({}, { page: 6 })).at(-1);
      expect(last).toEqual({ material: "00000004", location: "00000003", date: day(83), quantity: "7.000000", version: 2 });
      expect((await service().list({}, { page: 6 }))[0]).toEqual({ material: "00000004", location: "00000003", date: day(80), quantity: "1.000000", version: 1 });
    });

    it("narrows before paging, and counts what the filter matches", async () => {
      expect(await service().count({ material: "00000003" })).toBe(168);
      expect(keys(await allPages({ material: "00000003" }, 2))).toEqual(expected(["00000003"], ["00000001", "00000003"]));
      expect(await service().count({ location: "00000003" })).toBe(252);
      expect(keys(await allPages({ location: "00000003" }, 3))).toEqual(expected(["00000001", "00000003", "00000004"], ["00000003"]));
      expect(await service().count({ material: "00000004", location: "00000001" })).toBe(84);
      expect(keys(await service().list({ material: "00000004", location: "00000001" }))).toEqual(expected(["00000004"], ["00000001"]));
      expect(await service("test").count()).toBe(0);
    });

    it("matches nothing for a material or location the tenant doesn't have", async () => {
      expect(await service().count({ material: "00000009" })).toBe(0);
      expect(await service().list({ material: "00000009" })).toEqual([]);
      expect(await service().count({ location: "00000009" })).toBe(0);
      expect(await service().list({ material: "00000001", location: "00000009" })).toEqual([]);
    });

    describe("sorted and searched (#217)", () => {
      it("sorts by each column, both ways, by material, location and date within equal values, across pages", async () => {
        expect(keys(await allPages({}, 6, { sort: "material", dir: "desc" }))).toEqual(orderedBy(ALL, [0, -1], [1, 1], [2, 1]));
        expect(keys(await allPages({}, 6, { sort: "location" }))).toEqual(orderedBy(ALL, [1, 1], [0, 1], [2, 1]));
        expect(keys(await allPages({}, 6, { sort: "location", dir: "desc" }))).toEqual(orderedBy(ALL, [1, -1], [0, 1], [2, 1]));
        // 6 forecasts a day, so page 1 ends inside day 16 and page 2 starts with the rest of it.
        const byDate = orderedBy(ALL, [2, 1], [0, 1], [1, 1]);
        expect(keys(await service().list({}, { sort: "date", page: 2 }))[0]).toBe(`00000004@00000001@${day(16)}`);
        expect(keys(await allPages({}, 6, { sort: "date" }))).toEqual(byDate);
        expect(keys(await allPages({}, 6, { sort: "date", dir: "desc" }))).toEqual(orderedBy(ALL, [2, -1], [0, 1], [1, 1]));
      });

      it("sorts by quantity by its value, not its text, by material, location and date within equal values (#224)", async () => {
        const em = scopedEm();
        const bigger = { "00000001@00000001@": "25.000000", "00000003@00000003@": "100.000000", "00000004@00000001@": "9.500000" };
        for (const [prefix, quantity] of Object.entries(bigger)) {
          const [material, location] = prefix.split("@");
          const forecast = await em.findOneOrFail(Forecast, { material: { code: material }, location: { code: location }, date: day(40) });
          forecast.quantity = quantity;
        }
        await em.flush();
        const changed = Object.keys(bigger).map((prefix) => `${prefix}${day(40)}`);
        const ones = ALL.filter((key) => !changed.includes(key));
        const [nine, twentyFive, hundred] = [changed[2], changed[0], changed[1]];

        const descending = keys(await allPages({}, 6, { sort: "quantity", dir: "desc" }));
        expect(descending).toEqual([hundred, twentyFive, nine, ...ones]);
        expect(keys(await allPages({}, 6, { sort: "quantity" }))).toEqual([...ones, nine, twentyFive, hundred]);
        expect(keys(await service().list({}, { sort: "quantity", dir: "desc", page: 2 }))[0]).toBe(descending[100]);
      });

      it("keeps forecasts whose material ID or description or location ID or name holds every word, and counts them", async () => {
        const searched = async (q: string, filter: ForecastFilter = {}) => {
          const count = await service().count(filter, { q });
          return { count, keys: keys(await allPages(filter, Math.max(1, Math.ceil(count / 100)), { q })) };
        };
        expect(await searched("CHAIR")).toEqual({ count: 168, keys: expected(["00000003"], ["00000001", "00000003"]) });
        expect(await searched("warehouse")).toEqual({ count: 252, keys: expected(["00000001", "00000003", "00000004"], ["00000003"]) });
        expect(await searched("desk main")).toEqual({ count: 84, keys: expected(["00000004"], ["00000001"]) });
        expect(await searched("cabinet red")).toEqual({ count: 168, keys: expected(["00000001"], ["00000001", "00000003"]) });
        // The ID of material 3 or of location 3.
        expect((await searched("00000003")).count).toBe(336);
        expect(await searched("cabinet", { location: "00000003" })).toEqual({ count: 84, keys: expected(["00000001"], ["00000003"]) });
        expect(await searched("chair desk")).toEqual({ count: 0, keys: [] });
        expect(await service("test").count({}, { q: "chair" })).toBe(0);
        expect(await service("test").list({}, { q: "chair" })).toEqual([]);
      });

      it("searches and sorts together, and treats LIKE wildcards as separators", async () => {
        expect(keys(await allPages({}, 3, { q: "warehouse", sort: "material", dir: "desc" }))).toEqual(
          expected(["00000004", "00000003", "00000001"], ["00000003"]),
        );
        expect(await service().count({}, { q: "%" })).toBe(504);
        expect(await service().count({}, { q: "main_plant" })).toBe(252);
      });
    });
  });

  describe("seedDemo", () => {
    const seedTestMasters = async () => {
      await new MaterialService({ em: scopedEm("test") }).seedDemo(FIXTURE_MATERIALS);
      await new LocationService({ em: scopedEm("test") }).seedDemo(FIXTURE_LOCATIONS);
    };

    it("creates the given forecasts in an empty Test, unaudited, and nothing once it has any", async () => {
      await seedTestMasters();

      expect(await service("test").seedDemo(FIXTURE_FORECASTS)).toBe(FIXTURE_FORECASTS.length);
      expect(await service("test").seedDemo(FIXTURE_FORECASTS)).toBe(0);
      expect(await service("test").list()).toEqual(FIXTURE_FORECASTS.map((target) => ({ ...target, version: 1 })));
      expect(await scopedEm("test").find(TenantAuditEvent, {})).toEqual([]);
    });

    it("seeds exactly the given rows", async () => {
      await seedTestMasters();
      const rows = [{ material: "00000001", location: "00000001", date: "2026-03-01", quantity: "7.000000" }];

      expect(await service("test").seedDemo(rows)).toBe(1);
      expect(await service("test").list()).toEqual([{ ...rows[0], version: 1 }]);
    });

    it.each([
      ["a missing material", "MATERIAL_NOT_FOUND", { material: "00000099" }],
      ["an inactive material", "MATERIAL_INACTIVE", { material: "00000002" }],
      ["a missing location", "LOCATION_NOT_FOUND", { location: "00000099" }],
      ["an inactive location", "LOCATION_INACTIVE", { location: "00000003" }],
    ])("refuses the whole seed for a row with %s, writing nothing", async (_, code, change) => {
      await seedTestMasters();
      const em = scopedEm("test");
      (await em.findOneOrFail(Material, { code: "00000002" })).active = false;
      (await em.findOneOrFail(Location, { code: "00000003" })).active = false;
      await em.flush();
      const rows = [FIXTURE_FORECASTS[1], { ...FIXTURE_FORECASTS[2], ...change }];

      await expect(service("test").seedDemo(rows)).rejects.toMatchObject({ code });
      expect(await service("test").list()).toEqual([]);
    });

    it("seeds nothing into a read-only tenant (R05)", async () => {
      await seedTestMasters();
      await orm.em.fork().nativeUpdate(Tenant, { code: "test" }, { readOnly: true });

      expect(await service("test").seedDemo(FIXTURE_FORECASTS)).toBe(0);
      expect(await service("test").list()).toEqual([]);
    });
  });
});
