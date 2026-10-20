import type { Cradle } from "../../container/cradle";
import { DEMO_BOMS } from "../../domain/boms/demo-boms";
import { DEMO_CUSTOMERS } from "../../domain/customers/demo-customers";
import { DEMO_FORECASTS } from "../../domain/forecasts/demo-forecasts";
import { DEMO_LOCATIONS } from "../../domain/locations/demo-locations";
import { DEMO_MATERIALS } from "../../domain/materials/demo-materials";
import { DEMO_PLANNING_PARAMETERS } from "../../domain/planning-parameters/demo-planning-parameters";
import { DEMO_SAFETY_STOCK_TARGETS } from "../../domain/safety-stock/demo-safety-stock-targets";
import { DEMO_STOCK } from "../../domain/stock/demo-stock";
import { DEMO_SUPPLIERS } from "../../domain/suppliers/demo-suppliers";

/** One definition of seed order: references follow their materials and locations. */
export const DEMO_KINDS = ["materials", "locations", "customers", "suppliers", "planning parameter sets", "safety-stock targets", "BOMs", "forecasts", "customer orders", "stock openings"] as const;
export type DemoKind = (typeof DEMO_KINDS)[number];
export type DemoServices = Pick<Cradle, "materialService" | "locationService" | "customerService" | "supplierService" | "planningParameterService" | "safetyStockTargetService" | "bomService" | "forecastService" | "customerOrderService" | "stockService">;

/** Shared by startup's best-effort runner and reset's atomic fail-fast runner. */
export function demoSeeders(services: DemoServices): Record<DemoKind, { expected: number; run: () => Promise<number> }> {
  return {
    materials: { expected: DEMO_MATERIALS.length, run: () => services.materialService.seedDemo() },
    locations: { expected: DEMO_LOCATIONS.length, run: () => services.locationService.seedDemo() },
    customers: { expected: DEMO_CUSTOMERS.length, run: () => services.customerService.seedDemo() },
    suppliers: { expected: DEMO_SUPPLIERS.length, run: () => services.supplierService.seedDemo() },
    "planning parameter sets": { expected: DEMO_PLANNING_PARAMETERS.length, run: () => services.planningParameterService.seedDemo() },
    "safety-stock targets": { expected: DEMO_SAFETY_STOCK_TARGETS.length, run: () => services.safetyStockTargetService.seedDemo() },
    BOMs: { expected: DEMO_BOMS.length, run: () => services.bomService.seedDemo() },
    forecasts: { expected: DEMO_FORECASTS.length, run: () => services.forecastService.seedDemo() },
    "customer orders": { expected: 1, run: () => services.customerOrderService.seedDemo() },
    "stock openings": { expected: DEMO_STOCK.length, run: () => services.stockService.seedDemo() },
  };
}

/** A reset must create every fixture; skipped or failed seeds abort its outer transaction. */
export async function seedResetDemoData(services: DemoServices): Promise<void> {
  const seeders = demoSeeders(services);
  for (const kind of DEMO_KINDS) {
    const { expected, run } = seeders[kind];
    if (await run() !== expected) throw new Error(`Incomplete demonstration seed: ${kind}`);
  }
}
