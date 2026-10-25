import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, migrate, ProductionOrder, StockMovement, type Orm } from "@cpg/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { createAppContainer } from "../container/container";
import type { Cradle } from "../container/cradle";
import { scopeForTenant } from "../container/tenant-scope";
import { toDbOptions } from "../database";
import { seedTestTenantDataset } from "./demo/seed-demo-data";

// Without ANALYZE statistics, which production never has, SQLite takes `tenant_code = ?` for about
// ten rows, so it plans `tenant_code = ? AND x IN (…more than a few…)` through an index on the tenant
// alone and walks every row of the tenant: a page then costs more the bigger the tenant (#247). Every
// `IN` read a list page sends must start from a key instead (lesson 2026-10-25: EXPLAIN the query
// MikroORM sends).

/** An index used on the tenant alone, as `explain query plan` shows it. */
const TENANT_WALK = /USING (?:COVERING )?INDEX (\S+) \(tenant_code=\?\)/g;
/**
 * The walks still left, each a follow-up of #247 (#257): the customer-order page's posted-line
 * check joins `goods_issue_line` to `shipment_line`, and SQLite starts the join from the goods issue
 * lines; the variance report reads its materials by `id IN`, from a master table small next to the documents.
 */
const KNOWN_WALKS: Record<string, string[]> = {
  "customer orders": ["goods_issue_line_tenant_code_index"],
  "the variance report": ["material_tenant_code_index"],
};

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
    ["production completions", async (c) => c.productionCompletionService.list((await c.em.find(ProductionOrder, {}, { limit: 1 }))[0]!.code)],
    ["the variance report", (c) => c.varianceReportService.read({})],
    ["the audit's reversal links", async (c) => c.auditService.reversalLinks((await c.em.find(StockMovement, {}, { limit: 100 })).map(({ id }) => id))],
  ])("%s start every IN read from a key, never from the tenant alone", async (name, read) => {
    queries.length = 0;
    await read(cradle);
    const reads = queries.filter(({ sql }) => sql.startsWith("select") && sql.includes(" in ("));
    expect(reads.length).toBeGreaterThan(0);
    const walks = new Set<string>();
    for (const { sql, params } of reads) {
      const plan = await orm.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${sql}`, [...params]);
      for (const { detail } of plan) for (const [, index] of detail.matchAll(TENANT_WALK)) walks.add(index!);
    }
    expect([...walks].sort()).toEqual(KNOWN_WALKS[name] ?? []);
  });
});
