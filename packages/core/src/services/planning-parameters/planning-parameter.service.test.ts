import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  initOrm,
  Location,
  Material,
  OptimisticLockError,
  PlanningParameterSet,
  selectTenant,
  TenantAuditEvent,
  type MaterialType,
  type Orm,
  type TenantCode,
} from "@cpg/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { loadConfig } from "../../config";
import { getContainer } from "../../container/container";
import { migrateDatabase, toDbOptions } from "../../database";
import { tenantServerAction } from "../../http/tenant-server-action";
import { RAW_MATERIAL_BUY_ONLY_MESSAGE } from "../../validators/planning-parameters/planning-parameter-fields.schema";
import type { AuditActor } from "../audit/actor";
import { hasPlanningParameters, isMadeAnywhere } from "./planning-parameter-usage";
import { PlanningParameterService, type NewPlanningParameters } from "./planning-parameter.service";

/** Who the tests act as: the admin, on the UI. */
const ACTOR: AuditActor = { userId: "admin-id", username: "admin", sessionId: "admin-session", channel: "ui", token: null };

/** A whole set as the validators hand it over: quantities already in the six-decimal form. */
const SET: NewPlanningParameters = {
  material: "00000002",
  location: "00000001",
  procurement: "make",
  leadTimeDays: 2,
  minimumQuantity: "50.000000",
  lotMultiple: "10.000000",
};

async function freshOrm(): Promise<Orm> {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-planning-parameters-")) });
  await migrateDatabase(config);
  return initOrm(toDbOptions(config));
}

/** Prod's masters for the tests: a raw and an intermediate material, two locations, inactive ones too. */
async function seedMasters(orm: Orm, tenant: TenantCode = "prod") {
  const em = orm.em.fork();
  selectTenant(em, tenant);
  const material = (code: string, type: MaterialType, description: string, active = true) =>
    em.create(Material, { code, type, description, baseUnit: "each", active });
  material("00000001", "raw", "Bolt M8");
  material("00000002", "intermediate", "Painted side panel");
  material("00000003", "finished", "Old cabinet", false);
  em.create(Location, { code: "00000001", name: "Main plant" });
  em.create(Location, { code: "00000002", name: "Contract packer" });
  em.create(Location, { code: "00000003", name: "Old quarry", active: false });
  await em.flush();
}

describe("PlanningParameterService", () => {
  let orm: Orm;
  const scopedEm = (tenant: TenantCode = "prod") => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const service = (tenant: TenantCode = "prod", em = scopedEm(tenant)) => new PlanningParameterService({ em });
  /** A Prod EntityManager whose transactions run on itself, so spies on it see the service's calls. */
  const spyableEm = () => {
    const em = scopedEm();
    vi.spyOn(em, "transactional").mockImplementation(async (callback) => callback(em));
    return em;
  };
  const audit = () => scopedEm().find(TenantAuditEvent, {}, { orderBy: { occurredAt: "asc", id: "asc" } });

  beforeEach(async () => {
    orm = await freshOrm();
    await seedMasters(orm);
  });

  describe("create", () => {
    it("stores a whole set for a material at a location, and audits it (MAT-016, AUD-001)", async () => {
      expect(await service().create(SET, ACTOR)).toEqual({ ...SET, version: 1 });
      expect(await audit()).toEqual([
        expect.objectContaining({
          action: "planning-parameters.planning-parameter-set.created",
          subjectType: "PlanningParameterSet",
          subjectId: "00000002/00000001",
          subjectLabel: "00000002 — Painted side panel at 00000001 — Main plant",
          before: null,
          after: { material: "00000002", location: "00000001", procurement: "make", leadTimeDays: 2, minimumQuantity: "50.000000", lotMultiple: "10.000000" },
          actorUsername: "admin",
          channel: "ui",
        }),
      ]);
    });

    it("lets an intermediate be made at one location and bought at another (MAT-015)", async () => {
      await service().create(SET, ACTOR);
      await service().create({ ...SET, location: "00000002", procurement: "buy", leadTimeDays: 5 }, ACTOR);

      expect((await service().list()).map(({ location, procurement, leadTimeDays }) => [location, procurement, leadTimeDays])).toEqual([
        ["00000001", "make", 2],
        ["00000002", "buy", 5],
      ]);
    });

    it("refuses Make for a raw material next to the Make/Buy field, storing nothing (MAT-014)", async () => {
      await expect(service().create({ ...SET, material: "00000001" }, ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { procurement: [RAW_MATERIAL_BUY_ONLY_MESSAGE] },
      });
      expect(await service().list()).toEqual([]);
      expect(await audit()).toEqual([]);

      await expect(service().create({ ...SET, material: "00000001", procurement: "buy" }, ACTOR)).resolves.toMatchObject({
        procurement: "buy",
      });
    });

    it("refuses a second set for the same material and location", async () => {
      await service().create(SET, ACTOR);

      await expect(service().create({ ...SET, procurement: "buy" }, ACTOR)).rejects.toMatchObject({
        code: "PLANNING_PARAMETERS_EXIST",
        status: 409,
        message: "Material 00000002 already has planning parameters at location 00000001.",
      });
    });

    it("maps a clash on the unique pair to the same error, writing nothing more", async () => {
      await service().create(SET, ACTOR);
      const em = spyableEm();
      // The existence check misses the set, as a stale read on another connection would.
      vi.spyOn(em, "count").mockResolvedValueOnce(0);

      await expect(service("prod", em).create(SET, ACTOR)).rejects.toMatchObject({ code: "PLANNING_PARAMETERS_EXIST" });
      expect(await service().list()).toHaveLength(1);
      expect(await audit()).toHaveLength(1);
    });

    it("refuses an inactive material or location for a new set (MAT-029, LFC-019)", async () => {
      await expect(service().create({ ...SET, material: "00000003" }, ACTOR)).rejects.toMatchObject({ code: "MATERIAL_INACTIVE" });
      await expect(service().create({ ...SET, location: "00000003" }, ACTOR)).rejects.toMatchObject({ code: "LOCATION_INACTIVE" });
      expect(await service().list()).toEqual([]);
    });

    it("doesn't find another tenant's material or location (TEN-014)", async () => {
      await expect(service("test").create(SET, ACTOR)).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND", status: 404 });
      await expect(service().create({ ...SET, location: "00000009" }, ACTOR)).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
    });
  });

  describe("list", () => {
    it("orders by material, then location, in any tenant only its own", async () => {
      await service().create({ ...SET, location: "00000002", procurement: "buy" }, ACTOR);
      await service().create({ ...SET, material: "00000001", location: "00000002", procurement: "buy" }, ACTOR);
      await service().create(SET, ACTOR);

      expect((await service().list()).map(({ material, location }) => `${material}@${location}`)).toEqual([
        "00000001@00000002",
        "00000002@00000001",
        "00000002@00000002",
      ]);
      expect(await service("test").list()).toEqual([]);
    });
  });

  describe("update", () => {
    beforeEach(async () => {
      await service().create(SET, ACTOR);
    });

    it("changes the values that differ, and audits only those before and after (AUD-002)", async () => {
      const changed = await service().update("00000002", "00000001", { leadTimeDays: 3, minimumQuantity: "50.000000" }, 1, ACTOR);

      expect(changed).toMatchObject({ leadTimeDays: 3, minimumQuantity: "50.000000", version: 2 });
      expect((await audit()).at(-1)).toMatchObject({
        action: "planning-parameters.planning-parameter-set.updated",
        before: { leadTimeDays: 2 },
        after: { leadTimeDays: 3 },
      });
    });

    it("writes and records nothing when no value differs", async () => {
      expect(await service().update("00000002", "00000001", { procurement: "make", leadTimeDays: 2 }, 1, ACTOR)).toMatchObject({ version: 1 });
      expect(await audit()).toHaveLength(1);
    });

    it("refuses Make once the material is raw, keeping the set (MAT-014)", async () => {
      await service().create({ ...SET, material: "00000001", procurement: "buy" }, ACTOR);

      await expect(service().update("00000001", "00000001", { procurement: "make" }, 1, ACTOR)).rejects.toMatchObject({
        fieldErrors: { procurement: [RAW_MATERIAL_BUY_ONLY_MESSAGE] },
      });
      await expect(service().update("00000001", "00000001", { leadTimeDays: 9 }, 1, ACTOR)).resolves.toMatchObject({
        procurement: "buy",
        leadTimeDays: 9,
      });
    });

    it("refuses a stale version (AUD-024, API-029)", async () => {
      await service().update("00000002", "00000001", { leadTimeDays: 3 }, 1, ACTOR);

      await expect(service().update("00000002", "00000001", { leadTimeDays: 4 }, 1, ACTOR)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
      });
    });

    it("maps a change landing between the version check and the flush to VERSION_CONFLICT", async () => {
      const em = spyableEm();
      vi.spyOn(em, "flush").mockRejectedValueOnce(new OptimisticLockError("The optimistic lock failed"));

      await expect(service("prod", em).update("00000002", "00000001", { leadTimeDays: 4 }, 1, ACTOR)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
      });
    });

    it("keeps an existing set editable after its location is deactivated (LFC-019)", async () => {
      const em = scopedEm();
      (await em.findOneOrFail(Location, { code: "00000001" })).active = false;
      await em.flush();

      await expect(service().update("00000002", "00000001", { lotMultiple: "5.000000" }, 1, ACTOR)).resolves.toMatchObject({
        lotMultiple: "5.000000",
      });
    });

    it("doesn't find a pair without a set, or a material another tenant has", async () => {
      await expect(service().update("00000002", "00000002", { leadTimeDays: 1 }, 1, ACTOR)).rejects.toMatchObject({
        code: "PLANNING_PARAMETERS_NOT_FOUND",
        status: 404,
        message: "Material 00000002 has no planning parameters at location 00000002.",
      });
      await expect(service("test").update("00000002", "00000001", { leadTimeDays: 1 }, 1, ACTOR)).rejects.toMatchObject({
        code: "MATERIAL_NOT_FOUND",
      });
    });
  });

  describe("remove", () => {
    it("removes a set at its version and audits what it held", async () => {
      await service().create(SET, ACTOR);

      await expect(service().remove("00000002", "00000001", 2, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      expect(await service().remove("00000002", "00000001", 1, ACTOR)).toEqual({ material: "00000002", location: "00000001" });
      expect(await service().list()).toEqual([]);
      expect((await audit()).at(-1)).toMatchObject({
        action: "planning-parameters.planning-parameter-set.removed",
        before: { material: "00000002", location: "00000001", procurement: "make" },
        after: null,
      });
    });
  });

  describe("usage checks for materials", () => {
    it("tell whether a material has sets, and whether it is made anywhere", async () => {
      const em = scopedEm();
      const [raw, intermediate] = await em.find(Material, { code: ["00000001", "00000002"] }, { orderBy: { code: "asc" } });
      expect([await hasPlanningParameters(em, intermediate), await isMadeAnywhere(em, intermediate)]).toEqual([false, false]);

      await service().create(SET, ACTOR);
      await service().create({ ...SET, material: "00000001", procurement: "buy" }, ACTOR);
      expect([await hasPlanningParameters(em, intermediate), await isMadeAnywhere(em, intermediate)]).toEqual([true, true]);
      expect([await hasPlanningParameters(em, raw), await isMadeAnywhere(em, raw)]).toEqual([true, false]);
      expect(await em.count(PlanningParameterSet, {})).toBe(2);
    });
  });
});

describe("planning parameters under racing writes", () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "cpg-planning-parameters-race-"));
  const config = loadConfig({ DATA_DIR: dataDir });
  let other: Orm;

  beforeAll(async () => {
    await migrateDatabase(config);
    vi.stubEnv("DATA_DIR", dataDir);
    other = await initOrm(toDbOptions(config));
    await seedMasters(other);
  });
  afterAll(async () => {
    await other.close();
    await (await getContainer()).cradle.orm.close();
    vi.unstubAllEnvs();
  });

  it("refuses a page create that raced an API create of the same pair, after retrying the stale snapshot", async () => {
    let raced = false;
    const create = tenantServerAction(z.object({}), async (_input, scope) => {
      // The transaction has read (the generation check, this list) before the other connection commits.
      await scope.cradle.planningParameterService.list();
      if (!raced) {
        raced = true;
        const em = other.em.fork();
        selectTenant(em, "prod");
        await new PlanningParameterService({ em }).create(SET, ACTOR);
      }
      return scope.cradle.planningParameterService.create({ ...SET, procurement: "buy" }, ACTOR);
    });

    await expect(create("prod", 1, {})).resolves.toMatchObject({ ok: false, error: { code: "PLANNING_PARAMETERS_EXIST" } });

    const em = other.em.fork();
    selectTenant(em, "prod");
    expect(await new PlanningParameterService({ em }).list()).toEqual([expect.objectContaining({ procurement: "make" })]);
  });
});
