import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  initOrm,
  Location,
  Material,
  MaterialConversion,
  OptimisticLockError,
  selectTenant,
  TenantAuditEvent,
  type Orm,
  type TenantCode,
} from "@cpg/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { DEMO_FORECASTS } from "../../domain/forecasts/demo-forecasts";
import { LocationService } from "../locations/location.service";
import { MaterialService } from "../materials/material.service";
import type { AuditActor } from "../audit/actor";
import { hasForecasts } from "./forecast-usage";
import { ForecastService, type ForecastFilter, type NewForecast } from "./forecast.service";
import { QUANTITY_ROUNDS_TO_ZERO_MESSAGE, UNIT_NOT_CONVERTIBLE_MESSAGE } from "../../validators/boms/bom-fields.schema";

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

  describe("seedDemo (spec Q12)", () => {
    const seedTestMasters = async () => {
      await new MaterialService({ em: scopedEm("test") }).seedDemo();
      await new LocationService({ em: scopedEm("test") }).seedDemo();
    };

    it("creates the demo forecasts in a fresh Test, unaudited, and nothing the second time", async () => {
      await seedTestMasters();

      expect(await service("test").seedDemo()).toBe(DEMO_FORECASTS.length);
      expect(await service("test").seedDemo()).toBe(0);
      expect(await service("test").list()).toEqual(DEMO_FORECASTS.map((target) => ({ ...target, version: 1 })));
      expect(await scopedEm("test").find(TenantAuditEvent, {})).toEqual([]);
    });

    it("never brings back removed forecasts, and skips an inactive material", async () => {
      await seedTestMasters();
      const em = scopedEm("test");
      (await em.findOneOrFail(Material, { code: "00000002" })).active = false;
      await em.flush();
      expect(await service("test").seedDemo()).toBe(DEMO_FORECASTS.length - 1);

      for (const target of await service("test").list()) await service("test").remove(target, 1, ACTOR);
      expect(await service("test").seedDemo()).toBe(0);
    });
  });
});
