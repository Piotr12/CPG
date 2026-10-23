import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { migrations } from "./migrations";
import { initOrm } from "./orm";

const MIGRATION = "Migration20261023201801_shipment_edit_cancel";

it("upgrades populated shipments in place: statuses, lines and goods issues kept, versions and line counters backfilled, the wider check enforced, then rolls back", async () => {
  const orm = await initOrm({ databasePath: path.join(mkdtempSync(path.join(tmpdir(), "cpg-shipment-edit-")), "db.sqlite") });
  const sql = (query: string, params: (string | number)[] = []) => orm.em.getConnection().execute(query, params);
  try {
    await orm.migrator.up({ migrations: migrations.map(({ name }) => name).filter((name) => name !== MIGRATION) });
    await sql("insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('m1', 'test', '00000001', 'raw', 'x', 'each', 0)");
    await sql("insert into location (id, tenant_code, code, name, created_at) values ('l1', 'test', '00000001', 'Plant', 0)");
    await sql("insert into customer (id, tenant_code, code, name, created_at) values ('c1', 'test', '00000001', 'Acme', 0)");
    await sql("insert into customer_order (id, tenant_code, code, customer_id, location_id, created_at, updated_at, version) values ('co1', 'test', '00000001', 'c1', 'l1', 0, 0, 1)");
    await sql("insert into customer_order_line (id, tenant_code, order_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date, fulfilled) values ('ol1', 'test', 'co1', 0, 'm1', '100.000000', '100', 'each', '1', '1', '2026-11-02', '30.000000')");
    await sql("insert into shipment (id, tenant_code, code, order_id, planned_date, status, created_at) values ('s1', 'test', '00000001', 'co1', '2026-11-01', 'open', 1700000000000), ('s2', 'test', '00000002', 'co1', '2026-11-02', 'completed', 1700000001000)");
    await sql("insert into shipment_line (id, tenant_code, shipment_id, position, order_line_id, quantity, entered_quantity, entered_unit, numerator, denominator, issued) values ('sl1', 'test', 's1', 0, 'ol1', '50.000000', '50', 'each', '1', '1', '20.000000'), ('sl2', 'test', 's1', 2, 'ol1', '5.000000', '5', 'each', '1', '1', '0.000000'), ('sl3', 'test', 's2', 0, 'ol1', '10.000000', '10', 'each', '1', '1', '10.000000')");
    await sql("insert into goods_issue (id, tenant_code, code, shipment_id, business_date, created_at) values ('g1', 'test', '00000001', 's1', '2026-10-20', 0)");
    await sql("insert into goods_issue_line (id, tenant_code, issue_id, position, shipment_line_id, quantity, entered_quantity, entered_unit, numerator, denominator) values ('gl1', 'test', 'g1', 0, 'sl1', '20.000000', '20', 'each', '1', '1')");
    const lines = await sql("select * from shipment_line order by id");
    const issues = await sql("select * from goods_issue_line");

    await orm.migrator.up();
    expect(await sql("select id, status, version, next_line, updated_at = created_at as touched from shipment order by id")).toEqual([
      { id: "s1", status: "open", version: 1, next_line: 3, touched: 1 },
      { id: "s2", status: "completed", version: 1, next_line: 1, touched: 1 },
    ]);
    expect(await sql("select * from shipment_line order by id")).toEqual(lines);
    expect(await sql("select * from goods_issue_line")).toEqual(issues);
    expect(await sql("pragma foreign_key_check")).toEqual([]);
    await sql("update shipment set status = 'cancelled' where id = 's1'");
    await expect(sql("update shipment set status = 'closed-early' where id = 's2'")).rejects.toThrow(/CHECK constraint failed/);
    // A row an older release inserts gets every new column's default.
    await sql("insert into shipment (id, tenant_code, code, order_id, planned_date, created_at) values ('s3', 'test', '00000003', 'co1', '2026-11-03', 5)");
    expect(await sql("select status, version, next_line, updated_at from shipment where id = 's3'")).toEqual([{ status: "open", version: 1, next_line: 0, updated_at: 0 }]);
    // The schema that ran is the one the entities declare.
    expect(await orm.schema.getUpdateSchemaSQL()).not.toMatch(/shipment/);

    await orm.migrator.down();
    expect((await orm.em.getConnection().execute<{ name: string }[]>("select name from pragma_table_info('shipment')")).map(({ name }) => name).sort()).toEqual(
      ["code", "created_at", "id", "order_id", "planned_date", "status", "tenant_code"],
    );
    expect(await sql("select id, status from shipment order by id")).toEqual([
      { id: "s1", status: "open" },
      { id: "s2", status: "completed" },
      { id: "s3", status: "open" },
    ]);
    await expect(sql("update shipment set status = 'cancelled' where id = 's1'")).rejects.toThrow(/CHECK constraint failed/);
    expect(await sql("select * from shipment_line order by id")).toEqual(lines);
    expect(await sql("pragma foreign_key_check")).toEqual([]);
  } finally {
    await orm.close();
  }
});
