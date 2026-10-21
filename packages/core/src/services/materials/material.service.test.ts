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
  Tenant,
  TenantAuditEvent,
  type Orm,
  type TenantCode,
} from "@cpg/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { loadConfig } from "../../config";
import { getContainer } from "../../container/container";
import { migrateDatabase, toDbOptions } from "../../database";
import { DEMO_MATERIALS } from "../../domain/materials/demo-materials";
import { VERSION_CONFLICT } from "../../http/errors";
import { tenantServerAction } from "../../http/tenant-server-action";
import { conversionChangeSchema } from "../../validators/materials/conversion.schema";
import { FACTOR_MESSAGE } from "../../validators/materials/material-fields.schema";
import type { AuditActor } from "../audit/actor";
import { BomService } from "../boms/bom.service";
import { PlanningParameterService } from "../planning-parameters/planning-parameter.service";
import { ForecastService } from "../forecasts/forecast.service";
import { SafetyStockTargetService } from "../safety-stock/safety-stock-target.service";
import { MATERIAL_ID_RACE, MaterialService } from "./material.service";

/** Who the tests act as: the admin, on the UI. */
const ACTOR: AuditActor = { userId: "admin-id", username: "admin", sessionId: "admin-session", channel: "ui", token: null };
const BOLT = { type: "raw", description: "Bolt M8", baseUnit: "each" } as const;
const CASE = { unit: "case", numerator: "12", denominator: "1" };

/** A fresh, migrated database: audit entries can't be deleted, so each test starts empty. */
async function freshOrm(): Promise<Orm> {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-material-service-")) });
  await migrateDatabase(config);
  return initOrm(toDbOptions(config));
}

describe("MaterialService", () => {
  let orm: Orm;

  /** An EntityManager scoped to one tenant, as tenantScope() builds it. */
  const scopedEm = (tenant: TenantCode) => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const service = (tenant: TenantCode = "prod", em = scopedEm(tenant)) => new MaterialService({ em });
  /**
   * A Prod EntityManager whose transactions run on itself, so a spy on its `find`, `count` or `flush`
   * sees the service's calls (MikroORM's `transactional()` otherwise hands the callback a fork).
   */
  const spyableEm = () => {
    const em = scopedEm("prod");
    vi.spyOn(em, "transactional").mockImplementation(async (callback) => callback(em));
    return em;
  };
  /** The tenant's audit entries, oldest first. Each test writes them seconds apart at most, so order by time. */
  const audit = (tenant: TenantCode = "prod") =>
    scopedEm(tenant).find(TenantAuditEvent, {}, { orderBy: { occurredAt: "asc", id: "asc" } });
  /**
   * The newest Prod entry with this action. Entries written in the same millisecond sort by their
   * random id, so tests pick entries by action rather than by position.
   */
  const entry = async (action: string) => (await audit()).filter((event) => event.action === action).at(-1);
  /** A Bolt with a case conversion, in Prod. */
  async function boltWithCase() {
    const bolt = await service().create(BOLT, ACTOR);
    await service().addConversion(bolt.id, CASE, ACTOR);
    return service().get(bolt.id);
  }

  beforeEach(async () => {
    orm = await freshOrm();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await orm.close();
  });

  describe("create", () => {
    it("gives the first material of an empty tenant 00000001 and the next 00000002 (MAT-001, MAT-002)", async () => {
      const first = await service().create(BOLT, ACTOR);
      const second = await service().create({ type: "finished", description: "Cabinet", baseUnit: "each" }, ACTOR);

      expect(first).toEqual({
        id: "00000001",
        type: "raw",
        description: "Bolt M8",
        baseUnit: "each",
        active: true,
        createdAt: expect.any(Date),
        version: 1,
      });
      expect(second.id).toBe("00000002");
    });

    it("numbers each tenant on its own: Test and Prod both have 00000001, as different records (MAT-003, TEN-012)", async () => {
      await service("test").create({ ...BOLT, description: "Test bolt" }, ACTOR);
      await service("test").create({ ...BOLT, description: "Second test bolt" }, ACTOR);

      expect((await service("prod").create({ ...BOLT, description: "Prod bolt" }, ACTOR)).id).toBe("00000001");
      expect((await service("test").get("00000001")).description).toBe("Test bolt");
      expect((await service("prod").get("00000001")).description).toBe("Prod bolt");
    });

    it("records the create with its new values in the tenant's audit (AUD-001)", async () => {
      await service().create(BOLT, ACTOR);

      const [entry] = await audit();
      expect(entry).toMatchObject({
        action: "materials.material.created",
        subjectType: "Material",
        subjectId: "00000001",
        subjectLabel: "00000001 — Bolt M8",
        before: null,
        after: { id: "00000001", type: "raw", description: "Bolt M8", baseUnit: "each", active: true },
        actorUsername: "admin",
        sessionId: "admin-session",
        channel: "ui",
      });
      expect(await audit("test")).toEqual([]);
    });

    it("maps a clash on the unique ID to CONFLICT, writing nothing", async () => {
      await service().create(BOLT, ACTOR);
      const em = spyableEm();
      // The highest-ID read misses the existing material, as a stale read on another connection would.
      vi.spyOn(em, "find").mockResolvedValueOnce([]);

      await expect(service("prod", em).create(BOLT, ACTOR)).rejects.toMatchObject({ code: "CONFLICT", message: MATERIAL_ID_RACE });
      expect(await service().list()).toHaveLength(1);
      expect(await audit()).toHaveLength(1);
    });

    it("passes other errors through", async () => {
      const em = spyableEm();
      vi.spyOn(em, "flush").mockRejectedValueOnce(new Error("disk full"));

      await expect(service("prod", em).create(BOLT, ACTOR)).rejects.toThrow("disk full");
    });
  });

  describe("list and get", () => {
    it("lists the tenant's materials by ID", async () => {
      await service().create(BOLT, ACTOR);
      await service().create({ type: "raw", description: "Nut M8", baseUnit: "each" }, ACTOR);
      await service("test").create(BOLT, ACTOR);

      expect((await service().list()).map(({ id, description }) => `${id} ${description}`)).toEqual([
        "00000001 Bolt M8",
        "00000002 Nut M8",
      ]);
    });

    it("gets a material with its conversions by unit, and the indicative inverse (MAT-021)", async () => {
      const bolt = await boltWithCase();
      await service().addConversion(bolt.id, { unit: "box", numerator: "100", denominator: "1" }, ACTOR);

      expect((await service().get(bolt.id)).conversions).toEqual([
        { unit: "box", numerator: "100", denominator: "1", inverse: "0.01", version: 1 },
        { unit: "case", numerator: "12", denominator: "1", inverse: "0.083333", version: 1 },
      ]);
    });

    it("doesn't find an unknown ID, or another tenant's material (TEN-014)", async () => {
      await service("prod").create(BOLT, ACTOR);

      await expect(service("prod").get("00000002")).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND", status: 404 });
      await expect(service("test").get("00000001")).rejects.toMatchObject({
        code: "MATERIAL_NOT_FOUND",
        message: "There is no material 00000001 in this tenant.",
      });
    });
  });

  describe("update", () => {
    it("changes the description and records before and after (AUD-002)", async () => {
      const bolt = await service().create(BOLT, ACTOR);

      const updated = await service().update(bolt.id, { description: "Bolt M8 × 40" }, bolt.version, ACTOR);

      expect(updated).toMatchObject({ id: "00000001", description: "Bolt M8 × 40", version: 2 });
      expect(await entry("materials.material.updated")).toMatchObject({
        action: "materials.material.updated",
        subjectLabel: "00000001 — Bolt M8 × 40",
        before: { description: "Bolt M8" },
        after: { description: "Bolt M8 × 40" },
      });
    });

    it("changes the type and the base unit of an unused material (MAT-009, MAT-013)", async () => {
      const bolt = await service().create(BOLT, ACTOR);

      const updated = await service().update(bolt.id, { type: "intermediate", baseUnit: "pcs" }, 1, ACTOR);

      expect(updated).toMatchObject({ type: "intermediate", baseUnit: "pcs" });
      expect(await entry("materials.material.updated")).toMatchObject({
        before: { type: "raw", baseUnit: "each" },
        after: { type: "intermediate", baseUnit: "pcs" },
      });
    });

    it("never changes the ID, even when the changes carry one (MAT-004)", async () => {
      const bolt = await service().create(BOLT, ACTOR);
      const changes = { description: "x", id: "00000009", code: "00000009" } as Parameters<MaterialService["update"]>[1];

      expect((await service().update(bolt.id, changes, 1, ACTOR)).id).toBe("00000001");
      expect((await service().list()).map(({ id, description }) => `${id} ${description}`)).toEqual(["00000001 x"]);
      await expect(service().get("00000009")).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND" });
      const updated = await entry("materials.material.updated");
      expect(updated).toMatchObject({ subjectId: "00000001" });
      expect([updated?.before, updated?.after]).toEqual([{ description: "Bolt M8" }, { description: "x" }]);
    });

    it("deactivates and reactivates as their own audited actions (AUD-003)", async () => {
      const bolt = await service().create(BOLT, ACTOR);

      expect(await service().update(bolt.id, { active: false }, 1, ACTOR)).toMatchObject({ active: false, version: 2 });
      expect(await service().update(bolt.id, { active: true }, 2, ACTOR)).toMatchObject({ active: true, version: 3 });

      expect(await entry("materials.material.deactivated")).toMatchObject({ before: { active: true }, after: { active: false } });
      expect(await entry("materials.material.reactivated")).toMatchObject({ before: { active: false }, after: { active: true } });
    });

    it("records a field change and a deactivation in one request as two entries", async () => {
      const bolt = await service().create(BOLT, ACTOR);

      await service().update(bolt.id, { description: "Old bolt", active: false }, 1, ACTOR);

      // Both are written in the same millisecond, so their order is the random id's: compare as a set.
      expect((await audit()).slice(1).map(({ action }) => action).sort()).toEqual([
        "materials.material.deactivated",
        "materials.material.updated",
      ]);
    });

    it("writes and records nothing when no value differs, the form resending every field included", async () => {
      const bolt = await service().create(BOLT, ACTOR);

      const same = await service().update(bolt.id, { ...BOLT, active: true }, 1, ACTOR);

      expect(same.version).toBe(1);
      expect(await audit()).toHaveLength(1);
    });

    it("refuses a base-unit change while conversions exist, but not the same base unit resent (spec Q8)", async () => {
      const bolt = await boltWithCase();

      await expect(service().update(bolt.id, { baseUnit: "pcs" }, bolt.version, ACTOR)).rejects.toMatchObject({
        code: "BASE_UNIT_HAS_CONVERSIONS",
        status: 409,
      });
      expect((await service().get(bolt.id)).baseUnit).toBe("each");

      const edited = await service().update(bolt.id, { description: "Bolt", baseUnit: "each" }, bolt.version, ACTOR);
      expect(edited).toMatchObject({ description: "Bolt", baseUnit: "each" });
    });

    describe("with planning data (planning spec Q5, Q6)", () => {
      const PANEL = { type: "intermediate", description: "Painted side panel", baseUnit: "each" } as const;
      const SET = { location: "00000001", procurement: "make", leadTimeDays: 2, minimumQuantity: "50.000000", lotMultiple: "10.000000" } as const;

      beforeEach(async () => {
        const em = scopedEm("prod");
        em.create(Location, { code: "00000001", name: "Main plant" });
        await em.flush();
      });

      it("locks the base unit while a planning parameter set holds quantities in it", async () => {
        const panel = await service().create(PANEL, ACTOR);
        await new PlanningParameterService({ em: scopedEm("prod") }).create({ ...SET, material: panel.id, procurement: "buy" }, ACTOR);

        await expect(service().update(panel.id, { baseUnit: "pcs" }, panel.version, ACTOR)).rejects.toMatchObject({
          code: "BASE_UNIT_IN_USE",
          status: 409,
        });
        await expect(service().update(panel.id, { baseUnit: "each", description: "Panel" }, panel.version, ACTOR)).resolves.toMatchObject({
          description: "Panel",
        });
      });

      it("locks the base unit while a safety target holds a quantity in it", async () => {
        const panel = await service().create(PANEL, ACTOR);
        await new SafetyStockTargetService({ em: scopedEm("prod") }).create(
          { material: panel.id, location: "00000001", effectiveFrom: "2027-01-01", quantity: "20.000000" },
          ACTOR,
        );

        await expect(service().update(panel.id, { baseUnit: "pcs" }, panel.version, ACTOR)).rejects.toMatchObject({
          code: "BASE_UNIT_IN_USE",
        });
      });

      it("locks the base unit while a forecast holds a quantity in it", async () => {
        const panel = await service().create(PANEL, ACTOR);
        await new ForecastService({ em: scopedEm("prod") }).create(
          { material: panel.id, location: "00000001", date: "2027-01-01", quantity: "20.000000" },
          ACTOR,
        );

        await expect(service().update(panel.id, { baseUnit: "pcs" }, panel.version, ACTOR)).rejects.toMatchObject({
          code: "BASE_UNIT_IN_USE",
        });
      });

      it("names conversions first when they and planning data both hold the base unit", async () => {
        const panel = await service().create(PANEL, ACTOR);
        await service().addConversion(panel.id, CASE, ACTOR);
        await new PlanningParameterService({ em: scopedEm("prod") }).create({ ...SET, material: panel.id }, ACTOR);

        await expect(service().update(panel.id, { baseUnit: "pcs" }, panel.version, ACTOR)).rejects.toMatchObject({
          code: "BASE_UNIT_HAS_CONVERSIONS",
        });
      });

      it("refuses to make a material raw while it is made at a location, until every set is Buy (R02)", async () => {
        const panel = await service().create(PANEL, ACTOR);
        const planning = new PlanningParameterService({ em: scopedEm("prod") });
        await planning.create({ ...SET, material: panel.id }, ACTOR);

        await expect(service().update(panel.id, { type: "raw" }, panel.version, ACTOR)).rejects.toMatchObject({
          code: "MATERIAL_MADE_AT_LOCATIONS",
          status: 409,
        });
        expect((await service().get(panel.id)).type).toBe("intermediate");

        await planning.update(panel.id, "00000001", { procurement: "buy" }, 1, ACTOR);
        await expect(service().update(panel.id, { type: "raw" }, panel.version, ACTOR)).resolves.toMatchObject({ type: "raw" });
      });

      it("names the BOM, not the Make sets, when a material made at a location and used by a BOM is made raw", async () => {
        const panel = await service().create(PANEL, ACTOR);
        const cabinet = await service().create({ type: "finished", description: "Cabinet", baseUnit: "each" }, ACTOR);
        await new PlanningParameterService({ em: scopedEm("prod") }).create({ ...SET, material: panel.id }, ACTOR);
        await new BomService({ em: scopedEm("prod") }).create(
          { output: cabinet.id, priority: 1, validFrom: "2027-01-01", validThrough: null, components: [{ material: panel.id, quantity: "4", unit: "each" }] },
          ACTOR,
        );

        // Setting every location to Buy wouldn't help: the BOM's lock is permanent.
        await expect(service().update(panel.id, { type: "raw" }, panel.version, ACTOR)).rejects.toMatchObject({
          code: "MATERIAL_TYPE_IN_USE",
          message: "BOM 00000001 uses this material, so its type can't change.",
        });
        expect((await service().get(panel.id)).type).toBe("intermediate");
      });
    });

    it("refuses a stale version and keeps the newer change (AUD-024, API-029)", async () => {
      const bolt = await service().create(BOLT, ACTOR);
      await service().update(bolt.id, { description: "Newer" }, 1, ACTOR);

      await expect(service().update(bolt.id, { description: "Older" }, 1, ACTOR)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
        message: VERSION_CONFLICT,
      });
      expect((await service().get(bolt.id)).description).toBe("Newer");
    });

    it("maps a change landing between the version check and the flush to VERSION_CONFLICT", async () => {
      const bolt = await service().create(BOLT, ACTOR);
      const em = spyableEm();
      vi.spyOn(em, "flush").mockRejectedValueOnce(new OptimisticLockError("The optimistic lock failed"));

      await expect(service("prod", em).update(bolt.id, { description: "x" }, 1, ACTOR)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
      });
    });

    it("passes other errors through", async () => {
      await expect(service().update("00000001", { description: "x" }, 1, ACTOR)).rejects.toMatchObject({
        code: "MATERIAL_NOT_FOUND",
      });
    });
  });

  describe("conversions", () => {
    it("adds one and records it (MAT-019 factor)", async () => {
      const bolt = await service().create(BOLT, ACTOR);

      expect(await service().addConversion(bolt.id, CASE, ACTOR)).toEqual({ ...CASE, inverse: "0.083333", version: 1 });
      expect(await entry("materials.material-conversion.created")).toMatchObject({
        action: "materials.material-conversion.created",
        subjectType: "MaterialConversion",
        subjectId: "00000001/case",
        subjectLabel: "00000001 case",
        before: null,
        after: { material: "00000001", unit: "case", numerator: "12", denominator: "1" },
      });
    });

    it("refuses the base unit itself, and a second conversion for the same unit", async () => {
      const bolt = await boltWithCase();

      await expect(service().addConversion(bolt.id, { ...CASE, unit: "each" }, ACTOR)).rejects.toMatchObject({
        code: "UNIT_IS_BASE_UNIT",
        status: 400,
      });
      await expect(service().addConversion(bolt.id, CASE, ACTOR)).rejects.toMatchObject({
        code: "CONVERSION_EXISTS",
        status: 409,
      });
    });

    it("keeps units that differ only by case apart (spec Q2)", async () => {
      const bolt = await service().create({ type: "raw", description: "Ore", baseUnit: "kg" }, ACTOR);

      await service().addConversion(bolt.id, { unit: "Mg", numerator: "1000", denominator: "1" }, ACTOR);
      await service().addConversion(bolt.id, { unit: "mg", numerator: "1", denominator: "1000000" }, ACTOR);

      expect((await service().get(bolt.id)).conversions.map(({ unit }) => unit)).toEqual(["Mg", "mg"]);
    });

    it("maps a racing duplicate that slips past the check to CONVERSION_EXISTS", async () => {
      const bolt = await boltWithCase();
      const em = spyableEm();
      vi.spyOn(em, "count").mockResolvedValueOnce(0);

      await expect(service("prod", em).addConversion(bolt.id, CASE, ACTOR)).rejects.toMatchObject({ code: "CONVERSION_EXISTS" });
    });

    it("passes other errors through when adding", async () => {
      await expect(service().addConversion("00000001", CASE, ACTOR)).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND" });
    });

    it("changes a factor at the loaded version, audits it, and converts with the new factor from then on", async () => {
      const bolt = await boltWithCase();

      const changed = await service().changeConversion(bolt.id, "case", { numerator: "10", denominator: "1" }, 1, ACTOR);

      expect(changed).toEqual({ unit: "case", numerator: "10", denominator: "1", inverse: "0.1", version: 2 });
      expect(await entry("materials.material-conversion.updated")).toMatchObject({
        action: "materials.material-conversion.updated",
        before: { numerator: "12" },
        after: { numerator: "10" },
      });
      await expect(service().toBaseQuantity(bolt.id, { quantity: "1", unit: "case" })).resolves.toMatchObject({
        baseQuantity: "10.000000",
      });
    });

    it("changes nothing for the same factor", async () => {
      const bolt = await boltWithCase();
      const entries = (await audit()).length;

      expect(await service().changeConversion(bolt.id, "case", { numerator: "12", denominator: "1" }, 1, ACTOR)).toMatchObject({
        version: 1,
      });
      expect(await audit()).toHaveLength(entries);
    });

    it("refuses a stale version or an unknown unit, keeping the old factor", async () => {
      const bolt = await boltWithCase();
      await service().changeConversion(bolt.id, "case", { numerator: "10", denominator: "1" }, 1, ACTOR);

      await expect(
        service().changeConversion(bolt.id, "case", { numerator: "6", denominator: "1" }, 1, ACTOR),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      await expect(service().changeConversion(bolt.id, "box", { numerator: "6", denominator: "1" }, 1, ACTOR)).rejects.toMatchObject({
        code: "CONVERSION_NOT_FOUND",
        status: 404,
        message: "Material 00000001 has no conversion for box.",
      });
      expect((await service().get(bolt.id)).conversions[0]).toMatchObject({ numerator: "10" });
    });

    it("removes one at the loaded version and records it", async () => {
      const bolt = await boltWithCase();

      expect(await service().removeConversion(bolt.id, "case", 1, ACTOR)).toEqual({ unit: "case" });
      expect((await service().get(bolt.id)).conversions).toEqual([]);
      expect(await entry("materials.material-conversion.removed")).toMatchObject({
        action: "materials.material-conversion.removed",
        before: { unit: "case", numerator: "12" },
        after: null,
      });
      await expect(service().removeConversion(bolt.id, "case", 1, ACTOR)).rejects.toMatchObject({
        code: "CONVERSION_NOT_FOUND",
      });
    });

    it("can't reach another tenant's conversion (TEN-014)", async () => {
      await boltWithCase();
      await service("test").create(BOLT, ACTOR);

      await expect(service("test").removeConversion("00000001", "case", 1, ACTOR)).rejects.toMatchObject({
        code: "CONVERSION_NOT_FOUND",
      });
    });
  });

  describe("toBaseQuantity (spec Q5)", () => {
    async function material(baseUnit: string, conversions: (typeof CASE)[]) {
      const created = await service().create({ type: "raw", description: "Thing", baseUnit }, ACTOR);
      for (const conversion of conversions) await service().addConversion(created.id, conversion, ACTOR);
      return created.id;
    }

    it("stores 2 cases at 1 case = 12 each as 24 each, keeping the entered unit and factor (MAT-019)", async () => {
      const id = await material("each", [CASE]);

      expect(await service().toBaseQuantity(id, { quantity: "2", unit: "case" })).toEqual({
        baseQuantity: "24.000000",
        enteredQuantity: "2",
        enteredUnit: "case",
        numerator: "12",
        denominator: "1",
      });
    });

    it("stores 0.25 tonne as 250 kg (MAT-020)", async () => {
      const id = await material("kg", [{ unit: "t", numerator: "1000", denominator: "1" }]);

      expect(await service().toBaseQuantity(id, { quantity: "0.25", unit: "t" })).toMatchObject({ baseQuantity: "250.000000" });
    });

    it("keeps a six-place quantity entered in the base unit exact, 1:1 (MAT-024)", async () => {
      const id = await material("kg", []);

      expect(await service().toBaseQuantity(id, { quantity: "0.123456", unit: "kg" })).toEqual({
        baseQuantity: "0.123456",
        enteredQuantity: "0.123456",
        enteredUnit: "kg",
        numerator: "1",
        denominator: "1",
      });
    });

    it("rounds 1 at 1/3 half-up once to 0.333333, and refuses what rounds to zero (MAT-032)", async () => {
      const id = await material("each", [{ unit: "third", numerator: "1", denominator: "3" }]);

      expect(await service().toBaseQuantity(id, { quantity: "1", unit: "third" })).toMatchObject({
        baseQuantity: "0.333333",
        numerator: "1",
        denominator: "3",
      });
      expect(await service().toBaseQuantity(id, { quantity: "0", unit: "third" })).toMatchObject({ baseQuantity: "0.000000" });
      await expect(service().toBaseQuantity(id, { quantity: "0.000001", unit: "third" })).rejects.toMatchObject({
        code: "QUANTITY_ROUNDS_TO_ZERO",
      });
    });

    it("never assumes 1:1 for a unit without a conversion (MAT-023)", async () => {
      const id = await material("each", [CASE]);

      await expect(service().toBaseQuantity(id, { quantity: "2", unit: "pallet" })).rejects.toMatchObject({
        code: "UNIT_NOT_CONVERTIBLE",
        message: "Material 00000001 has no conversion from pallet to its base unit each.",
      });
    });

    it("refuses a result too large to store, and a malformed quantity", async () => {
      const id = await material("g", [{ unit: "huge", numerator: "999999999999", denominator: "0.000001" }]);

      await expect(service().toBaseQuantity(id, { quantity: "1", unit: "huge" })).rejects.toMatchObject({
        code: "QUANTITY_OUT_OF_RANGE",
      });
      await expect(service().toBaseQuantity(id, { quantity: "-1", unit: "g" })).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { quantity: [expect.any(String)] },
      });
    });
  });

  describe("locks once a BOM references the material (BOMs spec Q9)", () => {
    /** Prod: a raw bolt with a case conversion, a finished cabinet, and BOM 00000001 making the cabinet from bolts. */
    async function cabinetFromBolts() {
      await boltWithCase();
      const cabinet = await service().create({ type: "finished", description: "Cabinet", baseUnit: "each" }, ACTOR);
      const bom = await new BomService({ em: scopedEm("prod") }).create(
        { output: cabinet.id, priority: 1, validFrom: "2027-01-01", validThrough: null, components: [{ material: "00000001", quantity: "1", unit: "case" }] },
        ACTOR,
      );
      return { cabinet: await service().get(cabinet.id), bolt: await service().get("00000001"), bom };
    }

    it("refuses a type change of an output or a component, even of an inactive BOM (MAT-011)", async () => {
      const { cabinet, bolt, bom } = await cabinetFromBolts();
      await new BomService({ em: scopedEm("prod") }).update(bom.id, { active: false }, bom.version, ACTOR);

      await expect(service().update(cabinet.id, { type: "intermediate" }, cabinet.version, ACTOR)).rejects.toMatchObject({
        code: "MATERIAL_TYPE_IN_USE",
        message: "BOM 00000001 uses this material, so its type can't change.",
      });
      await expect(service().update(bolt.id, { type: "intermediate" }, bolt.version, ACTOR)).rejects.toMatchObject({
        code: "MATERIAL_TYPE_IN_USE",
      });
    });

    it("refuses a component's base-unit change before the conversions check, which wouldn't help (MAT-030)", async () => {
      const { bolt } = await cabinetFromBolts();

      await expect(service().update(bolt.id, { baseUnit: "pcs" }, bolt.version, ACTOR)).rejects.toMatchObject({
        code: "BASE_UNIT_IN_USE",
        message: "BOM 00000001 uses this material, so its base unit can't change: BOM quantities are stored in it.",
      });
      expect((await service().get(bolt.id)).baseUnit).toBe("each");
    });

    it("refuses an output's base-unit change, though nothing else holds that unit (MAT-030)", async () => {
      const { cabinet } = await cabinetFromBolts();
      expect(cabinet.conversions).toEqual([]);

      await expect(service().update(cabinet.id, { baseUnit: "pcs" }, cabinet.version, ACTOR)).rejects.toMatchObject({
        code: "BASE_UNIT_IN_USE",
        message: "BOM 00000001 uses this material, so its base unit can't change: BOM quantities are stored in it.",
      });
      expect((await service().get(cabinet.id)).baseUnit).toBe("each");
    });

    it("locks a material used only in an old revision of an inactive BOM (MAT-011, MAT-030)", async () => {
      const { bom } = await cabinetFromBolts();
      const nut = await service().create({ type: "raw", description: "Nut M8", baseUnit: "each" }, ACTOR);
      const boms = () => new BomService({ em: scopedEm("prod") });
      const bolts = [{ material: "00000001", quantity: "1", unit: "case" }];
      // Revision 2 swaps the bolts for nuts, revision 3 swaps them back, then the BOM is deactivated.
      const withNuts = await boms().update(bom.id, { components: [{ material: nut.id, quantity: "8", unit: "each" }] }, bom.version, ACTOR);
      const withBolts = await boms().update(bom.id, { components: bolts }, withNuts.version, ACTOR);
      await boms().update(bom.id, { active: false }, withBolts.version, ACTOR);
      expect(await boms().get(bom.id)).toMatchObject({ active: false, revision: 3, components: [expect.objectContaining({ material: "00000001" })] });
      expect((await boms().getRevision(bom.id, 2)).components).toEqual([expect.objectContaining({ material: nut.id })]);

      await expect(service().update(nut.id, { type: "intermediate" }, nut.version, ACTOR)).rejects.toMatchObject({
        code: "MATERIAL_TYPE_IN_USE",
        message: "BOM 00000001 uses this material, so its type can't change.",
      });
      await expect(service().update(nut.id, { baseUnit: "pcs" }, nut.version, ACTOR)).rejects.toMatchObject({
        code: "BASE_UNIT_IN_USE",
        message: "BOM 00000001 uses this material, so its base unit can't change: BOM quantities are stored in it.",
      });
      expect(await service().get(nut.id)).toMatchObject({ type: "raw", baseUnit: "each", version: 1 });
    });

    it("still takes resent type and base unit values, a description and a deactivation", async () => {
      const { bolt } = await cabinetFromBolts();

      const updated = await service().update(bolt.id, { type: "raw", baseUnit: "each", description: "Bolt M8 zinc", active: false }, bolt.version, ACTOR);
      expect(updated).toMatchObject({ description: "Bolt M8 zinc", active: false });
    });

    it("lets an unused material change type and base unit (MAT-009, MAT-013)", async () => {
      await cabinetFromBolts();
      const spare = await service().create({ type: "raw", description: "Spare", baseUnit: "each" }, ACTOR);

      expect(await service().update(spare.id, { type: "intermediate", baseUnit: "kg" }, spare.version, ACTOR)).toMatchObject({
        type: "intermediate",
        baseUnit: "kg",
      });
    });
  });

  describe("listUnits", () => {
    it("lists each material's base unit, then its conversions' units in order, for this tenant only", async () => {
      await boltWithCase();
      const box = await service().create({ type: "raw", description: "Cardboard box", baseUnit: "each" }, ACTOR);
      await service().addConversion("00000001", { unit: "box", numerator: "100", denominator: "1" }, ACTOR);
      await service("test").create({ type: "raw", description: "Elsewhere", baseUnit: "kg" }, ACTOR);

      expect(await service().listUnits()).toEqual({ "00000001": ["each", "box", "case"], [box.id]: ["each"] });
    });
  });

  describe("seedDemo", () => {
    it("creates the demo materials with consecutive IDs in an empty tenant, unaudited, and nothing the second time", async () => {
      expect(await service("test").seedDemo()).toBe(DEMO_MATERIALS.length);
      expect(await service("test").seedDemo()).toBe(0);

      const materials = await service("test").list();
      expect(materials.map(({ id, description }) => `${id} ${description}`)).toEqual(
        DEMO_MATERIALS.map(({ description }, index) => `0000000${index + 1} ${description}`),
      );
      expect((await service("test").get("00000002")).conversions.map(({ unit }) => unit)).toEqual(["box", "case"]);
      expect(await audit("test")).toEqual([]);
      expect(await service("prod").list()).toEqual([]);
    });

    it("seeds the given rows with their conversions, each material created at `at`", async () => {
      const at = new Date("2026-10-01T06:00:00Z");
      const rows = [
        { type: "finished" as const, description: "Cabinet", baseUnit: "each", conversions: [CASE] },
        { type: "raw" as const, description: "Screw", baseUnit: "kg", conversions: [] },
      ];
      expect(await service("test").seedDemo(rows, at)).toBe(2);

      const materials = await scopedEm("test").find(Material, {}, { orderBy: { code: "asc" } });
      expect(materials.map(({ code, description, type, createdAt }) => [code, description, type, createdAt])).toEqual([
        ["00000001", "Cabinet", "finished", at],
        ["00000002", "Screw", "raw", at],
      ]);
      expect((await service("test").get("00000001")).conversions.map(({ unit }) => unit)).toEqual(["case"]);
      expect(await audit("test")).toEqual([]);
    });

    it("seeds nothing into a read-only tenant, read past the identity map (R05)", async () => {
      const em = scopedEm("test");
      await em.findOneOrFail(Tenant, { code: "test" });
      await orm.em.fork().nativeUpdate(Tenant, { code: "test" }, { readOnly: true });

      expect(await service("test", em).seedDemo()).toBe(0);
      expect(await service("test").list()).toEqual([]);

      await orm.em.fork().nativeUpdate(Tenant, { code: "test" }, { readOnly: false });
      expect(await service("test").seedDemo()).toBe(DEMO_MATERIALS.length);
    });
  });
});

describe("MaterialService behind tenantServerAction, as the pages call it", () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "cpg-material-race-"));
  const config = loadConfig({ DATA_DIR: dataDir });
  let other: Orm;

  beforeAll(async () => {
    await migrateDatabase(config);
    vi.stubEnv("DATA_DIR", dataDir);
    other = await initOrm(toDbOptions(config));
  });
  afterAll(async () => {
    await other.close();
    await (await getContainer()).cradle.orm.close();
    vi.unstubAllEnvs();
  });

  it("gives a page create racing an API create the next ID, by retrying the stale snapshot (spec Q6)", async () => {
    let raced = false;
    const create = tenantServerAction(z.object({}), async (_input, scope) => {
      // The transaction has read (the generation check, this list) before the other connection commits.
      await scope.cradle.materialService.list();
      if (!raced) {
        raced = true;
        const em = other.em.fork();
        selectTenant(em, "prod");
        await new MaterialService({ em }).create({ type: "raw", description: "From the API", baseUnit: "kg" }, ACTOR);
      }
      return scope.cradle.materialService.create({ type: "raw", description: "From the page", baseUnit: "kg" }, ACTOR);
    });

    await expect(create("prod", 1, {})).resolves.toMatchObject({ ok: true, data: { id: "00000002" } });

    const em = other.em.fork();
    selectTenant(em, "prod");
    const stored = await em.find(Material, {}, { orderBy: { code: "asc" } });
    expect(stored.map(({ code, description }) => `${code} ${description}`)).toEqual([
      "00000001 From the API",
      "00000002 From the page",
    ]);
    expect(await em.count(MaterialConversion, {})).toBe(0);
  });

  it("refuses changing an existing factor to a zero denominator, keeping the old factor and writing no audit (MAT-022)", async () => {
    const em = other.em.fork();
    selectTenant(em, "prod");
    const materials = new MaterialService({ em });
    const ore = await materials.create({ type: "raw", description: "Ore", baseUnit: "kg" }, ACTOR);
    await materials.addConversion(ore.id, { unit: "t", numerator: "1000", denominator: "1" }, ACTOR);
    const entries = await em.count(TenantAuditEvent, {});
    // The Change factor action's own composition: the schema parses before the service runs.
    const change = tenantServerAction(conversionChangeSchema, ({ materialId, unit, version, ...factor }, scope) =>
      scope.cradle.materialService.changeConversion(materialId, unit, factor, version, ACTOR),
    );

    await expect(change("prod", 1, { materialId: ore.id, unit: "t", numerator: "1000", denominator: "0", version: 1 })).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", fieldErrors: { denominator: [FACTOR_MESSAGE] } },
    });

    const check = other.em.fork();
    selectTenant(check, "prod");
    expect((await new MaterialService({ em: check }).get(ore.id)).conversions).toEqual([
      { unit: "t", numerator: "1000", denominator: "1", inverse: "0.001", version: 1 },
    ]);
    expect(await check.count(TenantAuditEvent, {})).toBe(entries);
  });
});
