import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Bom,
  Customer,
  initOrm,
  Location,
  Material,
  PlanningParameterSet,
  SafetyStockTarget,
  selectTenant,
  Supplier,
  type EntityManager,
} from "@cpg/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config";
import { migrateDatabase, toDbOptions } from "./database";
import { seedDemoData } from "./demo-data";
import { DEMO_BOMS } from "./domain/boms/demo-boms";
import { DEMO_CUSTOMERS } from "./domain/customers/demo-customers";
import { DEMO_LOCATIONS } from "./domain/locations/demo-locations";
import { DEMO_MATERIALS } from "./domain/materials/demo-materials";
import { DEMO_PLANNING_PARAMETERS } from "./domain/planning-parameters/demo-planning-parameters";
import { DEMO_SAFETY_STOCK_TARGETS } from "./domain/safety-stock/demo-safety-stock-targets";
import { DEMO_SUPPLIERS } from "./domain/suppliers/demo-suppliers";
import { LocationService } from "./services/locations/location.service";

async function migratedConfig() {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-demo-data-")) });
  await migrateDatabase(config);
  return config;
}

/** What `count` finds in each tenant. */
async function counts(config: Awaited<ReturnType<typeof migratedConfig>>, count: (em: EntityManager) => Promise<number>) {
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

describe("seedDemoData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fills an empty Test with every demo kind once, never Prod, and closes its connection (TEN-001)", async () => {
    const config = await migratedConfig();

    expect(await seedDemoData(config)).toEqual({
      materials: { seeded: DEMO_MATERIALS.length },
      locations: { seeded: DEMO_LOCATIONS.length },
      customers: { seeded: DEMO_CUSTOMERS.length },
      suppliers: { seeded: DEMO_SUPPLIERS.length },
      "planning parameter sets": { seeded: DEMO_PLANNING_PARAMETERS.length },
      "safety-stock targets": { seeded: DEMO_SAFETY_STOCK_TARGETS.length },
      BOMs: { seeded: DEMO_BOMS.length },
    });
    expect(await seedDemoData(config)).toEqual({
      materials: { seeded: 0 },
      locations: { seeded: 0 },
      customers: { seeded: 0 },
      suppliers: { seeded: 0 },
      "planning parameter sets": { seeded: 0 },
      "safety-stock targets": { seeded: 0 },
      BOMs: { seeded: 0 },
    });

    expect(await counts(config, (em) => em.count(Material, {}))).toEqual({ test: DEMO_MATERIALS.length, prod: 0 });
    expect(await counts(config, (em) => em.count(Location, {}))).toEqual({ test: DEMO_LOCATIONS.length, prod: 0 });
    expect(await counts(config, (em) => em.count(Customer, {}))).toEqual({ test: DEMO_CUSTOMERS.length, prod: 0 });
    expect(await counts(config, (em) => em.count(Supplier, {}))).toEqual({ test: DEMO_SUPPLIERS.length, prod: 0 });
    expect(await counts(config, (em) => em.count(PlanningParameterSet, {}))).toEqual({ test: DEMO_PLANNING_PARAMETERS.length, prod: 0 });
    expect(await counts(config, (em) => em.count(SafetyStockTarget, {}))).toEqual({ test: DEMO_SAFETY_STOCK_TARGETS.length, prod: 0 });
    expect(await counts(config, (em) => em.count(Bom, {}))).toEqual({ test: DEMO_BOMS.length, prod: 0 });
  });

  it("reports a kind that fails and still seeds the others; the next run seeds only what is still empty", async () => {
    const config = await migratedConfig();
    const failure = new Error("disk full");
    vi.spyOn(LocationService.prototype, "seedDemo").mockRejectedValueOnce(failure);

    expect(await seedDemoData(config)).toEqual({
      materials: { seeded: DEMO_MATERIALS.length },
      locations: { error: failure },
      customers: { seeded: DEMO_CUSTOMERS.length },
      suppliers: { seeded: DEMO_SUPPLIERS.length },
      // Without locations every demo row is skipped, so the kinds stay untouched for the next run.
      "planning parameter sets": { seeded: 0 },
      "safety-stock targets": { seeded: 0 },
      BOMs: { seeded: DEMO_BOMS.length },
    });
    expect(await seedDemoData(config)).toEqual({
      materials: { seeded: 0 },
      locations: { seeded: DEMO_LOCATIONS.length },
      customers: { seeded: 0 },
      suppliers: { seeded: 0 },
      "planning parameter sets": { seeded: DEMO_PLANNING_PARAMETERS.length },
      "safety-stock targets": { seeded: DEMO_SAFETY_STOCK_TARGETS.length },
      BOMs: { seeded: 0 },
    });
  });
});
