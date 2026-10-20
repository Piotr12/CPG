import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  initOrm,
  Location,
  Material,
  OptimisticLockError,
  selectTenant,
  TenantAuditEvent,
  type Orm,
  type TenantCode,
} from "@cpg/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { DEMO_SAFETY_STOCK_TARGETS } from "../../domain/safety-stock/demo-safety-stock-targets";
import { safetyTargetOn } from "../../domain/safety-stock/target-on";
import { LocationService } from "../locations/location.service";
import { MaterialService } from "../materials/material.service";
import type { AuditActor } from "../audit/actor";
import { hasSafetyStockTargets } from "./safety-stock-target-usage";
import { SafetyStockTargetService, type NewSafetyStockTarget } from "./safety-stock-target.service";

const ACTOR: AuditActor = { userId: "admin-id", username: "admin", sessionId: "admin-session", channel: "ui", token: null };

const JANUARY: NewSafetyStockTarget = { material: "00000001", location: "00000001", effectiveFrom: "2027-01-01", quantity: "100.000000" };
const KEY = { material: "00000001", location: "00000001", effectiveFrom: "2027-01-01" };

async function freshOrm(): Promise<Orm> {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-safety-stock-")) });
  await migrateDatabase(config);
  return initOrm(toDbOptions(config));
}

describe("SafetyStockTargetService", () => {
  let orm: Orm;
  const scopedEm = (tenant: TenantCode = "prod") => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const service = (tenant: TenantCode = "prod", em = scopedEm(tenant)) => new SafetyStockTargetService({ em });
  const spyableEm = () => {
    const em = scopedEm();
    vi.spyOn(em, "transactional").mockImplementation(async (callback) => callback(em));
    return em;
  };
  const audit = () => scopedEm().find(TenantAuditEvent, {}, { orderBy: { occurredAt: "asc", id: "asc" } });

  beforeEach(async () => {
    orm = await freshOrm();
    const em = scopedEm();
    em.create(Material, { code: "00000001", type: "finished", description: "Cabinet, red", baseUnit: "each" });
    em.create(Material, { code: "00000002", type: "raw", description: "Old paint", baseUnit: "l", active: false });
    em.create(Location, { code: "00000001", name: "Main plant" });
    em.create(Location, { code: "00000002", name: "Old quarry", active: false });
    await em.flush();
  });

  describe("create", () => {
    it("stores a target from its date and audits it (DEM-015, AUD-001)", async () => {
      expect(await service().create(JANUARY, ACTOR)).toEqual({ ...JANUARY, version: 1 });
      expect(await audit()).toEqual([
        expect.objectContaining({
          action: "safety-stock.safety-stock-target.created",
          subjectType: "SafetyStockTarget",
          subjectId: "00000001/00000001/2027-01-01",
          subjectLabel: "00000001 — Cabinet, red at 00000001 — Main plant from 2027-01-01",
          before: null,
          after: { material: "00000001", location: "00000001", effectiveFrom: "2027-01-01", quantity: "100.000000" },
        }),
      ]);
    });

    it("keeps a series over time, whose target in force changes on each date (DEM-016)", async () => {
      await service().create({ ...JANUARY, effectiveFrom: "2027-02-01", quantity: "150.000000" }, ACTOR);
      await service().create(JANUARY, ACTOR);

      const series = await service().list();
      expect(series.map(({ effectiveFrom }) => effectiveFrom)).toEqual(["2027-01-01", "2027-02-01"]);
      expect(safetyTargetOn(series, "2026-12-31")).toBe("0.000000");
      expect(safetyTargetOn(series, "2027-01-31")).toBe("100.000000");
      expect(safetyTargetOn(series, "2027-02-01")).toBe("150.000000");
    });

    it("refuses a second target on the same date (DEM-017)", async () => {
      await service().create(JANUARY, ACTOR);

      await expect(service().create({ ...JANUARY, quantity: "120.000000" }, ACTOR)).rejects.toMatchObject({
        code: "SAFETY_STOCK_TARGET_EXISTS",
        status: 409,
        message: "Material 00000001 already has a safety-stock target at location 00000001 from 2027-01-01.",
      });
      expect(await service().list()).toHaveLength(1);
    });

    it("maps a clash on the unique key to the same error", async () => {
      await service().create(JANUARY, ACTOR);
      const em = spyableEm();
      vi.spyOn(em, "count").mockResolvedValueOnce(0);

      await expect(service("prod", em).create(JANUARY, ACTOR)).rejects.toMatchObject({ code: "SAFETY_STOCK_TARGET_EXISTS" });
      expect(await audit()).toHaveLength(1);
    });

    it("refuses an inactive material or location (MAT-029, LFC-019), and another tenant's (TEN-014)", async () => {
      await expect(service().create({ ...JANUARY, material: "00000002" }, ACTOR)).rejects.toMatchObject({ code: "MATERIAL_INACTIVE" });
      await expect(service().create({ ...JANUARY, location: "00000002" }, ACTOR)).rejects.toMatchObject({ code: "LOCATION_INACTIVE" });
      await expect(service("test").create(JANUARY, ACTOR)).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND" });
    });
  });

  describe("update and remove", () => {
    beforeEach(async () => {
      await service().create(JANUARY, ACTOR);
    });

    it("changes the quantity at its version and audits it before and after (AUD-002)", async () => {
      expect(await service().update(KEY, "80.000000", 1, ACTOR)).toMatchObject({ quantity: "80.000000", version: 2 });
      expect((await audit()).at(-1)).toMatchObject({
        action: "safety-stock.safety-stock-target.updated",
        before: { quantity: "100.000000" },
        after: { quantity: "80.000000" },
      });
    });

    it("writes and records nothing for the same quantity", async () => {
      expect(await service().update(KEY, "100.000000", 1, ACTOR)).toMatchObject({ version: 1 });
      expect(await audit()).toHaveLength(1);
    });

    it("refuses a stale version, and maps a change landing before the flush the same way", async () => {
      await expect(service().update(KEY, "80.000000", 2, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      const em = spyableEm();
      vi.spyOn(em, "flush").mockRejectedValueOnce(new OptimisticLockError("The optimistic lock failed"));
      await expect(service("prod", em).update(KEY, "80.000000", 1, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    });

    it("doesn't find a target on another date", async () => {
      await expect(service().update({ ...KEY, effectiveFrom: "2027-01-02" }, "1.000000", 1, ACTOR)).rejects.toMatchObject({
        code: "SAFETY_STOCK_TARGET_NOT_FOUND",
        status: 404,
        message: "Material 00000001 has no safety-stock target at location 00000001 from 2027-01-02.",
      });
    });

    it("keeps an existing target editable and removable after its material is deactivated", async () => {
      const em = scopedEm();
      (await em.findOneOrFail(Material, { code: "00000001" })).active = false;
      await em.flush();

      await expect(service().update(KEY, "90.000000", 1, ACTOR)).resolves.toMatchObject({ quantity: "90.000000" });
      expect(await service().remove(KEY, 2, ACTOR)).toEqual(KEY);
      expect(await service().list()).toEqual([]);
      expect((await audit()).at(-1)).toMatchObject({
        action: "safety-stock.safety-stock-target.removed",
        before: { effectiveFrom: "2027-01-01", quantity: "90.000000" },
        after: null,
      });
    });
  });

  it("tells materials whether one has targets", async () => {
    const em = scopedEm();
    const material = await em.findOneOrFail(Material, { code: "00000001" });
    expect(await hasSafetyStockTargets(em, material)).toBe(false);
    await service().create(JANUARY, ACTOR);
    expect(await hasSafetyStockTargets(em, material)).toBe(true);
  });

  it("lists by material, location, then date, and each tenant only its own", async () => {
    const em = scopedEm();
    em.create(Location, { code: "00000003", name: "Warehouse" });
    await em.flush();
    await service().create({ ...JANUARY, location: "00000003" }, ACTOR);
    await service().create({ ...JANUARY, effectiveFrom: "2026-06-01" }, ACTOR);
    await service().create(JANUARY, ACTOR);

    expect((await service().list()).map(({ location, effectiveFrom }) => `${location} ${effectiveFrom}`)).toEqual([
      "00000001 2026-06-01",
      "00000001 2027-01-01",
      "00000003 2027-01-01",
    ]);
    expect(await service("test").list()).toEqual([]);
  });

  describe("seedDemo (spec Q12)", () => {
    const seedTestMasters = async () => {
      await new MaterialService({ em: scopedEm("test") }).seedDemo();
      await new LocationService({ em: scopedEm("test") }).seedDemo();
    };

    it("creates the demo targets in a fresh Test, unaudited, and nothing the second time", async () => {
      await seedTestMasters();

      expect(await service("test").seedDemo()).toBe(DEMO_SAFETY_STOCK_TARGETS.length);
      expect(await service("test").seedDemo()).toBe(0);
      expect(await service("test").list()).toEqual(DEMO_SAFETY_STOCK_TARGETS.map((target) => ({ ...target, version: 1 })));
      expect(await scopedEm("test").find(TenantAuditEvent, {})).toEqual([]);
    });

    it("never brings back removed targets, and skips an inactive material", async () => {
      await seedTestMasters();
      const em = scopedEm("test");
      (await em.findOneOrFail(Material, { code: "00000002" })).active = false;
      await em.flush();
      expect(await service("test").seedDemo()).toBe(DEMO_SAFETY_STOCK_TARGETS.length - 1);

      for (const target of await service("test").list()) await service("test").remove(target, 1, ACTOR);
      expect(await service("test").seedDemo()).toBe(0);
    });
  });
});
