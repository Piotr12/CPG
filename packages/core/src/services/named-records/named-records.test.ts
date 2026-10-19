import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, Location, OptimisticLockError, selectTenant, TenantAuditEvent, type Orm, type TenantCode } from "@cpg/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { loadConfig } from "../../config";
import { getContainer } from "../../container/container";
import { migrateDatabase, toDbOptions } from "../../database";
import { DEMO_CUSTOMERS } from "../../domain/customers/demo-customers";
import { DEMO_LOCATIONS } from "../../domain/locations/demo-locations";
import { DEMO_SUPPLIERS } from "../../domain/suppliers/demo-suppliers";
import { VERSION_CONFLICT } from "../../http/errors";
import { tenantServerAction } from "../../http/tenant-server-action";
import type { AuditActor } from "../audit/actor";
import { CustomerService } from "../customers/customer.service";
import { LocationService } from "../locations/location.service";
import { SupplierService } from "../suppliers/supplier.service";

/** Who the tests act as: the admin, on the UI. */
const ACTOR: AuditActor = { userId: "admin-id", username: "admin", sessionId: "admin-session", channel: "ui", token: null };

/** Each kind, with what differs: its service, audit names, error-code prefix and demo list. */
const KINDS = [
  { Service: LocationService, subjectType: "Location", prefix: "locations.location", code: "LOCATION", noun: "location", demo: DEMO_LOCATIONS },
  { Service: CustomerService, subjectType: "Customer", prefix: "customers.customer", code: "CUSTOMER", noun: "customer", demo: DEMO_CUSTOMERS },
  { Service: SupplierService, subjectType: "Supplier", prefix: "suppliers.supplier", code: "SUPPLIER", noun: "supplier", demo: DEMO_SUPPLIERS },
] as const;

/** A fresh, migrated database: audit entries can't be deleted, so each test starts empty. */
async function freshOrm(): Promise<Orm> {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-named-records-")) });
  await migrateDatabase(config);
  return initOrm(toDbOptions(config));
}

describe.each(KINDS)("$Service.name", ({ Service, subjectType, prefix, code, noun, demo }) => {
  let orm: Orm;

  /** An EntityManager scoped to one tenant, as tenantScope() builds it. */
  const scopedEm = (tenant: TenantCode) => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const service = (tenant: TenantCode = "prod", em = scopedEm(tenant)) => new Service({ em });
  /** A Prod EntityManager whose transactions run on itself, so spies on it see the service's calls. */
  const spyableEm = () => {
    const em = scopedEm("prod");
    vi.spyOn(em, "transactional").mockImplementation(async (callback) => callback(em));
    return em;
  };
  const audit = (tenant: TenantCode = "prod") =>
    scopedEm(tenant).find(TenantAuditEvent, {}, { orderBy: { occurredAt: "asc", id: "asc" } });
  /** The newest Prod entry with this action; same-millisecond entries sort by their random id. */
  const entry = async (action: string) => (await audit()).filter((event) => event.action === action).at(-1);

  beforeEach(async () => {
    orm = await freshOrm();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await orm.close();
  });

  describe("create", () => {
    it("gives the first record of an empty tenant 00000001 and the next 00000002 (spec Q2)", async () => {
      const first = await service().create({ name: "First" }, ACTOR);
      const second = await service().create({ name: "Second" }, ACTOR);

      expect(first).toEqual({ id: "00000001", name: "First", active: true, createdAt: expect.any(Date), version: 1 });
      expect(second.id).toBe("00000002");
    });

    it("numbers each tenant on its own: Test and Prod both have 00000001, as different records (TEN-012)", async () => {
      await service("test").create({ name: "Test one" }, ACTOR);
      await service("test").create({ name: "Test two" }, ACTOR);

      expect((await service("prod").create({ name: "Prod one" }, ACTOR)).id).toBe("00000001");
      expect((await service("test").get("00000001")).name).toBe("Test one");
      expect((await service("prod").get("00000001")).name).toBe("Prod one");
    });

    it("records the create with its values in the tenant's audit (AUD-001)", async () => {
      await service().create({ name: "First" }, ACTOR);

      expect(await audit()).toEqual([
        expect.objectContaining({
          action: `${prefix}.created`,
          subjectType,
          subjectId: "00000001",
          subjectLabel: "00000001 — First",
          before: null,
          after: { id: "00000001", name: "First", active: true },
          actorUsername: "admin",
          channel: "ui",
        }),
      ]);
      expect(await audit("test")).toEqual([]);
    });

    it("maps a clash on the unique ID to CONFLICT, writing nothing", async () => {
      await service().create({ name: "First" }, ACTOR);
      const em = spyableEm();
      // The highest-ID read misses the existing record, as a stale read on another connection would.
      vi.spyOn(em, "find").mockResolvedValueOnce([]);

      await expect(service("prod", em).create({ name: "Clash" }, ACTOR)).rejects.toMatchObject({
        code: "CONFLICT",
        message: `Another ${noun} was created at the same moment. Try again.`,
      });
      expect(await service().list()).toHaveLength(1);
      expect(await audit()).toHaveLength(1);
    });

    it("passes other errors through", async () => {
      const em = spyableEm();
      vi.spyOn(em, "flush").mockRejectedValueOnce(new Error("disk full"));

      await expect(service("prod", em).create({ name: "x" }, ACTOR)).rejects.toThrow("disk full");
    });

    it("refuses to go past the last eight-digit ID with the kind's own code", async () => {
      const em = spyableEm();
      vi.spyOn(em, "find").mockResolvedValueOnce([{ code: "99999999" }] as never);

      await expect(service("prod", em).create({ name: "x" }, ACTOR)).rejects.toMatchObject({
        code: `${code}_IDS_EXHAUSTED`,
        status: 409,
      });
    });
  });

  describe("list and get", () => {
    it("lists by ID, inactive records included", async () => {
      await service().create({ name: "B" }, ACTOR);
      await service().create({ name: "A" }, ACTOR);
      await service().update("00000001", { active: false }, 1, ACTOR);

      expect((await service().list()).map(({ id, name, active }) => [id, name, active])).toEqual([
        ["00000001", "B", false],
        ["00000002", "A", true],
      ]);
    });

    it("doesn't find an unknown or malformed ID, or another tenant's (TEN-014)", async () => {
      await service("prod").create({ name: "Prod only" }, ACTOR);

      for (const id of ["00000001", "00000002", "1"]) {
        await expect(service("test").get(id)).rejects.toMatchObject({
          code: `${code}_NOT_FOUND`,
          status: 404,
          message: `There is no ${noun} ${id} in this tenant.`,
        });
      }
    });
  });

  describe("update", () => {
    it("renames and records the name before and after (AUD-002)", async () => {
      await service().create({ name: "Old" }, ACTOR);

      expect(await service().update("00000001", { name: "New" }, 1, ACTOR)).toMatchObject({ name: "New", version: 2 });
      expect(await entry(`${prefix}.updated`)).toMatchObject({
        subjectLabel: "00000001 — New",
        before: { name: "Old" },
        after: { name: "New" },
      });
    });

    it("deactivates and reactivates as their own audited actions (AUD-003, LFC-019)", async () => {
      await service().create({ name: "Site" }, ACTOR);

      expect(await service().update("00000001", { active: false }, 1, ACTOR)).toMatchObject({ active: false, version: 2 });
      expect(await service().update("00000001", { active: true }, 2, ACTOR)).toMatchObject({ active: true, version: 3 });

      expect(await entry(`${prefix}.deactivated`)).toMatchObject({ before: { active: true }, after: { active: false } });
      expect(await entry(`${prefix}.reactivated`)).toMatchObject({ before: { active: false }, after: { active: true } });
    });

    it("records a rename and a deactivation in one request as two entries", async () => {
      await service().create({ name: "Site" }, ACTOR);

      await service().update("00000001", { name: "Old site", active: false }, 1, ACTOR);

      expect((await audit()).slice(1).map(({ action }) => action).sort()).toEqual([`${prefix}.deactivated`, `${prefix}.updated`]);
    });

    it("trims names itself, whatever the caller sent, so surrounding spaces are no rename", async () => {
      expect((await service().create({ name: "  Site  " }, ACTOR)).name).toBe("Site");

      const same = await service().update("00000001", { name: " Site " }, 1, ACTOR);

      expect(same).toMatchObject({ name: "Site", version: 1 });
      expect(await audit()).toHaveLength(1);
    });

    it("writes and records nothing when no value differs", async () => {
      await service().create({ name: "Site" }, ACTOR);

      const same = await service().update("00000001", { name: "Site", active: true }, 1, ACTOR);

      expect(same.version).toBe(1);
      expect(await audit()).toHaveLength(1);
    });

    it("refuses a stale version and keeps the newer change (AUD-024, API-029)", async () => {
      await service().create({ name: "Site" }, ACTOR);
      await service().update("00000001", { name: "Newer" }, 1, ACTOR);

      await expect(service().update("00000001", { name: "Older" }, 1, ACTOR)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
        message: VERSION_CONFLICT,
      });
      expect((await service().get("00000001")).name).toBe("Newer");
    });

    it("maps a change landing between the version check and the flush to VERSION_CONFLICT", async () => {
      await service().create({ name: "Site" }, ACTOR);
      const em = spyableEm();
      vi.spyOn(em, "flush").mockRejectedValueOnce(new OptimisticLockError("The optimistic lock failed"));

      await expect(service("prod", em).update("00000001", { name: "x" }, 1, ACTOR)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
      });
    });

    it("refuses another tenant's record, changing nothing (TEN-014)", async () => {
      await service("prod").create({ name: "Prod only" }, ACTOR);

      await expect(service("test").update("00000001", { active: false }, 1, ACTOR)).rejects.toMatchObject({
        code: `${code}_NOT_FOUND`,
      });
      expect((await service("prod").get("00000001")).active).toBe(true);
    });
  });

  describe("seedDemo", () => {
    it("creates the demo records with consecutive IDs in an empty tenant, unaudited, and nothing the second time", async () => {
      expect(await service("test").seedDemo()).toBe(demo.length);
      expect(await service("test").seedDemo()).toBe(0);

      expect((await service("test").list()).map(({ id, name }) => `${id} ${name}`)).toEqual(
        demo.map((name, index) => `0000000${index + 1} ${name}`),
      );
      expect(await audit("test")).toEqual([]);
      expect(await service("prod").list()).toEqual([]);
    });
  });
});

describe("named records under racing writes", () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "cpg-named-records-race-"));
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

  it("gives a page create racing an API create the next ID, by retrying the stale snapshot", async () => {
    let raced = false;
    const create = tenantServerAction(z.object({}), async (_input, scope) => {
      // The transaction has read (the generation check, this list) before the other connection commits.
      await scope.cradle.locationService.list();
      if (!raced) {
        raced = true;
        const em = other.em.fork();
        selectTenant(em, "prod");
        await new LocationService({ em }).create({ name: "From the API" }, ACTOR);
      }
      return scope.cradle.locationService.create({ name: "From the page" }, ACTOR);
    });

    await expect(create("prod", 1, {})).resolves.toMatchObject({ ok: true, data: { id: "00000002" } });

    const em = other.em.fork();
    selectTenant(em, "prod");
    const stored = await em.find(Location, {}, { orderBy: { code: "asc" } });
    expect(stored.map(({ code, name }) => `${code} ${name}`)).toEqual(["00000001 From the API", "00000002 From the page"]);
  });
});
