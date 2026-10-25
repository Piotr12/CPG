import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listSortIndexes } from "./entities/lists/list-sort-indexes";
import { migrations } from "./migrations";
import { initOrm } from "./orm";

const tempDatabase = () => path.join(mkdtempSync(path.join(tmpdir(), "cpg-list-sort-index-")), "cpg.sqlite");
const MIGRATION = "Migration20261025080239_list_sort_indexes";
const SORTED = {
  production_order: ["planned_finish", "planned_start", "status"],
  purchase_order: ["status"],
  purchase_requisition: ["required_date", "status"],
  customer_order: ["status"],
  transfer: ["planned_dispatch", "status"],
};
const TABLES = Object.keys(SORTED);
const INDEXES = Object.entries(SORTED)
  .flatMap(([table, columns]) => columns.flatMap((column) => [`${table}_tenant_code_${column}_code_index`, `${table}_tenant_code_${column}_desc_code_index`]))
  .sort();
const documents = TABLES.map((table) => `select * from ${table} order by id`);

describe("listSortIndexes", () => {
  it("gives each column an ascending and a descending index, both ending in the business ID", () => {
    expect(listSortIndexes("transfer", ["status"])).toEqual([
      { name: "transfer_tenant_code_status_code_index", expression: "create index `transfer_tenant_code_status_code_index` on `transfer` (`tenant_code`, `status`, `code`)" },
      {
        name: "transfer_tenant_code_status_desc_code_index",
        expression: "create index `transfer_tenant_code_status_desc_code_index` on `transfer` (`tenant_code`, `status` desc, `code`)",
      },
    ]);
  });
});

describe("list sort index migration", () => {
  it("adds the 18 sort indexes to a populated database without touching its documents, keeps the schema in sync, and drops them on the way down", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    const sql = (query: string, params: unknown[] = []) => orm.em.getConnection().execute(query, params);
    const indexes = async () =>
      (await sql("select name, sql from sqlite_master where type = 'index'")).filter(({ name }) => INDEXES.includes(name)).map(({ name, sql }) => ({ name, sql }));
    try {
      await orm.migrator.up({ migrations: migrations.map(({ name }) => name).filter((name) => name !== MIGRATION) });
      await sql("insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('m1', 'test', '00000001', 'finished', 'x', 'each', 0)");
      await sql("insert into location (id, tenant_code, code, name, created_at) values ('l1', 'test', '00000001', 'Plant', 0), ('l2', 'test', '00000002', 'Store', 0)");
      await sql("insert into supplier (id, tenant_code, code, name, created_at) values ('s1', 'test', '00000001', 'Acme', 0)");
      await sql("insert into customer (id, tenant_code, code, name, created_at) values ('c1', 'test', '00000001', 'Acme', 0)");
      await sql("insert into bom (id, tenant_code, code, output_id, revision, created_at) values ('b1', 'test', '00000001', 'm1', 1, 0)");
      await sql("insert into bom_revision (id, tenant_code, bom_id, number, priority, valid_from, created_at) values ('r1', 'test', 'b1', 1, 1, '2026-01-01', 0)");
      await sql(
        "insert into production_order (id, tenant_code, code, output_id, location_id, recipe_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_finish, planned_start, lead_time_days, created_at, updated_at) values ('p1', 'test', '00000001', 'm1', 'l1', 'r1', '1.000000', '1', 'each', '1', '1', '2026-11-02', '2026-11-01', 1, 0, 0)",
      );
      await sql("insert into purchase_order (id, tenant_code, code, supplier_id, location_id, created_at, updated_at) values ('o1', 'test', '00000001', 's1', 'l1', 0, 0)");
      await sql(
        "insert into purchase_requisition (id, tenant_code, code, material_id, location_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date, converted, created_at) values ('q1', 'test', '00000001', 'm1', 'l1', '1.000000', '1', 'each', '1', '1', '2026-11-02', '0.000000', 0)",
      );
      await sql("insert into customer_order (id, tenant_code, code, customer_id, location_id, created_at, updated_at) values ('co1', 'test', '00000001', 'c1', 'l1', 0, 0)");
      await sql(
        "insert into transfer (id, tenant_code, code, material_id, source_id, destination_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_dispatch, planned_arrival, created_at, updated_at) values ('t1', 'test', '00000001', 'm1', 'l1', 'l2', '1.000000', '1', 'each', '1', '1', '2026-11-01', '2026-11-02', 0, 0)",
      );
      const before = await Promise.all(documents.map((query) => sql(query)));
      expect(before.map((rows) => rows.length)).toEqual([1, 1, 1, 1, 1]);
      expect(await indexes()).toEqual([]);

      await orm.migrator.up();
      const added = await indexes();
      expect(added.map(({ name }) => name).sort()).toEqual(INDEXES);
      expect(added.find(({ name }) => name === "production_order_tenant_code_planned_finish_desc_code_index")?.sql).toBe(
        "CREATE INDEX `production_order_tenant_code_planned_finish_desc_code_index` on `production_order` (`tenant_code`, `planned_finish` desc, `code`)",
      );
      expect(await Promise.all(documents.map((query) => sql(query)))).toEqual(before);
      // The schema that ran is the one the entities declare: a descending index declared with
      // `columns` instead of an expression would show up here as a drop and a re-create.
      const diff = await orm.schema.getUpdateSchemaSQL();
      for (const table of TABLES) expect(diff).not.toContain(`\`${table}\``);

      await orm.migrator.down();
      expect(await indexes()).toEqual([]);
      expect(await Promise.all(documents.map((query) => sql(query)))).toEqual(before);
    } finally {
      await orm.close();
    }
  });
});
