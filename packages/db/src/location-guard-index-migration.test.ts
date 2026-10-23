import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CustomerOrder, PurchaseOrder, PurchaseRequisition, selectTenant } from "./entities";
import { migrations } from "./migrations";
import { initOrm } from "./orm";

const tempDatabase = () => path.join(mkdtempSync(path.join(tmpdir(), "cpg-location-guard-index-")), "cpg.sqlite");
const MIGRATION = "Migration20261023101022_location_guard_indexes";
const INDEXES = {
  purchase_order: "purchase_order_tenant_code_location_id_status_code_index",
  purchase_requisition: "purchase_requisition_tenant_code_location_id_status_code_index",
  customer_order: "customer_order_tenant_code_location_id_status_code_index",
};
const indexNames = Object.values(INDEXES).sort();
const documents = ["purchase_order", "purchase_requisition", "customer_order"].map((table) => `select * from ${table} order by id`);

describe("location guard index migration", () => {
  it("adds the guard indexes to a populated database without touching its documents, and drops them on the way down", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    const sql = (query: string, params: unknown[] = []) => orm.em.getConnection().execute(query, params);
    const guardIndexes = async () =>
      (await sql("select name from sqlite_master where type = 'index' and name like '%_location_id_status_code_index' order by name")).map(({ name }) => name);
    try {
      await orm.migrator.up({ migrations: migrations.map(({ name }) => name).filter((name) => name !== MIGRATION) });
      await sql("insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('m1', 'test', '00000001', 'raw', 'x', 'each', 0)");
      await sql("insert into location (id, tenant_code, code, name, created_at) values ('l1', 'test', '00000001', 'Plant', 0)");
      await sql("insert into supplier (id, tenant_code, code, name, created_at) values ('s1', 'test', '00000001', 'Acme', 0)");
      await sql("insert into customer (id, tenant_code, code, name, created_at) values ('c1', 'test', '00000001', 'Acme', 0)");
      await sql("insert into purchase_order (id, tenant_code, code, supplier_id, location_id, created_at, updated_at) values ('o1', 'test', '00000001', 's1', 'l1', 0, 0)");
      await sql(
        "insert into purchase_requisition (id, tenant_code, code, material_id, location_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date, converted, created_at) values ('r1', 'test', '00000001', 'm1', 'l1', '100.000000', '100', 'each', '1', '1', '2026-11-02', '0.000000', 0)",
      );
      await sql("insert into customer_order (id, tenant_code, code, customer_id, location_id, created_at, updated_at, version) values ('co1', 'test', '00000001', 'c1', 'l1', 0, 0, 1)");
      const before = await Promise.all(documents.map((query) => sql(query)));
      expect(await guardIndexes()).toEqual([]);

      await orm.migrator.up();
      expect(await guardIndexes()).toEqual(indexNames);
      expect(await Promise.all(documents.map((query) => sql(query)))).toEqual(before);

      await orm.migrator.down();
      expect(await guardIndexes()).toEqual([]);
      expect(await Promise.all(documents.map((query) => sql(query)))).toEqual(before);
    } finally {
      await orm.close();
    }
  });

  it.each([
    ["purchase_order", PurchaseOrder],
    ["purchase_requisition", PurchaseRequisition],
    ["customer_order", CustomerOrder],
  ] as const)("finds the lowest Open %s at a location from its guard index, without a temporary sort", async (table, entity) => {
    const queries: { sql: string; params: readonly unknown[] }[] = [];
    const orm = await initOrm({ databasePath: tempDatabase() }, { onQuery: (sql, params) => (queries.push({ sql, params }), sql) });
    try {
      await orm.migrator.up();
      const em = orm.em.fork();
      selectTenant(em, "prod");
      queries.length = 0;
      // The guards' own query (`assertNoPurchasingAtLocation`, `assertNoCustomerOrdersAtLocation`).
      expect(await em.findOne(entity, { location: "l1", status: "open" }, { orderBy: { code: "asc" } })).toBeNull();
      expect(queries).toHaveLength(1);
      const [{ sql, params }] = queries;
      expect(sql).toMatch(/`tenant_code` = \?/);
      const plan = (await orm.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${sql}`, [...params]))
        .map(({ detail }) => detail)
        .join(" ");
      expect(plan).toContain(`USING INDEX ${INDEXES[table]} (tenant_code=? AND location_id=? AND status=?)`);
      expect(plan).not.toContain("TEMP B-TREE");
    } finally {
      await orm.close();
    }
  });
});
