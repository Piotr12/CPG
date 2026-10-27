import { Material, TenantAuditEvent, type EntityManager } from "@cpg/db";
import type { Cradle } from "../../container/cradle";
import { generateTestTenantDataset, type TimelineEvent } from "../../domain/demo/generate-dataset";
import { notAfter } from "../../domain/demo/timeline";
import { DEFAULT_TEST_DATASET, type TestDataset } from "../../domain/demo/test-datasets";
import { yieldToEventLoop } from "../../http/yield-to-event-loop";

/** What the generated dataset holds, in the order the seed writes it (spec `2026-10-21--0718UTC-test-tenant-dataset`). */
export const DATASET_KINDS = [
  "materials", "locations", "customers", "suppliers", "planning parameter sets", "safety-stock targets", "BOMs", "forecasts",
  "stock openings", "customer orders", "shipments", "goods issues", "purchase requisitions", "purchase orders", "goods receipts",
  "production orders", "production completions",
] as const;
export type DatasetKind = (typeof DATASET_KINDS)[number];

/** The services the dataset is written through, and the `em` they share, whose identity map the seed clears between documents. */
export type DatasetServices = Pick<Cradle, "em" | "testDatasets" | "materialService" | "locationService" | "customerService" | "supplierService"
  | "planningParameterService" | "safetyStockTargetService" | "bomService" | "forecastService" | "stockService"
  | "customerOrderService" | "shipmentService" | "goodsIssueService" | "purchaseRequisitionService" | "purchaseOrderService"
  | "goodsReceiptService" | "productionOrderService" | "productionCompletionService">;

const EVENT_KIND = {
  opening: "stock openings", customerOrder: "customer orders", shipment: "shipments", goodsIssue: "goods issues",
  requisition: "purchase requisitions", purchaseOrder: "purchase orders", goodsReceipt: "goods receipts",
  productionOrder: "production orders", completion: "production completions",
} as const satisfies Record<TimelineEvent["kind"], DatasetKind>;

/**
 * Whether Test is as a fresh install leaves it: no material, which everything else references, and no
 * tenant audit entry, which every user write leaves while the seed leaves none (spec Q4). Only such a
 * Test gets the dataset at startup; one an admin has used keeps its data until the next reset.
 */
export async function isUntouchedTest(em: EntityManager): Promise<boolean> {
  return (await em.count(Material, {})) === 0 && (await em.count(TenantAuditEvent, {})) === 0;
}

/**
 * Writes the dataset generated for `today` (the seed's clock: its date picks the dataset, and today's
 * partial documents are stamped no later than it) into the scope's tenant through the services' seed paths,
 * in the caller's transaction, and returns how many records of each kind it created. The masters come
 * first, created on the setup date, then every timeline event in order, each dated by its own `at`;
 * documents are referenced by the IDs and line IDs the services return, and the identity map is
 * cleared after each one, so no flush walks what earlier documents created (lesson of 2026-10-20),
 * then the event loop gets a turn. A master kind the tenant already had, or any refusal, throws: the
 * caller's rollback leaves nothing.
 * `name` picks which of the container's `testDatasets` is written: tiny unless the caller asks for
 * realistic (spec `2026-10-22--0902UTC-test-tenant-two-datasets`).
 */
export async function seedTestTenantDataset(services: DatasetServices, today: Date, name: TestDataset = DEFAULT_TEST_DATASET): Promise<Record<DatasetKind, number>> {
  const dataset = generateTestTenantDataset(services.testDatasets[name], today.toISOString().slice(0, 10));
  const { em } = services;
  const { masters } = dataset;
  const setup = new Date(`${dataset.setupDate}T08:00:00.000Z`);
  const counts = Object.fromEntries(DATASET_KINDS.map((kind) => [kind, 0])) as Record<DatasetKind, number>;
  const seedMasters = async (kind: DatasetKind, expected: number, seed: () => Promise<number>) => {
    counts[kind] = await seed();
    if (counts[kind] !== expected) throw new Error(`Incomplete demonstration seed: ${kind}`);
    em.clear();
    await yieldToEventLoop();
  };
  await seedMasters("materials", masters.materials.length, () => services.materialService.seedDemo(masters.materials, setup));
  await seedMasters("locations", masters.locations.length, () => services.locationService.seedDemo(masters.locations, setup));
  await seedMasters("customers", masters.customers.length, () => services.customerService.seedDemo(masters.customers, setup));
  await seedMasters("suppliers", masters.suppliers.length, () => services.supplierService.seedDemo(masters.suppliers, setup));
  await seedMasters("planning parameter sets", masters.planningParameters.length, () => services.planningParameterService.seedDemo(masters.planningParameters));
  await seedMasters("safety-stock targets", masters.safetyStockTargets.length, () => services.safetyStockTargetService.seedDemo(masters.safetyStockTargets));
  await seedMasters("BOMs", masters.boms.length, () => services.bomService.seedDemo(masters.boms, setup));
  await seedMasters("forecasts", dataset.forecasts.length, () => services.forecastService.seedDemo(dataset.forecasts));

  const customerOrders = new Map<string, { id: string; lines: string[] }>();
  const ids = new Map<string, string>();
  // `today` is the seed's clock: today's partial documents are stamped no later than it.
  for (const event of notAfter(dataset.timeline, today)) {
    const at = new Date(event.at);
    switch (event.kind) {
      case "opening":
        await services.stockService.seedDemo(event.lines.map((line) => ({ ...line, location: event.location })), at);
        break;
      case "customerOrder":
        customerOrders.set(event.key, await services.customerOrderService.seedDemo({ customer: event.customer, location: event.location, lines: event.lines }, at));
        break;
      case "shipment": {
        const order = customerOrders.get(event.order)!;
        const lines = event.lines.map(({ orderLine, quantity, unit }) => ({ orderLine: order.lines[orderLine], quantity, unit }));
        ids.set(event.key, (await services.shipmentService.seedDemo({ customerOrder: order.id, plannedDate: event.plannedDate, lines }, at)).id);
        break;
      }
      case "goodsIssue":
        await services.goodsIssueService.seedDemo({ shipment: ids.get(event.shipment)!, lines: event.lines }, at);
        break;
      case "requisition": {
        const { material, location, quantity, unit, requiredDate } = event;
        ids.set(event.key, (await services.purchaseRequisitionService.seedDemo({ material, location, quantity, unit, requiredDate }, at)).id);
        break;
      }
      case "purchaseOrder": {
        const lines = event.lines.map(({ requisition, ...line }) => (requisition ? { ...line, requisition: ids.get(requisition)! } : line));
        ids.set(event.key, (await services.purchaseOrderService.seedDemo({ supplier: event.supplier, location: event.location, lines }, at)).id);
        break;
      }
      case "goodsReceipt":
        await services.goodsReceiptService.seedDemo({ purchaseOrder: ids.get(event.order)!, lines: event.lines }, at);
        break;
      case "productionOrder": {
        const { output, location, quantity, unit, plannedFinish, bom, revision } = event;
        ids.set(event.key, (await services.productionOrderService.seedDemo({ output, location, quantity, unit, plannedFinish, bom, revision }, at)).id);
        break;
      }
      case "completion":
        await services.productionCompletionService.seedDemo(ids.get(event.order)!, { quantity: event.quantity, unit: event.unit, components: event.components }, at);
        break;
    }
    counts[EVENT_KIND[event.kind]] += 1;
    em.clear();
    await yieldToEventLoop();
  }
  return counts;
}
