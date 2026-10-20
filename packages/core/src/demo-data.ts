import { initOrm } from "@cpg/db";
import type { AppConfig } from "./config";
import { createAppContainer } from "./container/container";
import { scopeForTenant } from "./container/tenant-scope";
import { toDbOptions } from "./database";

/**
 * The kinds of demonstration record the Test tenant is seeded with, in seeding order: the planning
 * rows come after the materials and locations they reference, and the BOMs after the materials.
 */
export const DEMO_KINDS = [
  "materials",
  "locations",
  "customers",
  "suppliers",
  "planning parameter sets",
  "safety-stock targets",
  "BOMs",
  "stock openings",
] as const;
export type DemoKind = (typeof DEMO_KINDS)[number];

/** How one kind's seed went: how many records it created (0 when Test had some), or why it failed. */
export type DemoSeedResult = { seeded: number } | { error: unknown };

/**
 * Seeds the Test tenant with its demonstration records (TEN-001, D06): each kind Test has none of
 * gets its fixed list. Run at every server start, after the migrations, with a short-lived connection
 * like the other startup tasks (never the shared container). Each kind runs in its own transaction
 * and a failure in one is reported without stopping the others, so the next start retries only the
 * kinds still empty. Prod is never touched.
 */
export async function seedDemoData(config: AppConfig): Promise<Record<DemoKind, DemoSeedResult>> {
  const orm = await initOrm(toDbOptions(config));
  try {
    const { cradle } = await scopeForTenant(createAppContainer(config, orm), "test");
    const seeders: Record<DemoKind, () => Promise<number>> = {
      materials: () => cradle.materialService.seedDemo(),
      locations: () => cradle.locationService.seedDemo(),
      customers: () => cradle.customerService.seedDemo(),
      suppliers: () => cradle.supplierService.seedDemo(),
      "planning parameter sets": () => cradle.planningParameterService.seedDemo(),
      "safety-stock targets": () => cradle.safetyStockTargetService.seedDemo(),
      BOMs: () => cradle.bomService.seedDemo(),
      "stock openings": () => cradle.stockService.seedDemo(),
    };
    const results = {} as Record<DemoKind, DemoSeedResult>;
    for (const kind of DEMO_KINDS) {
      try {
        results[kind] = { seeded: await seeders[kind]() };
      } catch (error) {
        results[kind] = { error };
      }
    }
    return results;
  } finally {
    await orm.close();
  }
}
