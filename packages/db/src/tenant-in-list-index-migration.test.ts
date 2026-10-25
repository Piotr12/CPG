import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PurchaseOrder, PurchaseOrderLine, selectTenant } from "./entities";
import { migrations } from "./migrations";
import { initOrm } from "./orm";

const tempDatabase = () => path.join(mkdtempSync(path.join(tmpdir(), "cpg-tenant-in-list-index-")), "cpg.sqlite");
const MIGRATION = "Migration20261025171522_tenant_in_list_indexes";
/** Each table and the column after `tenant_code` in its new index. */
const INDEXED = [
  ["customer_order_line", "order_id"],
  ["goods_issue_line", "issue_id"],
  ["goods_issue_line", "shipment_line_id"],
  ["goods_receipt_line", "order_line_id"],
  ["goods_receipt_line", "receipt_id"],
  ["production_completion_line", "completion_id"],
  ["production_order", "id"],
  ["purchase_order_line", "order_id"],
  ["shipment_line", "shipment_id"],
] as const;
const INDEXES = INDEXED.map(([table, column]) => `${table}_tenant_code_${column}_index`);
const TABLES = [...new Set(INDEXED.map(([table]) => table))];

describe("tenant IN list index migration", () => {
  it("adds the nine tenant-led indexes, keeps the schema in sync, and drops them on the way down", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    const sql = (query: string) => orm.em.getConnection().execute(query);
    const indexes = async () =>
      (await sql("select name from sqlite_master where type = 'index'")).filter(({ name }) => INDEXES.includes(name)).map(({ name }) => name).sort();
    try {
      await orm.migrator.up({ migrations: migrations.map(({ name }) => name).filter((name) => name !== MIGRATION) });
      expect(await indexes()).toEqual([]);

      await orm.migrator.up();
      expect(await indexes()).toEqual(INDEXES);
      expect((await sql("select sql from sqlite_master where name = 'purchase_order_line_tenant_code_order_id_index'"))[0].sql).toBe(
        "CREATE INDEX `purchase_order_line_tenant_code_order_id_index` on `purchase_order_line` (`tenant_code`, `order_id`)",
      );
      // The indexes that ran are the ones the entities declare.
      const diff = await orm.schema.getUpdateSchemaSQL();
      for (const table of TABLES) expect(diff).not.toContain(`\`${table}\``);

      await orm.migrator.down();
      expect(await indexes()).toEqual([]);
    } finally {
      await orm.close();
    }
  });

  it("reads a page's purchase-order lines through the tenant and the order, with more orders than SQLite's guess for a tenant", async () => {
    const queries: { sql: string; params: readonly unknown[] }[] = [];
    const orm = await initOrm({ databasePath: tempDatabase() }, { onQuery: (sql, params) => (queries.push({ sql, params }), sql) });
    try {
      await orm.migrator.up();
      const em = orm.em.fork();
      selectTenant(em, "prod");
      const orders = Array.from({ length: 100 }, (_, i) => em.getReference(PurchaseOrder, `order-${i}`));
      queries.length = 0;
      expect(await em.find(PurchaseOrderLine, { order: { $in: orders } })).toEqual([]);
      expect(queries).toHaveLength(1);
      const [{ sql, params }] = queries;
      const plan = (await orm.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${sql}`, [...params])).map(({ detail }) => detail);
      expect(plan[0]).toBe("SEARCH p0 USING INDEX purchase_order_line_tenant_code_order_id_index (tenant_code=? AND order_id=?)");
    } finally {
      await orm.close();
    }
  });
});
