import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineEntity, p } from "@mikro-orm/core";
import { afterEach, describe, expect, it } from "vitest";
import { entities, GlobalAuditEvent, Material, selectTenant, Tenant, TenantAuditEvent, TenantViolationError } from "../entities";
import { initOrm, migrate, type Orm } from "../orm";
import { resetTestData, testResetEntities } from "./reset-test-data";

const entry = {
  action: "test.record.created", subjectType: "Material", subjectId: "one", subjectLabel: "one",
  actorUserId: "admin", actorUsername: "admin", channel: "ui" as const,
};
const GlobalReference = defineEntity({ name: "GlobalReference", properties: { id: p.integer().primary(), material: () => p.manyToOne(Material) } });

describe("Test reset persistence", () => {
  let orm: Orm;
  const start = async (globalReference = false) => {
    const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-reset-db-")), "db.sqlite");
    await migrate({ databasePath });
    orm = await initOrm({ databasePath }, globalReference ? { entities: [...entities, GlobalReference] } : {});
    return orm.em.fork();
  };
  afterEach(async () => { await orm.close(); });

  it("refuses an unscoped, Prod or non-transactional reset before any deletion", async () => {
    const em = await start();
    await expect(resetTestData(em)).rejects.toThrow(TenantViolationError);
    selectTenant(em, "prod");
    await em.begin();
    await expect(resetTestData(em)).rejects.toThrow(TenantViolationError);
    await em.rollback();
    selectTenant(em, "test");
    await expect(resetTestData(em)).rejects.toThrow(TenantViolationError);
    expect(await em.count(Tenant, {})).toBe(2);
  });

  it("refuses a mapping whose deletion could mutate a global reference", async () => {
    const em = await start(true);
    selectTenant(em, "test");
    await em.begin();
    await expect(resetTestData(em)).rejects.toThrow("global entity references");
    await em.rollback();
  });

  it("clears Test audit and business data atomically, preserving Prod and Global (AUD-011, AUD-012)", async () => {
    const em = await start();
    for (const code of ["test", "prod"] as const) {
      const scoped = orm.em.fork();
      selectTenant(scoped, code);
      scoped.create(Material, { code: "00000001", type: "raw", description: code, baseUnit: "kg" });
      scoped.create(TenantAuditEvent, entry);
      await scoped.flush();
    }
    em.create(GlobalAuditEvent, entry);
    await em.flush();
    selectTenant(em, "test");
    await em.begin();
    await resetTestData(em);
    expect(await em.count(Material, {})).toBe(0);
    expect(await em.count(TenantAuditEvent, {})).toBe(0);
    await em.rollback();
    em.clear();
    expect(await em.count(Material, {})).toBe(1);
    expect(await em.count(TenantAuditEvent, {})).toBe(1);
    await em.begin();
    await resetTestData(em);
    await em.commit();
    expect(await em.count(Material, {})).toBe(0);
    const prod = orm.em.fork();
    selectTenant(prod, "prod");
    expect(await prod.find(Material, {})).toMatchObject([{ description: "prod" }]);
    expect(await prod.count(TenantAuditEvent, {})).toBe(1);
    expect(await prod.count(GlobalAuditEvent, {})).toBe(1);
    expect(testResetEntities(em).map((meta) => meta.className)).toContain("TenantIdempotencyKey");
    expect(await em.getConnection().execute("pragma foreign_key_check")).toEqual([]);
  });

  it("migration down restores the Test audit delete guard, and up restores its reset exception", async () => {
    const em = await start();
    selectTenant(em, "test");
    const event = em.create(TenantAuditEvent, entry);
    await em.flush();
    await orm.migrator.down();
    await expect(em.nativeDelete(TenantAuditEvent, { id: event.id })).rejects.toThrow("audit is append-only");
    await orm.migrator.up();
    await expect(em.nativeUpdate(TenantAuditEvent, { id: event.id }, { subjectLabel: "changed" })).rejects.toThrow("audit is append-only");
    expect(await em.nativeDelete(TenantAuditEvent, { id: event.id })).toBe(1);
  });
});
