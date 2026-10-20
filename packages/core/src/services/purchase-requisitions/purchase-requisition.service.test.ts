import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  initOrm,
  Location,
  Material,
  MaterialConversion,
  OptimisticLockError,
  PurchaseRequisition,
  selectTenant,
  Tenant,
  TenantAuditEvent,
  UniqueConstraintViolationException,
  type EntityManager,
  type Orm,
  type TenantCode,
} from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { DEMO_REQUISITIONS } from "../../domain/purchasing/demo-purchasing";
import { VERSION_CONFLICT } from "../../http/errors";
import {
  ENTERED_QUANTITY_MESSAGE,
} from "../materials/base-quantity";
import {
  QUANTITY_OUT_OF_RANGE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
} from "../../validators/boms/bom-fields.schema";
import type { AuditActor } from "../audit/actor";
import { PurchaseRequisitionService, REQUISITION_ID_RACE } from "./purchase-requisition.service";

/** Who the tests act as: a normal user, on the UI (any signed-in account may write). */
const ACTOR: AuditActor = { userId: "user-id", username: "alice", sessionId: "user-session", channel: "ui", token: null };

const NEW = { material: "00000001", location: "00000001", quantity: "100", unit: "kg", requiredDate: "2027-03-01" };

async function freshOrm(): Promise<Orm> {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-requisition-service-")) });
  await migrateDatabase(config);
  return initOrm(toDbOptions(config));
}

/** Materials (steel in kg with a tonne conversion, bolts in each, an inactive raw) and locations, in one tenant. */
async function seedMasters(orm: Orm, tenant: TenantCode = "prod") {
  const em = orm.em.fork();
  selectTenant(em, tenant);
  const steel = em.create(Material, { code: "00000001", type: "raw", description: "Steel sheet", baseUnit: "kg" });
  em.create(MaterialConversion, { material: steel, unit: "t", numerator: "1000", denominator: "1" });
  em.create(MaterialConversion, { material: steel, unit: "g", numerator: "1", denominator: "1000" });
  em.create(Material, { code: "00000002", type: "raw", description: "Bolt M8", baseUnit: "each" });
  em.create(Material, { code: "00000003", type: "raw", description: "Old rivet", baseUnit: "each", active: false });
  em.create(Location, { code: "00000001", name: "Main plant" });
  em.create(Location, { code: "00000002", name: "Old quarry", active: false });
  await em.flush();
}

describe("PurchaseRequisitionService", () => {
  let orm: Orm;
  const scopedEm = (tenant: TenantCode = "prod") => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const service = (tenant: TenantCode = "prod", em: EntityManager = scopedEm(tenant)) => new PurchaseRequisitionService({ em });
  const entries = async (action: string, tenant: TenantCode = "prod") =>
    (await scopedEm(tenant).find(TenantAuditEvent, { action }, { orderBy: { occurredAt: "asc", id: "asc" } })).map(
      ({ subjectId, subjectLabel, before, after }) => ({ subjectId, subjectLabel, before, after }),
    );

  beforeEach(async () => {
    orm = await freshOrm();
    await seedMasters(orm);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await orm.close();
  });

  describe("create", () => {
    it("saves an Open requisition with nothing converted, the quantity in the base unit and the next ID (LFC-001)", async () => {
      const first = await service().create(NEW, ACTOR);
      const second = await service().create({ ...NEW, quantity: "0.5", unit: "t" }, ACTOR);

      expect(first).toEqual({
        id: "00000001",
        material: "00000001",
        location: "00000001",
        quantity: "100.000000",
        enteredQuantity: "100",
        enteredUnit: "kg",
        numerator: "1",
        denominator: "1",
        requiredDate: "2027-03-01",
        converted: "0.000000",
        outstanding: "100.000000",
        status: "open",
        createdAt: expect.any(Date),
        version: 1,
      });
      expect(second).toMatchObject({ id: "00000002", quantity: "500.000000", enteredQuantity: "0.5", enteredUnit: "t", numerator: "1000" });
    });

    it("numbers each tenant on its own (R05)", async () => {
      await seedMasters(orm, "test");
      await service().create(NEW, ACTOR);

      expect((await service("test").create(NEW, ACTOR)).id).toBe("00000001");
      expect(await service("test").list()).toHaveLength(1);
    });

    it("records the create in the tenant's audit with the allowlisted fields (R08)", async () => {
      await service().create(NEW, ACTOR);

      expect(await entries("purchase-requisitions.purchase-requisition.created")).toEqual([
        {
          subjectId: "00000001",
          subjectLabel: "00000001 — 00000001 Steel sheet at 00000001",
          before: null,
          after: {
            id: "00000001",
            material: "00000001",
            location: "00000001",
            quantity: "100.000000",
            requiredDate: "2027-03-01",
            converted: "0.000000",
            status: "open",
          },
        },
      ]);
    });

    it("refuses an inactive or another tenant's material or location for a new requisition (MAT-029, LFC-019, TEN-014)", async () => {
      await expect(service().create({ ...NEW, material: "00000003" }, ACTOR)).rejects.toMatchObject({ code: "MATERIAL_INACTIVE", status: 409 });
      await expect(service().create({ ...NEW, location: "00000002" }, ACTOR)).rejects.toMatchObject({ code: "LOCATION_INACTIVE", status: 409 });
      await expect(service("test").create(NEW, ACTOR)).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND", status: 404 });
      expect(await service().list()).toEqual([]);
    });

    it("puts a refused conversion on the field it belongs to", async () => {
      await expect(service().create({ ...NEW, unit: "case" }, ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { unit: [UNIT_NOT_CONVERTIBLE_MESSAGE] },
      });
      await expect(service().create({ ...NEW, quantity: "0.0004", unit: "g" }, ACTOR)).rejects.toMatchObject({
        fieldErrors: { quantity: [QUANTITY_ROUNDS_TO_ZERO_MESSAGE] },
      });
      await expect(service().create({ ...NEW, quantity: "999999999999", unit: "t" }, ACTOR)).rejects.toMatchObject({
        fieldErrors: { quantity: [QUANTITY_OUT_OF_RANGE_MESSAGE] },
      });
      await expect(service().create({ ...NEW, quantity: "0.0000001" }, ACTOR)).rejects.toMatchObject({
        fieldErrors: { quantity: [ENTERED_QUANTITY_MESSAGE] },
      });
      expect(await service().list()).toEqual([]);
    });

    it("maps a clash on the unique ID to a conflict, and passes other errors through", async () => {
      const em = scopedEm();
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new UniqueConstraintViolationException(new Error("UNIQUE")));
      await expect(service("prod", em).create(NEW, ACTOR)).rejects.toMatchObject({ code: "REQUISITION_ID_RACE", message: REQUISITION_ID_RACE, status: 409 });

      const other = scopedEm();
      vi.spyOn(other, "transactional").mockRejectedValueOnce(new Error("boom"));
      await expect(service("prod", other).create(NEW, ACTOR)).rejects.toThrow("boom");
    });

    it("stops at the last eight-digit ID", async () => {
      const em = scopedEm();
      em.create(PurchaseRequisition, {
        code: "99999999",
        material: await em.findOneOrFail(Material, { code: "00000001" }),
        location: await em.findOneOrFail(Location, { code: "00000001" }),
        quantity: "1.000000",
        enteredQuantity: "1",
        enteredUnit: "kg",
        numerator: "1",
        denominator: "1",
        requiredDate: "2027-03-01",
        converted: "0.000000",
      });
      await em.flush();

      await expect(service().create(NEW, ACTOR)).rejects.toMatchObject({ code: "REQUISITION_IDS_EXHAUSTED", status: 409 });
    });
  });

  describe("list and get", () => {
    it("lists the tenant's requisitions by ID and gets one", async () => {
      await service().create(NEW, ACTOR);
      await service().create({ ...NEW, material: "00000002", unit: "each" }, ACTOR);
      await seedMasters(orm, "test");
      await service("test").create(NEW, ACTOR);

      expect((await service().list()).map(({ id, material }) => [id, material])).toEqual([
        ["00000001", "00000001"],
        ["00000002", "00000002"],
      ]);
      expect(await service().get("00000002")).toMatchObject({ id: "00000002", material: "00000002" });
    });

    it("doesn't find an unknown ID, or another tenant's requisition (TEN-014)", async () => {
      await service().create(NEW, ACTOR);

      await expect(service().get("00000009")).rejects.toMatchObject({ code: "REQUISITION_NOT_FOUND", status: 404 });
      await expect(service("test").get("00000001")).rejects.toMatchObject({ code: "REQUISITION_NOT_FOUND" });
    });
  });

  describe("setRequiredDate", () => {
    it("changes the date at the loaded version and audits it (spec Q8)", async () => {
      const requisition = await service().create(NEW, ACTOR);

      const changed = await service().setRequiredDate(requisition.id, "2027-04-01", requisition.version, ACTOR);

      expect(changed).toMatchObject({ requiredDate: "2027-04-01", version: 2 });
      expect(await entries("purchase-requisitions.purchase-requisition.updated")).toEqual([
        {
          subjectId: "00000001",
          subjectLabel: "00000001 — 00000001 Steel sheet at 00000001",
          before: { requiredDate: "2027-03-01" },
          after: { requiredDate: "2027-04-01" },
        },
      ]);
    });

    it("writes and records nothing for the same date", async () => {
      const requisition = await service().create(NEW, ACTOR);

      const same = await service().setRequiredDate(requisition.id, "2027-03-01", requisition.version, ACTOR);

      expect(same.version).toBe(1);
      expect(await entries("purchase-requisitions.purchase-requisition.updated")).toEqual([]);
    });

    it("refuses a stale version and keeps the newer change (AUD-025, API-029)", async () => {
      const requisition = await service().create(NEW, ACTOR);
      await service().setRequiredDate(requisition.id, "2027-04-01", 1, ACTOR);

      await expect(service().setRequiredDate(requisition.id, "2027-05-01", 1, ACTOR)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
        message: VERSION_CONFLICT,
        status: 409,
      });
      expect((await service().get(requisition.id)).requiredDate).toBe("2027-04-01");
    });

    it("maps a change landing between the version check and the flush to VERSION_CONFLICT, and passes other errors through", async () => {
      const requisition = await service().create(NEW, ACTOR);
      const em = scopedEm();
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new OptimisticLockError("stale"));
      await expect(service("prod", em).setRequiredDate(requisition.id, "2027-04-01", 1, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

      const other = scopedEm();
      vi.spyOn(other, "transactional").mockRejectedValueOnce(new Error("boom"));
      await expect(service("prod", other).setRequiredDate(requisition.id, "2027-04-01", 1, ACTOR)).rejects.toThrow("boom");
    });

    it("can't reach another tenant's requisition (TEN-014)", async () => {
      await service().create(NEW, ACTOR);

      await expect(service("test").setRequiredDate("00000001", "2027-04-01", 1, ACTOR)).rejects.toMatchObject({ code: "REQUISITION_NOT_FOUND" });
    });
  });

  describe("seedDemo", () => {
    async function seedDemoMasters() {
      const em = scopedEm("test");
      em.create(Material, { code: "00000001", type: "raw", description: "Steel sheet", baseUnit: "kg" });
      const bolt = em.create(Material, { code: "00000002", type: "raw", description: "Bolt M8", baseUnit: "each" });
      em.create(MaterialConversion, { material: bolt, unit: "case", numerator: "12", denominator: "1" });
      em.create(Location, { code: "00000001", name: "Main plant" });
      await em.flush();
    }

    it("creates the demo requisitions in an empty tenant, unaudited, and nothing the second time", async () => {
      await seedDemoMasters();

      expect(await service("test").seedDemo()).toBe(DEMO_REQUISITIONS.length);
      expect(await service("test").seedDemo()).toBe(0);
      expect((await service("test").list()).map(({ id, quantity }) => [id, quantity])).toEqual([
        ["00000001", "100.000000"],
        ["00000002", "60.000000"],
      ]);
      expect(await entries("purchase-requisitions.purchase-requisition.created", "test")).toEqual([]);
    });

    it("skips an entry whose material is missing and gives the next the next ID", async () => {
      const em = scopedEm("test");
      const bolt = em.create(Material, { code: "00000002", type: "raw", description: "Bolt M8", baseUnit: "each" });
      em.create(MaterialConversion, { material: bolt, unit: "case", numerator: "12", denominator: "1" });
      em.create(Location, { code: "00000001", name: "Main plant" });
      await em.flush();

      expect(await service("test").seedDemo()).toBe(1);
      expect((await service("test").list()).map(({ id, material }) => [id, material])).toEqual([["00000001", "00000002"]]);
    });

    it("lets a failure that isn't a rule through", async () => {
      await seedDemoMasters();
      const em = scopedEm("test");
      vi.spyOn(em, "transactional")
        .mockImplementationOnce(async (callback) => callback(em))
        .mockRejectedValueOnce(new Error("disk full"));
      await expect(service("test", em).seedDemo()).rejects.toThrow("disk full");
    });

    it("seeds nothing into a read-only Test (R05)", async () => {
      await seedDemoMasters();
      await orm.em.fork().nativeUpdate(Tenant, { code: "test" }, { readOnly: true });

      expect(await service("test").seedDemo()).toBe(0);
    });
  });
});
