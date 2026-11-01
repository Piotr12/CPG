import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initOrm } from "./orm";

const MIGRATION = "Migration20261101075151_mrp_acceptance";
const tempDatabase = () => path.join(mkdtempSync(path.join(tmpdir(), "cpg-mrp-acceptance-migration-")), "cpg.sqlite");

describe("MRP acceptance migration (#287)", () => {
  it("adds the two nullable columns to populated tables without rebuilding them, takes old-style inserts, and drops them on the way down", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    const sql = (query: string) => orm.em.getConnection().execute(query);
    const columnsOf = async (table: string) => (await sql(`pragma table_info(${table})`)).map(({ name }) => name as string);
    // An image without the columns writes rows that name none of them.
    const requisition = (id: string, code: string) =>
      sql(`insert into purchase_requisition (id, tenant_code, code, material_id, location_id, quantity, entered_quantity, entered_unit, numerator,
          denominator, required_date, converted, abandoned, status, created_at, version)
        values ('${id}', 'prod', '${code}', 'm1', 'l1', '10.000000', '10', 'kg', '1', '1', '2026-11-05', '0.000000', '0.000000', 'open', 0, 1)`);
    const recommendation = (id: string, date: string) =>
      sql(`insert into mrp_recommendation (id, tenant_code, run_id, material, location, kind, need_date, quantity)
        values ('${id}', 'prod', 'r1', '00000001', '00000001', 'purchase-requisition', '${date}', '10.000000')`);
    try {
      await orm.migrator.up({ to: "Migration20261101053705_mrp_recommendations" });
      // The rows reference masters and a run this test doesn't create.
      await sql("pragma foreign_keys = off");
      await requisition("q1", "00000001");
      await recommendation("p1", "2026-11-05");
      const before = await sql("select sql from sqlite_master where name in ('purchase_requisition', 'mrp_recommendation') order by name");

      await orm.migrator.up({ to: MIGRATION });

      expect(await sql("select code, mrp_run from purchase_requisition")).toEqual([{ code: "00000001", mrp_run: null }]);
      expect(await sql("select id, accepted_document from mrp_recommendation")).toEqual([{ id: "p1", accepted_document: null }]);
      // Altered in place: SQLite writes an added column after the last one, before the table constraints, and keeps the rest verbatim.
      const added = ["`accepted_document` text null", "`mrp_run` text null"];
      const after = await sql("select sql from sqlite_master where name in ('purchase_requisition', 'mrp_recommendation') order by name");
      expect(after.map(({ sql: text }) => text)).toEqual(before.map(({ sql: text }, index) => (text as string).replace(", constraint", `, ${added[index]}, constraint`)));
      await requisition("q2", "00000002");
      await recommendation("p2", "2026-11-06");
      expect(await sql("select code, mrp_run from purchase_requisition order by code")).toEqual([{ code: "00000001", mrp_run: null }, { code: "00000002", mrp_run: null }]);
      await sql("update purchase_requisition set mrp_run = '00000004' where id = 'q2'");
      await sql("update mrp_recommendation set accepted_document = '00000002' where id = 'p2'");

      // The later migrations (the lead time column, #279, and MRP run exceptions, #280) complete the schema the entities declare.
      await orm.migrator.up();
      expect(await orm.schema.getUpdateSchemaSQL()).not.toMatch(/`(purchase_requisition|mrp_recommendation)`/);

      // Back to this migration, then through it: the later ones go first.
      await orm.migrator.down({ to: MIGRATION });
      await orm.migrator.down();

      expect(await columnsOf("purchase_requisition")).not.toContain("mrp_run");
      expect(await columnsOf("mrp_recommendation")).not.toContain("accepted_document");
      expect(await sql("select code from purchase_requisition order by code")).toEqual([{ code: "00000001" }, { code: "00000002" }]);
      expect(await sql("select id from mrp_recommendation order by id")).toEqual([{ id: "p1" }, { id: "p2" }]);
    } finally {
      await orm.close();
    }
  });
});
