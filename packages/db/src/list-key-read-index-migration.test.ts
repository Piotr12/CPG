import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CustomerOrderLine, GoodsIssue, GoodsReceipt, ProductionCompletion, selectTenant, ShipmentLine, TransferPosting } from "./entities";
import { migrations } from "./migrations";
import { initOrm, type Orm } from "./orm";

const tempDatabase = () => path.join(mkdtempSync(path.join(tmpdir(), "cpg-list-key-read-index-")), "cpg.sqlite");
const MIGRATION = "Migration20261025180850_list_key_read_indexes";
/** Each table and the column after `tenant_code` in its new index. */
const INDEXED = [
  ["goods_issue", "id"],
  ["goods_receipt", "id"],
  ["production_completion", "id"],
  ["shipment_line", "order_line_id"],
  ["transfer_posting", "id"],
] as const;
const INDEXES = INDEXED.map(([table, column]) => `${table}_tenant_code_${column}_index`);
/** More keys than the ten rows SQLite guesses for `tenant_code = ?` without ANALYZE statistics. */
const keys = () => Array.from({ length: 20 }, () => randomUUID());

describe("list key read index migration", () => {
  it("adds the five tenant-led indexes, keeps the schema in sync, and drops them on the way down", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    const sql = (query: string) => orm.em.getConnection().execute(query);
    const indexes = async () =>
      (await sql("select name from sqlite_master where type = 'index'")).filter(({ name }) => INDEXES.includes(name)).map(({ name }) => name).sort();
    try {
      await orm.migrator.up({ migrations: migrations.map(({ name }) => name).filter((name) => name !== MIGRATION) });
      expect(await indexes()).toEqual([]);

      await orm.migrator.up();
      expect(await indexes()).toEqual(INDEXES);
      expect((await sql("select sql from sqlite_master where name = 'shipment_line_tenant_code_order_line_id_index'"))[0].sql).toBe(
        "CREATE INDEX `shipment_line_tenant_code_order_line_id_index` on `shipment_line` (`tenant_code`, `order_line_id`)",
      );
      // The indexes that ran are the ones the entities declare.
      const diff = await orm.schema.getUpdateSchemaSQL();
      for (const [table] of INDEXED) expect(diff).not.toContain(`\`${table}\``);

      await orm.migrator.down();
      expect(await indexes()).toEqual([]);
    } finally {
      await orm.close();
    }
  });

  it.each<[string, (em: Orm["em"]) => Promise<unknown>]>([
    ["goods_issue_tenant_code_id_index", (em) => em.find(GoodsIssue, { id: { $in: keys() } })],
    ["goods_receipt_tenant_code_id_index", (em) => em.find(GoodsReceipt, { id: { $in: keys() } })],
    ["production_completion_tenant_code_id_index", (em) => em.find(ProductionCompletion, { id: { $in: keys() } })],
    ["shipment_line_tenant_code_order_line_id_index", (em) => em.find(ShipmentLine, { orderLine: { $in: keys().map((id) => em.getReference(CustomerOrderLine, id)) } })],
    ["transfer_posting_tenant_code_id_index", (em) => em.find(TransferPosting, { id: { $in: keys() } })],
  ])("starts a read by twenty keys from %s, never from the tenant alone", async (index, read) => {
    const queries: { sql: string; params: readonly unknown[] }[] = [];
    const orm = await initOrm({ databasePath: tempDatabase() }, { onQuery: (sql, params) => (queries.push({ sql, params }), sql) });
    try {
      await orm.migrator.up();
      const em = orm.em.fork();
      selectTenant(em, "prod");
      queries.length = 0;
      expect(await read(em)).toEqual([]);
      expect(queries).toHaveLength(1);
      const [{ sql, params }] = queries;
      const plan = (await orm.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${sql}`, [...params])).map(({ detail }) => detail);
      expect(plan[0]).toMatch(new RegExp(`^SEARCH \\w+ USING (COVERING )?INDEX ${index} \\(tenant_code=\\? AND \\w+=\\?\\)$`));
    } finally {
      await orm.close();
    }
  });
});
