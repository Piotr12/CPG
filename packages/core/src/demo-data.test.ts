import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CustomerOrder, initOrm, Material, StockMovement, Tenant, TenantAuditEvent, selectTenant, type EntityManager } from "@cpg/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig, type AppConfig } from "./config";
import { createAppContainer } from "./container/container";
import { scopeForTenant } from "./container/tenant-scope";
import { migrateDatabase, toDbOptions } from "./database";
import { DATASET_KINDS, seedDemoData } from "./demo-data";
import { generateTestTenantDataset } from "./domain/demo/generate-dataset";
import { TEST_DATASET_CONFIGS } from "./domain/demo/test-datasets";
import type { AuditActor } from "./services/audit/actor";
import { ShipmentService } from "./services/shipments/shipment.service";

const TODAY = new Date("2026-10-21T10:00:00.000Z");
const ACTOR: AuditActor = { userId: "admin-id", username: "admin", sessionId: "admin-session", channel: "ui", token: null };

async function migratedConfig() {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-demo-data-")) });
  await migrateDatabase(config);
  return config;
}

/** What `count` finds in each tenant. */
async function counts(config: AppConfig, count: (em: EntityManager) => Promise<number>) {
  const orm = await initOrm(toDbOptions(config));
  try {
    const inTenant = (tenant: "test" | "prod") => {
      const em = orm.em.fork();
      selectTenant(em, tenant);
      return count(em);
    };
    return { test: await inTenant("test"), prod: await inTenant("prod") };
  } finally {
    await orm.close();
  }
}

/** Runs `change` with the Test scope's services, then closes the connection. */
async function inTest(config: AppConfig, change: (cradle: Awaited<ReturnType<typeof scopeForTenant>>["cradle"]) => Promise<unknown>) {
  const orm = await initOrm(toDbOptions(config));
  try {
    await change((await scopeForTenant(createAppContainer(config, orm), "test")).cradle);
  } finally {
    await orm.close();
  }
}

describe("seedDemoData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fills an untouched Test with the generated dataset in one go, never Prod, and leaves a used Test alone (TEN-001, Q4)", async () => {
    const config = await migratedConfig();
    const { masters, summary } = generateTestTenantDataset(TEST_DATASET_CONFIGS.tiny, "2026-10-21");

    const result = await seedDemoData(config, { today: TODAY });

    expect(result.outcome).toBe("seeded");
    const seeded = (result as Extract<typeof result, { outcome: "seeded" }>).counts;
    expect(Object.keys(seeded)).toEqual(DATASET_KINDS);
    expect(seeded).toMatchObject({ materials: masters.materials.length, BOMs: masters.boms.length, "customer orders": summary.customerOrders });
    expect(await counts(config, (em) => em.count(Material, {}))).toEqual({ test: masters.materials.length, prod: 0 });
    expect(await counts(config, (em) => em.count(CustomerOrder, {}))).toEqual({ test: summary.customerOrders, prod: 0 });
    expect(await counts(config, (em) => em.count(StockMovement, {}))).toEqual({ test: summary.movements, prod: 0 });

    expect(await seedDemoData(config, { today: TODAY })).toEqual({ outcome: "skipped", reason: "in use" });
    expect(await counts(config, (em) => em.count(CustomerOrder, {}))).toEqual({ test: summary.customerOrders, prod: 0 });
  }, 60_000);

  it("leaves a Test someone has written to, even with no material: its audit remembers the change", async () => {
    const config = await migratedConfig();
    await inTest(config, (cradle) => cradle.locationService.create({ name: "Admin's own plant" }, ACTOR));
    expect(await counts(config, (em) => em.count(TenantAuditEvent, {}))).toEqual({ test: 1, prod: 0 });

    expect(await seedDemoData(config, { today: TODAY })).toEqual({ outcome: "skipped", reason: "in use" });
    expect(await counts(config, (em) => em.count(Material, {}))).toEqual({ test: 0, prod: 0 });
  });

  it("writes nothing into a read-only Test (R05)", async () => {
    const config = await migratedConfig();
    await inTest(config, (cradle) => cradle.em.nativeUpdate(Tenant, { code: "test" }, { readOnly: true }));

    expect(await seedDemoData(config, { today: TODAY })).toEqual({ outcome: "skipped", reason: "read-only" });
    expect(await counts(config, (em) => em.count(Material, {}))).toEqual({ test: 0, prod: 0 });
  });

  it("rolls the whole dataset back on a failure midway and reports it; the next start seeds it all", async () => {
    const config = await migratedConfig();
    const failure = new Error("disk full");
    vi.spyOn(ShipmentService.prototype, "seedDemo").mockRejectedValueOnce(failure);

    expect(await seedDemoData(config, { today: TODAY })).toEqual({ outcome: "failed", error: failure });
    expect(await counts(config, (em) => em.count(Material, {}))).toEqual({ test: 0, prod: 0 });
    expect(await counts(config, (em) => em.count(CustomerOrder, {}))).toEqual({ test: 0, prod: 0 });

    expect((await seedDemoData(config, { today: TODAY })).outcome).toBe("seeded");
    expect(await counts(config, (em) => em.count(Material, {}))).toEqual({ test: TEST_DATASET_CONFIGS.tiny.catalogue.materials.length, prod: 0 });
  }, 60_000);

  it("generates the tiny dataset for the server's clock by default (two-datasets spec Q3)", async () => {
    const config = await migratedConfig();
    vi.useFakeTimers({ now: TODAY, toFake: ["Date"] });
    try {
      const result = await seedDemoData(config);
      expect(result).toMatchObject({ outcome: "seeded", counts: { "customer orders": generateTestTenantDataset(TEST_DATASET_CONFIGS.tiny, "2026-10-21").summary.customerOrders } });
    } finally {
      vi.useRealTimers();
    }
  }, 120_000);
});
