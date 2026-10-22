import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CustomerOrder, CustomerOrderLine, GoodsIssueLine, initOrm, migrate, ProductionCompletion, StockBalance, StockMovement, TenantAuditEvent, type Orm } from "@cpg/db";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import { scopeForTenant } from "../../container/tenant-scope";
import { toDbOptions } from "../../database";
import { generateTestTenantDataset } from "../../domain/demo/generate-dataset";
import { Ledger } from "../../domain/demo/ledger";
import { TEST_DATASET_CONFIGS } from "../../domain/demo/test-datasets";
import { formatDecimal, parseDecimal } from "../../domain/quantities/decimal";
import { DATASET_KINDS, isUntouchedTest, seedTestTenantDataset } from "./seed-demo-data";
import { FIXTURE_MATERIALS } from "../../../../../tests/setup/demo-fixtures";

const TODAY = new Date("2026-10-21T10:00:00.000Z");

let orm: Orm | undefined;
afterEach(async () => {
  await orm?.close();
  orm = undefined;
});

async function testScope() {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-dataset-seed-")) });
  await migrate(toDbOptions(config));
  orm = await initOrm(toDbOptions(config));
  return (await scopeForTenant(createAppContainer(config, orm), "test")).cradle;
}

describe("seedTestTenantDataset", () => {
  it("writes the generated dataset through the services: every kind's count, the replayed balances, no audit (TEN-001)", async () => {
    const cradle = await testScope();
    const { em } = cradle;
    expect(await isUntouchedTest(em)).toBe(true);
    const dataset = generateTestTenantDataset(TEST_DATASET_CONFIGS.tiny, "2026-10-21");

    const counts = await seedTestTenantDataset(cradle, TODAY);

    const { masters, summary } = dataset;
    expect(Object.keys(counts)).toEqual(DATASET_KINDS);
    expect(counts).toEqual({
      materials: masters.materials.length, locations: masters.locations.length, customers: masters.customers.length, suppliers: masters.suppliers.length,
      "planning parameter sets": masters.planningParameters.length, "safety-stock targets": masters.safetyStockTargets.length, BOMs: masters.boms.length,
      forecasts: dataset.forecasts.length, "stock openings": summary.openings, "customer orders": summary.customerOrders, shipments: summary.shipments,
      "goods issues": summary.goodsIssues, "purchase requisitions": summary.requisitions, "purchase orders": summary.purchaseOrders,
      "goods receipts": summary.goodsReceipts, "production orders": summary.productionOrders, "production completions": summary.completions,
    });
    expect(await em.count(StockMovement, {})).toBe(summary.movements);
    expect(await em.count(TenantAuditEvent, {})).toBe(0);
    expect(await isUntouchedTest(em)).toBe(false);

    // Every pair ends where the generator's own replay of the timeline ends (R09: none below zero).
    const ledger = new Ledger(TEST_DATASET_CONFIGS.tiny);
    for (const event of dataset.timeline) ledger.apply(event);
    const balances = await em.find(StockBalance, {}, { populate: ["material", "location"] });
    expect(balances.length).toBeGreaterThan(0);
    for (const { material, location, quantity } of balances) {
      expect(quantity, `${material.code} at ${location.code}`).toBe(formatDecimal(ledger.balance(material.code, location.code), { fixed: true }));
      expect(quantity.startsWith("-")).toBe(false);
    }
  }, 60_000);

  it("dates every record by its own event, never by the time the seed ran (spec Q10)", async () => {
    const cradle = await testScope();
    const { em } = cradle;
    const dataset = generateTestTenantDataset(TEST_DATASET_CONFIGS.tiny, "2026-10-21");

    await seedTestTenantDataset(cradle, TODAY);

    const opening = dataset.timeline.find(({ kind }) => kind === "opening")!;
    const first = await em.find(StockMovement, {}, { orderBy: { occurredAt: "asc" }, limit: 1 });
    expect(first[0].occurredAt.toISOString()).toBe(opening.at);
    expect(first[0].businessDate).toBe(opening.at.slice(0, 10));
    expect(first[0].channel).toBe("seed");
    const firstOrder = dataset.timeline.find(({ kind }) => kind === "customerOrder")!;
    expect((await em.findOneOrFail(CustomerOrder, { code: "00000001" })).createdAt.toISOString()).toBe(firstOrder.at);
    const lastCompletion = await em.find(ProductionCompletion, {}, { orderBy: { createdAt: "desc" }, limit: 1 });
    expect(lastCompletion[0].createdAt.getTime()).toBeLessThanOrEqual(new Date(dataset.timeline.at(-1)!.at).getTime());
  }, 60_000);

  it("stamps nothing later than the seed's clock, even when it runs before today's slots", async () => {
    const cradle = await testScope();
    const { em } = cradle;
    const early = new Date("2026-10-21T06:00:00.000Z");
    const { timeline } = generateTestTenantDataset(TEST_DATASET_CONFIGS.tiny, "2026-10-21");
    expect(timeline.some(({ at }) => at > early.toISOString())).toBe(true);

    await seedTestTenantDataset(cradle, early);

    const latest = async (entity: typeof StockMovement | typeof CustomerOrder | typeof ProductionCompletion, field: "occurredAt" | "createdAt" | "updatedAt") =>
      ((await em.find(entity as typeof StockMovement, {}, { orderBy: { [field]: "desc" }, limit: 1 }))[0] as unknown as Record<string, Date>)[field];
    expect((await latest(StockMovement, "occurredAt")).getTime()).toBeLessThanOrEqual(early.getTime());
    expect((await latest(CustomerOrder, "updatedAt")).getTime()).toBeLessThanOrEqual(early.getTime());
    expect((await latest(ProductionCompletion, "createdAt")).getTime()).toBeLessThanOrEqual(early.getTime());
    expect((await em.find(StockMovement, {}, { orderBy: { occurredAt: "desc" }, limit: 1 }))[0].businessDate).toBe("2026-10-21");
  }, 60_000);

  it("fulfils every history order line by exactly what its goods issues took (SAL-006…009, INV-012)", async () => {
    const cradle = await testScope();
    const { em } = cradle;
    await seedTestTenantDataset(cradle, TODAY);

    const issued = new Map<string, bigint>();
    for (const line of await em.find(GoodsIssueLine, {}, { populate: ["shipmentLine.orderLine"] })) {
      const id = line.shipmentLine.orderLine.id;
      issued.set(id, (issued.get(id) ?? 0n) + parseDecimal(line.quantity)!);
    }
    const lines = await em.find(CustomerOrderLine, {});
    expect(lines.some(({ status }) => status === "completed")).toBe(true);
    for (const line of lines) expect(parseDecimal(line.fulfilled), line.id).toBe(issued.get(line.id) ?? 0n);
  }, 60_000);

  it("refuses a Test that already has a master kind, writing nothing more of it", async () => {
    const cradle = await testScope();
    await cradle.materialService.seedDemo(FIXTURE_MATERIALS);
    cradle.em.clear();

    await expect(seedTestTenantDataset(cradle, TODAY)).rejects.toThrow("Incomplete demonstration seed: materials");
  });

  it("seeds the realistic dataset's full two years when asked to, tiny otherwise", async () => {
    const cradle = await testScope();
    const { summary } = generateTestTenantDataset(TEST_DATASET_CONFIGS.realistic, "2026-10-21");

    const counts = await seedTestTenantDataset(cradle, TODAY, "realistic");

    expect(counts["customer orders"]).toBe(summary.customerOrders);
    expect(counts["production completions"]).toBe(summary.completions);
    expect(await cradle.em.count(StockMovement, {})).toBe(summary.movements);
  }, 300_000);
});
