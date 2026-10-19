import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { entities, Setting, Tenant, User, type TenantCode } from "../entities";
import { TENANT_FILTER, tenantOwned, TenantViolationError, useTenant } from "../entities/tenants/tenant-owned";
import { initOrm, migrate, type Orm } from "../orm";
import { TenantEntityManager } from "./tenant-entity-manager";

// Fixture tenant-owned entities: the real enforcement (filter, guard, EntityManager) runs against
// them exactly as it will against materials, BOMs and documents in later stories.
const parentOwned = tenantOwned();
const FixtureParent = defineEntity({
  name: "FixtureParent",
  filters: parentOwned.filters,
  properties: {
    id: p.integer().primary().autoincrement(),
    tenant: parentOwned.tenant,
    name: p.string(),
    children: () => p.oneToMany(FixtureChild).mappedBy("parent"),
  },
});
type FixtureParent = InferEntity<typeof FixtureParent>;

const childOwned = tenantOwned();
const FixtureChild = defineEntity({
  name: "FixtureChild",
  filters: childOwned.filters,
  properties: {
    id: p.integer().primary().autoincrement(),
    tenant: childOwned.tenant,
    name: p.string(),
    parent: () => p.manyToOne(FixtureParent).nullable(),
    owner: () => p.manyToOne(User).nullable(),
    tags: () => p.manyToMany(FixtureParent),
    watchers: () => p.manyToMany(User),
  },
});

// A global fixture holding collections of a tenant-owned and of a global entity.
const FixtureBoard = defineEntity({
  name: "FixtureBoard",
  properties: {
    id: p.integer().primary().autoincrement(),
    pins: () => p.manyToMany(FixtureParent),
    members: () => p.manyToMany(User),
  },
});

const fixtures = [FixtureParent, FixtureChild, FixtureBoard];

describe("tenant isolation", () => {
  const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-tenancy-")), "cpg.sqlite");
  let orm: Orm;

  /** A request-like EntityManager, scoped to a tenant or (without one) global. */
  const scope = (code?: TenantCode) => {
    const em = orm.em.fork();
    if (code) useTenant(em, code);
    return em;
  };
  const execute = (sql: string) => orm.em.getConnection().execute(sql);
  const parentNames = async (code: TenantCode) =>
    (await scope(code).find(FixtureParent, {}, { orderBy: { id: "asc" } })).map(({ name }) => name);
  const rawCount = async (table: string) =>
    (await execute(`select count(*) as n from ${table}`))[0].n as number;

  beforeAll(async () => {
    await migrate({ databasePath });
    orm = await initOrm({ databasePath }, { entities: [...entities, ...fixtures] });
    await orm.schema.update();
  });
  afterAll(() => orm.close());

  beforeEach(async () => {
    await execute("delete from fixture_board_pins");
    await execute("delete from fixture_board_members");
    await execute("delete from fixture_board");
    await execute("delete from fixture_child_tags");
    await execute("delete from fixture_child_watchers");
    await execute("delete from fixture_child");
    await execute("delete from fixture_parent");
    await execute("delete from user");
  });

  /** Creates one parent per tenant through the normal path and returns their ids. */
  const seedParents = async () => {
    const test = scope("test").create(FixtureParent, { name: "test parent" });
    await scope("test").persist(test).flush();
    const prodEm = scope("prod");
    const prod = prodEm.create(FixtureParent, { name: "prod parent" });
    await prodEm.flush();
    return { testId: test.id, prodId: prod.id };
  };

  describe("the EntityManager", () => {
    it("is a TenantEntityManager on every fork, and forks keep the tenant", async () => {
      const em = scope("test");
      expect(em).toBeInstanceOf(TenantEntityManager);
      expect(em.fork()).toBeInstanceOf(TenantEntityManager);
      expect(em.fork().getFilterParams(TENANT_FILTER)).toEqual({ code: "test" });
    });
  });

  describe("reads", () => {
    it("fills the tenant on create and returns only the scope's own records (R05)", async () => {
      const { testId, prodId } = await seedParents();

      expect(await parentNames("test")).toEqual(["test parent"]);
      expect(await parentNames("prod")).toEqual(["prod parent"]);
      expect(await scope("prod").findOne(FixtureParent, testId)).toBeNull();
      expect(await scope("test").count(FixtureParent)).toBe(1);
      const stored = await execute(`select tenant_code from fixture_parent where id in (${testId}, ${prodId}) order by id`);
      expect(stored.map(({ tenant_code }) => tenant_code)).toEqual(["test", "prod"]);
    });

    it("refuses to read tenant-owned data without a tenant (fail closed)", async () => {
      await seedParents();

      await expect(scope().find(FixtureParent, {})).rejects.toThrow(TenantViolationError);
      await expect(scope().count(FixtureParent)).rejects.toThrow(/read tenant-owned data without a tenant scope/);
    });

    it("ignores per-call filter arguments that name another tenant", async () => {
      await seedParents();

      const peek = await scope("test").find(FixtureParent, {}, { filters: { [TENANT_FILTER]: { code: "prod" } } });
      expect(peek.map(({ name }) => name)).toEqual(["test parent"]);
    });

    it("scopes populated collections too", async () => {
      const { testId } = await seedParents();
      // A corrupt row a bug could have written: a Prod child pointing at the Test parent.
      await execute(`insert into fixture_child (tenant_code, name, parent_id) values ('prod', 'stray', ${testId})`);
      const em = scope("test");
      em.create(FixtureChild, { name: "own", parent: await em.findOneOrFail(FixtureParent, testId) });
      await em.flush();

      const [parent] = await scope("test").find(FixtureParent, {}, { populate: ["children"] });
      expect(parent.children.getItems().map(({ name }) => name)).toEqual(["own"]);
    });

    it("leaves global entities unfiltered", async () => {
      await scope().insert(Setting, { key: "tenancy.read", value: "x", updatedAt: new Date() });

      expect(await scope().count(Setting, { key: "tenancy.read" })).toBe(1);
      expect(await scope("test").count(Tenant)).toBe(2);
    });
  });

  describe("native updates and deletes", () => {
    it("only touch the scope's tenant", async () => {
      const { testId } = await seedParents();

      expect(await scope("prod").nativeUpdate(FixtureParent, { id: testId }, { name: "hijacked" })).toBe(0);
      expect(await scope("prod").nativeDelete(FixtureParent, { id: testId })).toBe(0);
      expect(await scope("test").nativeUpdate(FixtureParent, { id: testId }, { name: "renamed" })).toBe(1);
      expect(await parentNames("test")).toEqual(["renamed"]);
      await expect(scope().nativeDelete(FixtureParent, {})).rejects.toThrow(/change tenant-owned data without a tenant scope/);
    });

    it("refuse to move rows to another tenant", async () => {
      const { testId } = await seedParents();

      await expect(
        scope("test").nativeUpdate(FixtureParent, { id: testId }, { tenant: "prod" }),
      ).rejects.toThrow(/nativeUpdate\(\) bypasses tenant checks/);
      expect(await parentNames("test")).toEqual(["test parent"]);
    });
  });

  describe("bulk write paths", () => {
    it("are refused for tenant-owned entities", async () => {
      const { testId } = await seedParents();
      const em = scope("test");
      const parent = await em.findOneOrFail(FixtureParent, testId);
      const refused = /bypasses tenant checks; use em.create\(\) and flush\(\) for FixtureParent/;

      await expect(em.insert(FixtureParent, { name: "x", tenant: "prod" })).rejects.toThrow(refused);
      await expect(em.insert(parent)).rejects.toThrow(refused);
      await expect(em.insertMany(FixtureParent, [{ name: "x", tenant: "prod" }])).rejects.toThrow(refused);
      await expect(em.insertMany([parent])).rejects.toThrow(refused);
      await expect(em.upsert(FixtureParent, { id: testId, name: "x", tenant: "prod" })).rejects.toThrow(refused);
      await expect(em.upsertMany(FixtureParent, [{ id: testId, name: "x", tenant: "prod" }])).rejects.toThrow(refused);
      await expect(em.clone(FixtureParent, { id: testId }, { tenant: "prod" })).rejects.toThrow(refused);
      expect(() => em.createQueryBuilder(FixtureParent)).toThrow(refused);
      expect(() => em.qb(FixtureParent)).toThrow(refused);
      expect(await rawCount("fixture_parent")).toBe(2);
    });

    it("still work for global entities", async () => {
      const em = scope("test");

      await em.insert(Setting, { key: "bulk.one", value: "1", updatedAt: new Date() });
      await em.insertMany(Setting, [{ key: "bulk.two", value: "2", updatedAt: new Date() }]);
      await em.upsert(Setting, { key: "bulk.one", value: "one", updatedAt: new Date() });
      await em.upsertMany(Setting, [{ key: "bulk.two", value: "two", updatedAt: new Date() }]);
      await em.nativeUpdate(Setting, { key: "bulk.one" }, { value: "uno" });
      const qb = em.createQueryBuilder(Setting).select("key").where({ key: { $like: "bulk.%" } });
      const reused = em.createQueryBuilder(Setting);
      expect(em.createQueryBuilder(reused).getFormattedQuery()).toContain("from `setting`");
      expect((await qb.getResultList()).map(({ key }) => key).sort()).toEqual(["bulk.one", "bulk.two"]);
      expect((await em.qb(Setting).where({ key: "bulk.one" }).getSingleResult())?.value).toBe("uno");
    });
  });

  describe("the flush guard", () => {
    it("rejects creating tenant-owned data without a tenant, writing nothing", async () => {
      const em = scope();
      em.create(FixtureParent, { name: "orphan" });

      await expect(em.flush()).rejects.toThrow(/create tenant-owned data without a tenant scope/);
      expect(await rawCount("fixture_parent")).toBe(0);
    });

    it("rejects a flush whose scope has no tenant", async () => {
      const { testId } = await seedParents();
      const em = scope("test");
      const parent = await em.findOneOrFail(FixtureParent, testId);
      parent.name = "renamed";
      em.setFilterParams(TENANT_FILTER, undefined as never);

      await expect(em.flush()).rejects.toThrow(/writing tenant-owned data without a tenant scope/);
      expect(await parentNames("test")).toEqual(["test parent"]);
    });

    it("rejects creating a record for another tenant", async () => {
      const em = scope("test");
      em.create(FixtureParent, { name: "smuggled", tenant: em.getReference(Tenant, "prod") });

      await expect(em.flush()).rejects.toThrow(/FixtureParent belongs to another tenant/);
      expect(await rawCount("fixture_parent")).toBe(0);
    });

    it("rejects moving a record to another tenant", async () => {
      const { testId } = await seedParents();
      const em = scope("test");
      const parent = await em.findOneOrFail(FixtureParent, testId);
      parent.tenant = em.getReference(Tenant, "prod");

      await expect(em.flush()).rejects.toThrow(/FixtureParent.tenant can't change/);
      expect(await parentNames("test")).toEqual(["test parent"]);
    });

    it("rejects changing a record whose tenant wasn't loaded", async () => {
      const { testId } = await seedParents();
      const em = scope("test");
      const parent = await em.findOneOrFail(FixtureParent, testId, { fields: ["name"] });
      parent.name = "renamed";

      await expect(em.flush()).rejects.toThrow(/its tenant isn't loaded/);
      expect(await parentNames("test")).toEqual(["test parent"]);
    });

    it("rejects deleting through an unloaded reference", async () => {
      const { prodId } = await seedParents();
      const em = scope("test");
      em.remove(em.getReference(FixtureParent, prodId));

      await expect(em.flush()).rejects.toThrow(/FixtureParent was changed through an unloaded reference/);
      expect(await parentNames("prod")).toEqual(["prod parent"]);
    });

    it("rejects a reference to another tenant's record (TEN-014)", async () => {
      const { prodId } = await seedParents();
      const prodParent = await scope("prod").findOneOrFail(FixtureParent, prodId);
      const em = scope("test");
      em.create(FixtureChild, { name: "child", parent: em.merge(prodParent) });

      await expect(em.flush()).rejects.toThrow(/FixtureChild.parent points at a record of another tenant/);
      expect(await rawCount("fixture_child")).toBe(0);
    });

    it("rejects a reference that wasn't loaded through the scope", async () => {
      const { prodId } = await seedParents();
      const em = scope("test");
      em.create(FixtureChild, { name: "child", parent: em.getReference(FixtureParent, prodId) });

      await expect(em.flush()).rejects.toThrow(/FixtureChild.parent points at a record that wasn't loaded/);
      expect(await rawCount("fixture_child")).toBe(0);
    });

    it("rejects collection items of another tenant or not loaded", async () => {
      const { testId, prodId } = await seedParents();
      const prodParent = await scope("prod").findOneOrFail(FixtureParent, prodId);

      const foreign = scope("test");
      const child = foreign.create(FixtureChild, { name: "tagged" });
      child.tags.add(foreign.merge(prodParent));
      await expect(foreign.flush()).rejects.toThrow(/FixtureChild.tags points at a record of another tenant/);

      const unloaded = scope("test");
      unloaded.create(FixtureChild, { name: "tagged" }).tags.add(unloaded.getReference(FixtureParent, prodId));
      await expect(unloaded.flush()).rejects.toThrow(/FixtureChild.tags points at a record that wasn't loaded/);

      const own = scope("test");
      own.create(FixtureChild, { name: "tagged" }).tags.add(await own.findOneOrFail(FixtureParent, testId));
      await own.flush();
      expect(await rawCount("fixture_child_tags")).toBe(1);
    });

    it("accepts the scope's own references, nulls and unloaded global references", async () => {
      const { testId } = await seedParents();
      const user = scope().create(User, { username: "planner", role: "user" });
      await scope().persist(user).flush();

      const em = scope("test");
      const child = em.create(FixtureChild, {
        name: "child",
        parent: await em.findOneOrFail(FixtureParent, testId),
        owner: em.getReference(User, user.id),
      });
      child.watchers.add(em.getReference(User, user.id));
      await em.flush();
      child.parent = null;
      child.name = "renamed";
      await em.flush();

      const stored = await scope("test").findOneOrFail(FixtureChild, child.id, { populate: ["watchers"] });
      expect(stored).toMatchObject({ name: "renamed", parent: null });
      expect(stored.watchers.getItems().map(({ username }) => username)).toEqual(["planner"]);
    });

    it("lets flushes of global entities through, with or without a tenant", async () => {
      for (const [key, em] of [["global.none", scope()], ["global.test", scope("test")]] as const) {
        em.create(Setting, { key, value: "1" });
        await em.flush();
      }
      expect(await scope().count(Setting, { key: { $like: "global.%" } })).toBe(2);
    });

    it("checks tenant-owned items in a global record's collections, and ignores global ones", async () => {
      const { testId, prodId } = await seedParents();
      const user = scope().create(User, { username: "member", role: "user" });
      await scope().persist(user).flush();

      const global = scope();
      global.create(FixtureBoard, {}).members.add(global.getReference(User, user.id));
      await global.flush();
      expect(await rawCount("fixture_board_members")).toBe(1);

      const foreign = scope("test");
      foreign.create(FixtureBoard, {}).pins.add(foreign.getReference(FixtureParent, prodId));
      await expect(foreign.flush()).rejects.toThrow(/FixtureBoard.pins points at a record that wasn't loaded/);

      const own = scope("test");
      own.create(FixtureBoard, {}).pins.add(await own.findOneOrFail(FixtureParent, testId));
      await own.flush();
      expect(await rawCount("fixture_board_pins")).toBe(1);
    });

    it("keeps the tenant inside transactions", async () => {
      await scope("test").transactional(async (em) => {
        em.create(FixtureParent, { name: "in a transaction" });
      });

      expect(await parentNames("test")).toEqual(["in a transaction"]);
      expect(await parentNames("prod")).toEqual([]);
    });
  });
});
