import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { initOrm } from "./orm";

it("upgrades populated documents without losing receipt references and backfills exact line progress, then rolls back", async () => {
  const orm = await initOrm({ databasePath: path.join(mkdtempSync(path.join(tmpdir(), "cpg-lifecycle-")), "db.sqlite") });
  const sql = (query: string, params: (string | number)[] = []) => orm.em.getConnection().execute(query, params);
  try {
    await orm.migrator.up({ to: "Migration20261020223625_production_completions" });
    await sql("insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('m1', 'test', '00000001', 'raw', 'Material', 'each', 0)");
    await sql("insert into location (id, tenant_code, code, name, created_at) values ('l1', 'test', '00000001', 'Source', 0), ('l2', 'test', '00000002', 'Destination', 0)");
    await sql("insert into supplier (id, tenant_code, code, name, created_at) values ('s1', 'test', '00000001', 'Supplier', 0)");
    await sql("insert into purchase_requisition (id, tenant_code, code, material_id, location_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date, converted, created_at) values ('r1', 'test', '00000001', 'm1', 'l1', '100.000000', '100', 'each', '1', '1', '2026-11-02', '60.000000', 0)");
    await sql("insert into purchase_order (id, tenant_code, code, supplier_id, location_id, created_at, updated_at) values ('o1', 'test', '00000001', 's1', 'l1', 0, 0)");
    const quantities = [["100.000000", "40.000000"], ["100.000000", "100.000000"], ["100.000000", "101.000000"],
      ["999999999999.999999", "999999999999.999998"]];
    for (const [index, [quantity, received]] of quantities.entries()) {
      await sql("insert into purchase_order_line (id, tenant_code, order_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_date, requisition_id, received) values (?, 'test', 'o1', ?, 'm1', ?, ?, 'each', '1', '1', '2026-11-02', 'r1', ?)",
        [`ol${index + 1}`, index + 1, quantity, quantity, received]);
    }
    await sql("insert into goods_receipt (id, tenant_code, code, order_id, business_date, created_at) values ('g1', 'test', '00000001', 'o1', '2026-10-20', 0)");
    await sql("insert into goods_receipt_line (id, tenant_code, receipt_id, position, order_line_id, quantity, entered_quantity, entered_unit, numerator, denominator) values ('gl1', 'test', 'g1', 1, 'ol1', '40.000000', '40', 'each', '1', '1')");
    await sql("insert into transfer (id, tenant_code, code, material_id, source_id, destination_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_dispatch, planned_arrival, created_at, updated_at) values ('t1', 'test', '00000001', 'm1', 'l1', 'l2', '100.000000', '100', 'each', '1', '1', '2026-10-21', '2026-10-23', 0, 0)");
    const history = await sql("select * from goods_receipt_line");

    await orm.migrator.up();
    expect(await sql("select status, abandoned from purchase_order_line order by position")).toEqual([
      { status: "open", abandoned: "0.000000" }, { status: "completed", abandoned: "0.000000" },
      { status: "completed", abandoned: "0.000000" }, { status: "open", abandoned: "0.000000" },
    ]);
    expect(await sql("select abandoned, converted from purchase_requisition")).toEqual([{ abandoned: "0.000000", converted: "60.000000" }]);
    expect(await sql("select abandoned from transfer")).toEqual([{ abandoned: "0.000000" }]);
    expect(await sql("select * from goods_receipt_line")).toEqual(history);
    expect(await sql("pragma foreign_key_check")).toEqual([]);
    expect(await orm.schema.getUpdateSchemaSQL()).not.toMatch(/purchase_order_line|purchase_requisition|transfer/);

    await orm.migrator.down();
    expect((await sql("pragma table_info(purchase_order_line)")).map((column: { name: string }) => column.name)).not.toContain("abandoned");
    expect(await sql("select * from goods_receipt_line")).toEqual(history);
    expect(await sql("select quantity, received from purchase_order_line order by position")).toEqual(quantities.map(([quantity, received]) => ({ quantity, received })));
    expect(await sql("pragma foreign_key_check")).toEqual([]);
  } finally {
    await orm.close();
  }
});
