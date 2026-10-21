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
import { TEST_TENANT_CONFIG, type TestTenantConfig } from "../../domain/demo/test-tenant-config.schema";
import { formatDecimal, parseDecimal } from "../../domain/quantities/decimal";
import { DATASET_KINDS, DEMO_KINDS, demoSeeders, isUntouchedTest, seedResetDemoData, seedTestTenantDataset } from "./seed-demo-data";

const TODAY = new Date("2026-10-21T10:00:00.000Z");
/** The committed catalogue over two history months: every rule of the dataset, at a fraction of its size. */
const REDUCED: TestTenantConfig = { ...TEST_TENANT_CONFIG, horizon: { ...TEST_TENANT_CONFIG.horizon, historyMonths: 2 } };

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

it("runs the complete ordered fixture set and refuses an incomplete second seed", async () => {
  const cradle = await testScope();
  expect(Object.keys(demoSeeders(cradle))).toEqual(DEMO_KINDS);
  await seedResetDemoData(cradle);
  expect((await cradle.bomService.list()).length).toBe(demoSeeders(cradle).BOMs.expected);
  await expect(seedResetDemoData(cradle)).rejects.toThrow("Incomplete demonstration seed: materials");
});

describe("seedTestTenantDataset", () => {
  it("writes the generated dataset through the services: every kind's count, the replayed balances, no audit (TEN-001)", async () => {
    const cradle = await testScope();
    const { em } = cradle;
    expect(await isUntouchedTest(em)).toBe(true);
    const dataset = generateTestTenantDataset(REDUCED, "2026-10-21");

    const counts = await seedTestTenantDataset(cradle, TODAY, REDUCED);

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
    const ledger = new Ledger(REDUCED);
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
    const dataset = generateTestTenantDataset(REDUCED, "2026-10-21");

    await seedTestTenantDataset(cradle, TODAY, REDUCED);

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

  it("fulfils every history order line by exactly what its goods issues took (SAL-006…009, INV-012)", async () => {
    const cradle = await testScope();
    const { em } = cradle;
    await seedTestTenantDataset(cradle, TODAY, REDUCED);

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
    await cradle.materialService.seedDemo();
    cradle.em.clear();

    await expect(seedTestTenantDataset(cradle, TODAY, REDUCED)).rejects.toThrow("Incomplete demonstration seed: materials");
  });

  it("seeds the committed configuration's full two years", async () => {
    const cradle = await testScope();
    const { summary } = generateTestTenantDataset(TEST_TENANT_CONFIG, "2026-10-21");

    const counts = await seedTestTenantDataset(cradle, TODAY);

    expect(counts["customer orders"]).toBe(summary.customerOrders);
    expect(counts["production completions"]).toBe(summary.completions);
    expect(await cradle.em.count(StockMovement, {})).toBe(summary.movements);
  }, 300_000);
});
