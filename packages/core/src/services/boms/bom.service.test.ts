import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Bom,
  BomComponent,
  BomRevision,
  initOrm,
  Material,
  MaterialConversion,
  OptimisticLockError,
  selectTenant,
  Tenant,
  TenantAuditEvent,
  UniqueConstraintViolationException,
  type EntityManager,
  type MaterialType,
  type Orm,
  type TenantCode,
} from "@cpg/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { loadConfig } from "../../config";
import { getContainer } from "../../container/container";
import { migrateDatabase, toDbOptions } from "../../database";
import { tenantServerAction } from "../../http/tenant-server-action";
import {
  DUPLICATE_COMPONENT_MESSAGE,
  FINISHED_COMPONENT_MESSAGE,
  QUANTITY_OUT_OF_RANGE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  RAW_OUTPUT_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
  VALID_THROUGH_BEFORE_FROM_MESSAGE,
} from "../../validators/boms/bom-fields.schema";
import type { AuditActor } from "../audit/actor";
import { MaterialService } from "../materials/material.service";
import { BOM_ID_RACE, BomService, type ComponentLine, type NewBom } from "./bom.service";
import { FIXTURE_BOMS } from "../../../../../tests/setup/demo-fixtures";

/** Who the tests act as: the admin, on the UI. */
const ACTOR: AuditActor = { userId: "admin-id", username: "admin", sessionId: "admin-session", channel: "ui", token: null };

const line = (material: string, quantity: string, unit = "each"): ComponentLine => ({ material, quantity, unit });

/** The cabinet's recipe: 4 panels, 2 cases of bolts (24 each), a box; priority 1 from 2027-01-01, no end. */
const CABINET: NewBom = {
  output: "00000005",
  priority: 1,
  validFrom: "2027-01-01",
  validThrough: null,
  components: [line("00000004", "4"), line("00000002", "2", "case"), line("00000006", "1")],
};

/** A one-line recipe for `output`, made of `component`, priority 1 with no end. */
const simple = (output: string, component: string, overrides: Partial<NewBom> = {}): NewBom => ({
  output,
  priority: 1,
  validFrom: "2027-01-01",
  validThrough: null,
  components: [line(component, "1")],
  ...overrides,
});

async function freshOrm(dataDir = mkdtempSync(path.join(tmpdir(), "cpg-bom-service-"))): Promise<Orm> {
  const config = loadConfig({ DATA_DIR: dataDir });
  await migrateDatabase(config);
  return initOrm(toDbOptions(config));
}

/**
 * A tenant's materials for the tests, by ID: the demo cabinet's parts with their conversions, three
 * intermediates for cycles, and an inactive raw and finished material.
 */
async function seedMaterials(orm: Orm, tenant: TenantCode = "prod") {
  const em = orm.em.fork();
  selectTenant(em, tenant);
  const material = (code: string, type: MaterialType, description: string, baseUnit: string, active = true) =>
    em.create(Material, { code, type, description, baseUnit, active });
  const conversion = (target: Material, unit: string, numerator: string, denominator = "1") =>
    em.create(MaterialConversion, { material: target, unit, numerator, denominator });
  conversion(material("00000001", "raw", "Steel sheet 2 mm", "kg"), "t", "1000");
  const bolt = material("00000002", "raw", "Bolt M8", "each");
  conversion(bolt, "case", "12");
  conversion(bolt, "third", "1", "3");
  conversion(bolt, "huge", "999999999999", "0.000001");
  conversion(material("00000003", "raw", "Paint, red", "l"), "ml", "1", "1000");
  material("00000004", "intermediate", "Painted side panel", "each");
  material("00000005", "finished", "Cabinet, red", "each");
  material("00000006", "raw", "Cardboard box", "each");
  material("00000007", "raw", "Old rivet", "each", false);
  material("00000008", "intermediate", "Sub A", "each");
  material("00000009", "intermediate", "Sub B", "each");
  material("00000010", "intermediate", "Sub C", "each");
  material("00000011", "finished", "Old cabinet", "each", false);
  await em.flush();
}

describe("BomService", () => {
  let orm: Orm;

  const scopedEm = (tenant: TenantCode = "prod") => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const service = (tenant: TenantCode = "prod", em = scopedEm(tenant)) => new BomService({ em });
  const materials = (tenant: TenantCode = "prod") => new MaterialService({ em: scopedEm(tenant) });
  /** The tenant's audit entries with this action, oldest first. */
  const entries = async (action: string, tenant: TenantCode = "prod") =>
    (await scopedEm(tenant).find(TenantAuditEvent, { action }, { orderBy: { occurredAt: "asc", id: "asc" } })).map(
      ({ subjectId, subjectLabel, before, after }) => ({ subjectId, subjectLabel, before, after }),
    );
  /** Sets a material's active flag behind the services' backs, as a deactivation would. */
  const setActive = async (code: string, active: boolean) => {
    const em = scopedEm();
    (await em.findOneOrFail(Material, { code })).active = active;
    await em.flush();
  };

  beforeEach(async () => {
    orm = await freshOrm();
    await seedMaterials(orm);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await orm.close();
  });

  describe("create", () => {
    it("creates a finished BOM with revision 1, storing each line's base quantity and its entered unit and factor (BOM-001, BOM-005, MAT-019)", async () => {
      const bom = await service().create(CABINET, ACTOR);

      expect(bom).toEqual({
        id: "00000001",
        output: "00000005",
        active: true,
        revision: 1,
        priority: 1,
        validFrom: "2027-01-01",
        validThrough: null,
        components: [
          { material: "00000004", quantity: "4.000000", enteredQuantity: "4", enteredUnit: "each", numerator: "1", denominator: "1" },
          { material: "00000002", quantity: "24.000000", enteredQuantity: "2", enteredUnit: "case", numerator: "12", denominator: "1" },
          { material: "00000006", quantity: "1.000000", enteredQuantity: "1", enteredUnit: "each", numerator: "1", denominator: "1" },
        ],
        createdAt: expect.any(Date),
        version: 1,
        revisions: [{ number: 1, priority: 1, validFrom: "2027-01-01", validThrough: null, createdAt: expect.any(Date) }],
      });
      expect(await entries("boms.bom.created")).toEqual([
        {
          subjectId: "00000001",
          subjectLabel: "00000001 — 00000005 Cabinet, red",
          before: null,
          after: {
            id: "00000001",
            output: "00000005",
            active: true,
            revision: 1,
            priority: 1,
            validFrom: "2027-01-01",
            validThrough: null,
            components: "00000004 4.000000 each; 00000002 24.000000 each (2 case); 00000006 1.000000 each",
          },
        },
      ]);
    });

    it("creates an intermediate BOM from raw inputs, converting tonnes and millilitres (BOM-002, MAT-020, MAT-024)", async () => {
      const bom = await service().create(
        simple("00000004", "00000001", { components: [line("00000001", "0.25", "t"), line("00000003", "250", "ml"), line("00000006", "0.123456")] }),
        ACTOR,
      );

      expect(bom.components.map(({ material, quantity }) => [material, quantity])).toEqual([
        ["00000001", "250.000000"],
        ["00000003", "0.250000"],
        ["00000006", "0.123456"],
      ]);
    });

    it("rounds a 1/3 factor half-up once (MAT-032)", async () => {
      const bom = await service().create(simple("00000004", "00000002", { components: [line("00000002", "2", "third")] }), ACTOR);

      expect(bom.components[0]).toMatchObject({ quantity: "0.666667", enteredQuantity: "2", numerator: "1", denominator: "3" });
    });

    it("numbers BOMs per tenant: Test and Prod both start at 00000001 (TEN-012)", async () => {
      await seedMaterials(orm, "test");
      expect((await service().create(CABINET, ACTOR)).id).toBe("00000001");
      expect((await service().create(simple("00000004", "00000006"), ACTOR)).id).toBe("00000002");
      expect((await service("test").create(CABINET, ACTOR)).id).toBe("00000001");
    });

    it("refuses a raw output and a finished component next to their fields, storing nothing (BOM-003, BOM-004)", async () => {
      await expect(service().create(simple("00000001", "00000006"), ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { output: [RAW_OUTPUT_MESSAGE] },
      });
      await expect(
        service().create({ ...CABINET, components: [line("00000004", "4"), line("00000005", "1")] }, ACTOR),
      ).rejects.toMatchObject({ fieldErrors: { "components.1.material": [FINISHED_COMPONENT_MESSAGE] } });
      expect(await scopedEm().count(Bom, {})).toBe(0);
      expect(await scopedEm().count(BomRevision, {})).toBe(0);
    });

    it("puts every line's conversion error on that line, never assuming 1:1 (MAT-023, MAT-032)", async () => {
      const components = [line("00000002", "2", "pallet"), line("00000004", "1"), line("00000006", "0.000001", "each"), line("00000001", "1", "kg")];
      await expect(
        service().create({ ...CABINET, components: [...components.slice(0, 2), line("00000002", "0.000001", "third")] }, ACTOR),
      ).rejects.toMatchObject({ fieldErrors: { "components.0.unit": [UNIT_NOT_CONVERTIBLE_MESSAGE] } });
      await expect(
        service().create(simple("00000004", "00000002", { components: [line("00000002", "0.000001", "third"), line("00000006", "1", "box")] }), ACTOR),
      ).rejects.toMatchObject({
        fieldErrors: {
          "components.0.quantity": [QUANTITY_ROUNDS_TO_ZERO_MESSAGE],
          "components.1.unit": [UNIT_NOT_CONVERTIBLE_MESSAGE],
        },
      });
      await expect(
        service().create(simple("00000004", "00000002", { components: [line("00000002", "1", "huge")] }), ACTOR),
      ).rejects.toMatchObject({ fieldErrors: { "components.0.quantity": [QUANTITY_OUT_OF_RANGE_MESSAGE] } });
    });

    it("lets any other failure of a line's conversion through", async () => {
      const em = scopedEm();
      vi.spyOn(em, "transactional").mockImplementation(async (callback) => callback(em));
      const findOne = em.findOne.bind(em);
      vi.spyOn(em, "findOne").mockImplementation(async (entity, where, options) => {
        if (entity === MaterialConversion) throw new Error("disk on fire");
        return findOne(entity as never, where as never, options as never);
      });

      await expect(service("prod", em).create(CABINET, ACTOR)).rejects.toThrow("disk on fire");
    });

    it("refuses an unknown material, and an inactive output or component (MAT-029)", async () => {
      await expect(service().create(simple("00000005", "00000099"), ACTOR)).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND" });
      await expect(service().create(simple("00000011", "00000006"), ACTOR)).rejects.toMatchObject({ code: "MATERIAL_INACTIVE" });
      await expect(service().create(simple("00000005", "00000007"), ACTOR)).rejects.toMatchObject({ code: "MATERIAL_INACTIVE" });
      expect(await scopedEm().count(Bom, {})).toBe(0);
    });

    it("doesn't find a Prod-only material ID in Test, which has materials of its own, as output or component, writing nothing (TEN-014)", async () => {
      await seedMaterials(orm, "test");
      const prod = scopedEm();
      prod.create(Material, { code: "00000012", type: "intermediate", description: "Prod-only panel", baseUnit: "each" });
      await prod.flush();
      const [highestInTest] = await scopedEm("test").find(Material, {}, { orderBy: { code: "desc" }, limit: 1 });
      expect(highestInTest.code < "00000012").toBe(true);

      await expect(service("test").create(simple("00000012", "00000006"), ACTOR)).rejects.toMatchObject({
        code: "MATERIAL_NOT_FOUND",
        message: "There is no material 00000012 in this tenant.",
      });
      await expect(service("test").create(simple("00000004", "00000012"), ACTOR)).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND" });
      for (const tenant of ["test", "prod"] as const) {
        const em = scopedEm(tenant);
        expect([await em.count(Bom, {}), await em.count(BomRevision, {}), await em.count(TenantAuditEvent, {})]).toEqual([0, 0, 0]);
      }
    });

    it("keeps two alternatives for one output, each with its own ID and revision (BOM-008)", async () => {
      await service().create(CABINET, ACTOR);
      await service().create({ ...CABINET, priority: 2, components: [line("00000004", "4"), line("00000006", "1")] }, ACTOR);

      expect((await service().list()).map(({ id, output, priority, revision }) => [id, output, priority, revision])).toEqual([
        ["00000001", "00000005", 1, 1],
        ["00000002", "00000005", 2, 1],
      ]);
    });

    it("maps a unique-index clash that slipped past the retry to BOM_ID_RACE", async () => {
      const em = scopedEm();
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new UniqueConstraintViolationException(new Error("UNIQUE")));
      await expect(service("prod", em).create(CABINET, ACTOR)).rejects.toMatchObject({ code: "BOM_ID_RACE", message: BOM_ID_RACE });

      vi.spyOn(em, "transactional").mockRejectedValueOnce(new Error("other"));
      await expect(service("prod", em).create(CABINET, ACTOR)).rejects.toThrow("other");
    });

    it("refuses an ID past the eight-digit range", async () => {
      const em = scopedEm();
      const output = await em.findOneOrFail(Material, { code: "00000004" });
      em.create(Bom, { code: "99999999", output, revision: 1, active: false });
      await em.flush();

      await expect(service().create(CABINET, ACTOR)).rejects.toMatchObject({ code: "BOM_IDS_EXHAUSTED" });
    });
  });

  describe("priorities (spec Q7)", () => {
    it("refuses equal priority over partly or fully overlapping days, naming the other BOM (BOM-015, BOM-016)", async () => {
      await service().create({ ...CABINET, validThrough: "2027-03-31" }, ACTOR);

      await expect(service().create({ ...CABINET, validFrom: "2027-03-01", validThrough: "2027-05-31" }, ACTOR)).rejects.toMatchObject({
        code: "BOM_PRIORITY_CONFLICT",
        message: "Another active BOM for this output has the same priority on some of these days: BOM 00000001 (2027-03-01 – 2027-03-31).",
      });
      await expect(service().create({ ...CABINET, validThrough: "2027-03-31" }, ACTOR)).rejects.toMatchObject({
        code: "BOM_PRIORITY_CONFLICT",
      });
      await expect(service().create({ ...CABINET, validFrom: "2027-03-31" }, ACTOR)).rejects.toMatchObject({
        message: expect.stringContaining("BOM 00000001 (2027-03-31)."),
      });
    });

    it("names an open-ended overlap", async () => {
      await service().create(CABINET, ACTOR);
      await expect(service().create({ ...CABINET, validFrom: "2028-01-01" }, ACTOR)).rejects.toMatchObject({
        message: expect.stringContaining("BOM 00000001 (2028-01-01 – …)."),
      });
    });

    it("accepts equal priority in periods without a shared day, and other priorities (BOM-017)", async () => {
      await service().create({ ...CABINET, validThrough: "2027-01-31" }, ACTOR);
      await service().create({ ...CABINET, validFrom: "2027-02-01", validThrough: "2027-02-28" }, ACTOR);
      await service().create({ ...CABINET, priority: 2 }, ACTOR);

      expect(await scopedEm().count(Bom, {})).toBe(3);
    });

    it("refuses a validity edit that makes an overlap while the priority stays, writing nothing (BOM-018)", async () => {
      await service().create({ ...CABINET, validThrough: "2027-01-31" }, ACTOR);
      const second = await service().create({ ...CABINET, validFrom: "2027-02-01" }, ACTOR);

      await expect(service().update(second.id, { validFrom: "2027-01-15" }, second.version, ACTOR)).rejects.toMatchObject({
        code: "BOM_PRIORITY_CONFLICT",
      });
      expect((await service().get(second.id)).revisions).toHaveLength(1);
    });

    it("refuses a priority edit onto an overlapping active alternative's priority, writing nothing (BOM-019)", async () => {
      await service().create(CABINET, ACTOR);
      const second = await service().create({ ...CABINET, priority: 2, validFrom: "2027-06-01" }, ACTOR);

      await expect(service().update(second.id, { priority: 1 }, second.version, ACTOR)).rejects.toMatchObject({
        code: "BOM_PRIORITY_CONFLICT",
        message: expect.stringContaining(": BOM 00000001 (2027-06-01 – …)."),
      });
      expect(await service().get(second.id)).toMatchObject({ priority: 2, revision: 1, version: second.version, revisions: [expect.objectContaining({ number: 1 })] });
      expect(await entries("boms.bom.revised")).toEqual([]);
    });

    it("ignores inactive alternatives, and re-checks on reactivation, leaving the BOM inactive when it clashes (BOM-030)", async () => {
      const first = await service().create(CABINET, ACTOR);
      const off = await service().update(first.id, { active: false }, first.version, ACTOR);
      const second = await service().create(CABINET, ACTOR);

      await expect(service().update(first.id, { active: true }, off.version, ACTOR)).rejects.toMatchObject({
        code: "BOM_PRIORITY_CONFLICT",
        message: expect.stringContaining(": BOM 00000002 (2027-01-01 – …)."),
      });
      const still = await service().get(first.id);
      expect(still).toMatchObject({ active: false, revision: 1 });
      expect((await service().get(second.id)).revision).toBe(1);
    });

    it("checks a reactivation with the recipe change sent in the same request", async () => {
      const first = await service().create(CABINET, ACTOR);
      const off = await service().update(first.id, { active: false }, first.version, ACTOR);
      await service().create(CABINET, ACTOR);

      const back = await service().update(first.id, { active: true, priority: 3 }, off.version, ACTOR);
      expect(back).toMatchObject({ active: true, revision: 2, priority: 3 });
    });

    it("doesn't check a recipe change that leaves the BOM inactive", async () => {
      const first = await service().create(CABINET, ACTOR);
      await service().create({ ...CABINET, priority: 2 }, ACTOR);

      const off = await service().update(first.id, { active: false, priority: 2 }, first.version, ACTOR);
      expect(off).toMatchObject({ active: false, revision: 2, priority: 2 });
      const revised = await service().update(first.id, { validFrom: "2027-06-01" }, off.version, ACTOR);
      expect(revised).toMatchObject({ active: false, revision: 3 });
    });
  });

  describe("cycles (spec Q8)", () => {
    it("refuses an output listed as its own component (BOM-024)", async () => {
      await expect(service().create(simple("00000008", "00000008"), ACTOR)).rejects.toMatchObject({
        code: "BOM_CYCLE",
        message: "This recipe would make a cycle: 00000008 Sub A → 00000008 Sub A.",
      });
    });

    it("refuses an edit that closes A → B → C → A, with every step's BOM, writing nothing (BOM-025)", async () => {
      await service().create(simple("00000008", "00000009"), ACTOR);
      await service().create(simple("00000009", "00000010"), ACTOR);
      const c = await service().create(simple("00000010", "00000006"), ACTOR);

      await expect(service().update(c.id, { components: [line("00000008", "1")] }, c.version, ACTOR)).rejects.toMatchObject({
        code: "BOM_CYCLE",
        message:
          "This recipe would make a cycle: 00000010 Sub C →(BOM 00000003) 00000008 Sub A →(BOM 00000001) 00000009 Sub B →(BOM 00000002) 00000010 Sub C.",
      });
      expect(await service().get(c.id)).toMatchObject({ revision: 1, components: [expect.objectContaining({ material: "00000006" })] });
    });

    it("sees inactive BOMs, so a dormant cycle can't be made", async () => {
      const a = await service().create(simple("00000008", "00000009"), ACTOR);
      await service().update(a.id, { active: false }, a.version, ACTOR);

      await expect(service().create(simple("00000009", "00000008"), ACTOR)).rejects.toMatchObject({ code: "BOM_CYCLE" });
    });
  });

  describe("update and revisions", () => {
    it("adds revision 2 for a changed amount and keeps revision 1 readable, unchanged (BOM-020)", async () => {
      const bom = await service().create(CABINET, ACTOR);

      const revised = await service().update(
        bom.id,
        { components: [line("00000004", "4"), line("00000002", "2", "case"), line("00000006", "2")] },
        bom.version,
        ACTOR,
      );

      expect(revised).toMatchObject({ revision: 2, version: 2 });
      expect(revised.revisions.map(({ number }) => number)).toEqual([2, 1]);
      expect((await service().getRevision(bom.id, 1)).components.map(({ quantity }) => quantity)).toEqual([
        "4.000000",
        "24.000000",
        "1.000000",
      ]);
      expect(await service().getRevision(bom.id, 2)).toMatchObject({ bom: bom.id, number: 2, current: true });
      expect(await service().getRevision(bom.id, 1)).toMatchObject({ current: false, createdAt: expect.any(Date) });
      expect(await entries("boms.bom.revised")).toEqual([
        {
          subjectId: bom.id,
          subjectLabel: "00000001 — 00000005 Cabinet, red",
          before: expect.objectContaining({ revision: 1, components: expect.stringContaining("00000006 1.000000 each") }),
          after: expect.objectContaining({ revision: 2, components: expect.stringContaining("00000006 2.000000 each") }),
        },
      ]);
    });

    it("adds a revision for a valid-through change, and for removing the end (BOM-021)", async () => {
      const bom = await service().create(CABINET, ACTOR);

      const dated = await service().update(bom.id, { validThrough: "2027-12-31" }, bom.version, ACTOR);
      expect(dated).toMatchObject({ revision: 2, validThrough: "2027-12-31" });
      expect(await service().getRevision(bom.id, 1)).toMatchObject({ current: false, validFrom: "2027-01-01", validThrough: null });
      const open = await service().update(bom.id, { validThrough: null }, dated.version, ACTOR);
      expect(open).toMatchObject({ revision: 3, validThrough: null });
    });

    it("refuses an end before the start, checked against the current revision", async () => {
      const bom = await service().create(CABINET, ACTOR);

      await expect(service().update(bom.id, { validThrough: "2026-12-31" }, bom.version, ACTOR)).rejects.toMatchObject({
        fieldErrors: { validThrough: [VALID_THROUGH_BEFORE_FROM_MESSAGE] },
      });
    });

    it("adds no revision and records nothing for an identical, reordered or same-base-quantity save (BOM-023)", async () => {
      const bom = await service().create(CABINET, ACTOR);
      const [panel, bolts, box] = CABINET.components;

      for (const changes of [
        { priority: 1, validFrom: "2027-01-01", validThrough: null },
        { components: [box, panel, bolts] },
        { components: [panel, line("00000002", "24"), box] },
      ]) {
        expect(await service().update(bom.id, changes, bom.version, ACTOR)).toMatchObject({ revision: 1, version: 1 });
      }
      expect(await entries("boms.bom.revised")).toEqual([]);
    });

    it("keeps a resent line's stored quantity after its conversion changed, and converts a re-entered one anew (MAT-027, MAT-028)", async () => {
      const bom = await service().create(CABINET, ACTOR);
      await materials().changeConversion("00000002", "case", { numerator: "10", denominator: "1" }, 1, ACTOR);

      expect(await service().get(bom.id)).toMatchObject({ revision: 1, components: expect.arrayContaining([expect.objectContaining({ quantity: "24.000000" })]) });
      const same = await service().update(bom.id, { components: CABINET.components, priority: 1 }, bom.version, ACTOR);
      expect(same).toMatchObject({ revision: 1 });
      const reentered = await service().update(
        bom.id,
        { components: [line("00000004", "4"), line("00000002", "3", "case"), line("00000006", "1")] },
        bom.version,
        ACTOR,
      );
      expect(reentered.components[1]).toMatchObject({ quantity: "30.000000", enteredQuantity: "3", numerator: "10" });
    });

    it("treats a resent line's entered quantity as a number, so 2.0 case is still the stored 2 case (MAT-027)", async () => {
      const bom = await service().create(CABINET, ACTOR);
      await materials().changeConversion("00000002", "case", { numerator: "10", denominator: "1" }, 1, ACTOR);

      const [panel, , box] = CABINET.components;
      const same = await service().update(bom.id, { components: [panel, line("00000002", "2.0", "case"), box] }, bom.version, ACTOR);
      expect(same).toMatchObject({ revision: 1, components: expect.arrayContaining([expect.objectContaining({ quantity: "24.000000" })]) });
    });

    it("refuses a material repeated in the lines on its later line, for callers that skip the schemas (spec Q5)", async () => {
      const lines = [line("00000004", "4"), line("00000006", "1"), line("00000004", "2")];
      await expect(service().create({ ...CABINET, components: lines }, ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { "components.2.material": [DUPLICATE_COMPONENT_MESSAGE] },
      });
      const bom = await service().create(CABINET, ACTOR);
      await expect(service().update(bom.id, { components: lines }, bom.version, ACTOR)).rejects.toMatchObject({
        fieldErrors: { "components.2.material": [DUPLICATE_COMPONENT_MESSAGE] },
      });
    });

    it("keeps an inactive component already in the recipe, but refuses adding one (spec Q10)", async () => {
      await setActive("00000007", true);
      const bom = await service().create({ ...CABINET, components: [...CABINET.components, line("00000007", "8")] }, ACTOR);
      await setActive("00000007", false);

      const kept = await service().update(bom.id, { priority: 4 }, bom.version, ACTOR);
      expect(kept).toMatchObject({ revision: 2, components: expect.arrayContaining([expect.objectContaining({ material: "00000007" })]) });
      const reentered = await service().update(
        bom.id,
        { components: [...CABINET.components, line("00000007", "9")] },
        kept.version,
        ACTOR,
      );
      expect(reentered.components[3]).toMatchObject({ material: "00000007", quantity: "9.000000" });

      const other = await service().create(simple("00000004", "00000006"), ACTOR);
      await expect(
        service().update(other.id, { components: [line("00000006", "1"), line("00000007", "1")] }, other.version, ACTOR),
      ).rejects.toMatchObject({ code: "MATERIAL_INACTIVE" });
    });

    it("still revises and toggles a BOM whose output became inactive (spec Q10)", async () => {
      const bom = await service().create(CABINET, ACTOR);
      await setActive("00000005", false);

      const revised = await service().update(bom.id, { priority: 2 }, bom.version, ACTOR);
      const off = await service().update(bom.id, { active: false }, revised.version, ACTOR);
      expect(off).toMatchObject({ revision: 2, active: false });
    });

    it("refuses a finished component in an edit", async () => {
      const bom = await service().create(CABINET, ACTOR);
      await expect(service().update(bom.id, { components: [line("00000005", "1")] }, bom.version, ACTOR)).rejects.toMatchObject({
        fieldErrors: { "components.0.material": [FINISHED_COMPONENT_MESSAGE] },
      });
    });

    it("issues no update on a revision or a line when it adds a revision", async () => {
      const bom = await service().create(CABINET, ACTOR);

      // The triggers abort any update of a revision or a line, so a stray one would fail this save.
      await service().update(bom.id, { priority: 5 }, bom.version, ACTOR);
      expect(await scopedEm().count(BomRevision, {})).toBe(2);
      expect(await scopedEm().count(BomComponent, {})).toBe(6);
    });

    it("refuses a stale version, and an edit that lost the race at flush", async () => {
      const bom = await service().create(CABINET, ACTOR);
      await service().update(bom.id, { priority: 2 }, bom.version, ACTOR);

      await expect(service().update(bom.id, { priority: 3 }, bom.version, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

      const em = scopedEm();
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new OptimisticLockError("stale"));
      await expect(service("prod", em).update(bom.id, { priority: 3 }, 2, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new Error("other"));
      await expect(service("prod", em).update(bom.id, { priority: 3 }, 2, ACTOR)).rejects.toThrow("other");
    });

    it("maps a racing revision with the same number to VERSION_CONFLICT, writing nothing of its own", async () => {
      const bom = await service().create(CABINET, ACTOR);
      // Another edit's revision 2 lands after this edit read the BOM at revision 1, as a racing save would.
      const racer = scopedEm();
      racer.create(BomRevision, { bom: await racer.findOneOrFail(Bom, { code: bom.id }), number: 2, priority: 9, validFrom: "2027-01-01", validThrough: null });
      await racer.flush();

      await expect(service().update(bom.id, { priority: 3 }, bom.version, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      expect(await service().get(bom.id)).toMatchObject({ revision: 1, priority: 1, version: bom.version });
      expect(await scopedEm().count(BomRevision, { priority: 3 })).toBe(0);
      expect(await entries("boms.bom.revised")).toEqual([]);
    });

    it("finds no BOM by an unknown ID or from the other tenant, and no unknown revision (TEN-014)", async () => {
      const bom = await service().create(CABINET, ACTOR);

      await expect(service().get("00000099")).rejects.toMatchObject({ code: "BOM_NOT_FOUND" });
      await expect(service("test").get(bom.id)).rejects.toMatchObject({ code: "BOM_NOT_FOUND" });
      await expect(service().update("00000099", { active: false }, 1, ACTOR)).rejects.toMatchObject({ code: "BOM_NOT_FOUND" });
      await expect(service().getRevision(bom.id, 2)).rejects.toMatchObject({
        code: "BOM_REVISION_NOT_FOUND",
        message: "BOM 00000001 has no revision 2.",
      });
    });
  });

  describe("active flag (spec Q11)", () => {
    it("records deactivation and reactivation on their own, with no revision (BOM-022, BOM-029)", async () => {
      const bom = await service().create(CABINET, ACTOR);
      await service().update(bom.id, { components: [line("00000004", "5")] }, bom.version, ACTOR);

      const off = await service().update(bom.id, { active: false }, 2, ACTOR);
      const on = await service().update(bom.id, { active: true }, off.version, ACTOR);
      const same = await service().update(bom.id, { active: true }, on.version, ACTOR);

      expect([off.active, on.active, same.version]).toEqual([false, true, on.version]);
      expect(on.revisions.map(({ number }) => number)).toEqual([2, 1]);
      expect(await entries("boms.bom.deactivated")).toEqual([expect.objectContaining({ before: { active: true }, after: { active: false } })]);
      expect(await entries("boms.bom.reactivated")).toEqual([expect.objectContaining({ before: { active: false }, after: { active: true } })]);
    });
  });

  describe("list", () => {
    it("is empty in an empty tenant, and orders by output, priority, then ID", async () => {
      expect(await service().list()).toEqual([]);
      await service().create({ ...CABINET, priority: 2, validFrom: "2030-01-01", validThrough: "2030-01-31" }, ACTOR);
      await service().create(simple("00000004", "00000006"), ACTOR);
      await service().create(CABINET, ACTOR);
      await service().create({ ...CABINET, priority: 2, validThrough: "2027-12-31" }, ACTOR);

      expect((await service().list()).map(({ id }) => id)).toEqual(["00000002", "00000003", "00000001", "00000004"]);
    });
  });

  describe("seedDemo", () => {
    beforeEach(async () => {
      await scopedEm("test").nativeDelete(Material, {}).catch(() => null);
      await seedMaterials(orm, "test");
    });

    it("creates the demo BOMs once in Test, unaudited, with the converted lines (TEN-001, MAT-019)", async () => {
      expect(await service("test").seedDemo(FIXTURE_BOMS)).toBe(FIXTURE_BOMS.length);
      expect(await service("test").seedDemo(FIXTURE_BOMS)).toBe(0);

      const boms = await service("test").list();
      expect(boms.map(({ id, output, priority }) => [id, output, priority])).toEqual([
        ["00000001", "00000004", 1],
        ["00000002", "00000005", 1],
        ["00000003", "00000005", 2],
      ]);
      expect(boms[0].components.map(({ quantity }) => quantity)).toEqual(["4.500000", "0.250000"]);
      expect(boms[2].components[1]).toMatchObject({ quantity: "24.000000", enteredQuantity: "2", enteredUnit: "case" });
      expect(await scopedEm("test").count(TenantAuditEvent, {})).toBe(0);
      expect(await service().list()).toEqual([]);
    });

    // The demo BOMs, as [output, priority]: 00000004 (side panel) at 1, 00000005 (cabinet) at 1 and at 2 (bolts in cases).
    it.each<[string, (em: EntityManager) => Promise<unknown>, [string, string, number][]]>([
      [
        "the paint's ml conversion removed: skips the side panel's BOM",
        (em) => em.nativeDelete(MaterialConversion, { unit: "ml" }),
        [
          ["00000001", "00000005", 1],
          ["00000002", "00000005", 2],
        ],
      ],
      [
        "the bolt's case conversion removed: skips the second cabinet BOM only",
        (em) => em.nativeDelete(MaterialConversion, { unit: "case" }),
        [
          ["00000001", "00000004", 1],
          ["00000002", "00000005", 1],
        ],
      ],
      [
        "the side panel retyped raw: skips its own BOM, a raw output",
        (em) => em.nativeUpdate(Material, { code: "00000004" }, { type: "raw" }),
        [
          ["00000001", "00000005", 1],
          ["00000002", "00000005", 2],
        ],
      ],
      [
        "the side panel retyped finished: skips both cabinet BOMs, which use it as a component",
        (em) => em.nativeUpdate(Material, { code: "00000004" }, { type: "finished" }),
        [["00000001", "00000004", 1]],
      ],
      [
        "the cardboard box inactive: skips both cabinet BOMs",
        (em) => em.nativeUpdate(Material, { code: "00000006" }, { active: false }),
        [["00000001", "00000004", 1]],
      ],
      [
        "the steel sheet missing: skips the side panel's BOM",
        async (em) => {
          await em.nativeDelete(MaterialConversion, { unit: "t" });
          await em.nativeDelete(Material, { code: "00000001" });
        },
        [
          ["00000001", "00000005", 1],
          ["00000002", "00000005", 2],
        ],
      ],
    ])("skips a demo BOM that breaks a rule in an edited Test tenant, the next taking the next ID: %s", async (_case, edit, expected) => {
      await edit(scopedEm("test"));

      expect(await service("test").seedDemo(FIXTURE_BOMS)).toBe(expected.length);
      expect((await service("test").list()).map(({ id, output, priority }) => [id, output, priority])).toEqual(expected);
    });

    it("seeds the given rows, each BOM and its first revision created at `at`", async () => {
      const at = new Date("2026-10-01T06:00:00Z");
      const row = {
        output: "00000005", priority: 1, validFrom: "2026-02-01", validThrough: null,
        components: [{ material: "00000002", quantity: "16", unit: "each" }],
      };
      expect(await service("test").seedDemo([row], at)).toBe(1);

      const em = scopedEm("test");
      expect((await em.find(Bom, {})).map(({ createdAt }) => createdAt)).toEqual([at]);
      expect((await em.find(BomRevision, {})).map(({ createdAt }) => createdAt)).toEqual([at]);
      expect((await service("test").list()).map(({ id, output, components }) => [id, output, components.length])).toEqual([["00000001", "00000005", 1]]);
    });

    it("lets a failure that isn't a rule through", async () => {
      const em = scopedEm("test");
      vi.spyOn(em, "transactional")
        .mockImplementationOnce(async (callback) => callback(em))
        .mockRejectedValueOnce(new Error("disk full"));
      await expect(service("test", em).seedDemo(FIXTURE_BOMS)).rejects.toThrow("disk full");
    });

    it("seeds nothing into a read-only Test", async () => {
      const em = orm.em.fork();
      await em.nativeUpdate(Tenant, { code: "test" }, { readOnly: true });

      expect(await service("test").seedDemo(FIXTURE_BOMS)).toBe(0);
    });
  });
});

describe("BOMs under racing writes", () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "cpg-bom-race-"));
  let other: Orm;

  beforeAll(async () => {
    vi.stubEnv("DATA_DIR", dataDir);
    other = await freshOrm(dataDir);
    await seedMaterials(other);
  });
  afterAll(async () => {
    await other.close();
    await (await getContainer()).cradle.orm.close();
    vi.unstubAllEnvs();
  });

  const otherService = () => {
    const em = other.em.fork();
    selectTenant(em, "prod");
    return new BomService({ em });
  };

  /** A page action whose transaction reads, then lets the other connection write `race` once, then writes `input`. */
  const racingCreate = (race: () => Promise<unknown>, input: NewBom) => {
    let raced = false;
    return tenantServerAction(z.object({}), async (_input, scope) => {
      await scope.cradle.bomService.list();
      if (!raced) {
        raced = true;
        await race();
      }
      return scope.cradle.bomService.create(input, ACTOR);
    });
  };

  it("gives two racing creates consecutive IDs, retrying the stale snapshot", async () => {
    const create = racingCreate(() => otherService().create({ ...CABINET, priority: 7 }, ACTOR), { ...CABINET, priority: 8 });

    await expect(create("prod", 1, {})).resolves.toMatchObject({ ok: true, data: { id: "00000002", priority: 8 } });
  });

  it("refuses the later of two racing creates that clash on priority", async () => {
    const create = racingCreate(() => otherService().create({ ...CABINET, priority: 9 }, ACTOR), { ...CABINET, priority: 9 });

    await expect(create("prod", 1, {})).resolves.toMatchObject({ ok: false, error: { code: "BOM_PRIORITY_CONFLICT" } });
    expect((await otherService().list()).filter(({ priority }) => priority === 9)).toHaveLength(1);
  });
});
