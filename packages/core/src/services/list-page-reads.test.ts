import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, migrate, ProductionCompletion, StockMovement, type Orm } from "@cpg/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { createAppContainer } from "../container/container";
import type { Cradle } from "../container/cradle";
import { scopeForTenant } from "../container/tenant-scope";
import { toDbOptions } from "../database";
import { inRequestTransaction } from "../http/request-transaction";
import { seedTestTenantDataset } from "./demo/seed-demo-data";
import { movementSources } from "./stock/movement-sources";
import { TRANSFER_DISPATCH_MOVEMENT } from "./transfers/transfer.service";

// Without ANALYZE statistics, which production never has, SQLite takes `tenant_code = ?` for about
// ten rows, so it plans `tenant_code = ? AND x IN (…more than a few…)` through an index on the tenant
// alone and walks every row of the tenant: a page then costs more the bigger the tenant (#247). Every
// `IN` read a list page sends must start from a key instead (lesson 2026-10-25: EXPLAIN the query
// MikroORM sends). A join starts from one table's walk whatever the other table's indexes, so such a
// read becomes single-table reads (#257).

/** An index used on the tenant alone, as `explain query plan` shows it. */
const TENANT_WALK = /USING (?:COVERING )?INDEX (\S+) \(tenant_code=\?\)/g;
/** The material and location with the most movements, so the ledger page holds several kinds of source document. */
async function busiestPair({ em }: Cradle): Promise<{ material: string; location: string }> {
  const counts = new Map<string, number>();
  for (const { material, location } of await em.find(StockMovement, {}, { populate: ["material", "location"] })) {
    const key = `${material.code} ${location.code}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [material, location] = [...counts].sort(([, a], [, b]) => b - a)[0]![0].split(" ");
  return { material: material!, location: location! };
}

/** The production order with the most completions, so its completions page reads more than one completion's lines. */
async function busiestOrder({ em }: Cradle): Promise<string> {
  const counts = new Map<string, number>();
  for (const { order } of await em.find(ProductionCompletion, {}, { populate: ["order"] })) counts.set(order.code, (counts.get(order.code) ?? 0) + 1);
  return [...counts].sort(([, a], [, b]) => b - a)[0]![0];
}

/**
 * Every movement of the tenant, so the ledger reads each kind of source document by more IDs than
 * SQLite's guess for a tenant, plus transfer postings, which the Test dataset has none of: a plan
 * needs no rows.
 */
async function everySource({ em }: Cradle): Promise<Pick<StockMovement, "type" | "postingId">[]> {
  const transfers = Array.from({ length: 20 }, () => ({ type: TRANSFER_DISPATCH_MOVEMENT, postingId: randomUUID() }));
  return [...(await em.find(StockMovement, {})), ...transfers];
}

/** Runs MRP over the tenant, so the report has a page of plans to name. */
async function mrpRun({ em, mrpRunService }: Cradle): Promise<void> {
  await inRequestTransaction(em, () => mrpRunService.run({ userId: "planner-id", username: "planner", sessionId: null, channel: "ui", token: null }));
}

describe("a list page's IN reads", () => {
  const queries: { sql: string; params: readonly unknown[] }[] = [];
  let orm: Orm;
  let cradle: Cradle;

  beforeAll(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-list-page-reads-")) });
    await migrate(toDbOptions(config));
    orm = await initOrm(toDbOptions(config), { onQuery: (sql, params) => (queries.push({ sql, params }), sql) });
    const container = createAppContainer(config, orm);
    await seedTestTenantDataset((await scopeForTenant(container, "test")).cradle, new Date("2026-10-21T10:00:00.000Z"));
    cradle = (await scopeForTenant(container, "test")).cradle;
  }, 60_000);
  afterAll(async () => {
    await orm.close();
  });

  it.each<[string, (cradle: Cradle) => Promise<unknown>]>([
    ["purchase orders", (c) => c.purchaseOrderService.list()],
    ["customer orders", (c) => c.customerOrderService.list()],
    ["shipments", (c) => c.shipmentService.list()],
    ["goods receipts", (c) => c.goodsReceiptService.list()],
    ["goods issues", (c) => c.goodsIssueService.list()],
    ["production completions", async (c) => c.productionCompletionService.list(await busiestOrder(c))],
    ["the variance report", (c) => c.varianceReportService.read({})],
    ["the audit's reversal links", async (c) => c.auditService.reversalLinks((await c.em.find(StockMovement, {}, { limit: 100 })).map(({ id }) => id))],
    ["the stock ledger", async (c) => c.stockService.get(await busiestPair(c))],
    ["the stock ledger's sources, of every kind", async (c) => movementSources(c.em, await everySource(c))],
    // The Test dataset's 30 planned materials: a page names 25 of them, more IDs than SQLite's guess for a tenant.
    ["the MRP report's names", async (c) => (await mrpRun(c), c.mrpRunService.latest({}))],
  ])("%s start every IN read from a key, never from the tenant alone", async (_name, read) => {
    queries.length = 0;
    await read(cradle);
    const reads = queries.filter(({ sql }) => sql.startsWith("select") && sql.includes(" in ("));
    expect(reads.length).toBeGreaterThan(0);
    const walks = new Set<string>();
    for (const { sql, params } of reads) {
      const plan = await orm.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${sql}`, [...params]);
      for (const { detail } of plan) for (const [, index] of detail.matchAll(TENANT_WALK)) walks.add(index!);
    }
    expect([...walks]).toEqual([]);
  });
});
