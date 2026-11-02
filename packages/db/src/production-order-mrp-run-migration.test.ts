import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProductionOrder } from "./entities";
import { selectTenant } from "./entities/tenants/tenant-owned";
import { migrations } from "./migrations";
import { initOrm } from "./orm";

const MIGRATION = "Migration20261102131251_production_order_mrp_run";
const tempDatabase = () => path.join(mkdtempSync(path.join(tmpdir(), "cpg-production-order-mrp-run-migration-")), "cpg.sqlite");

describe("Production order MRP run migration (#320)", () => {
  it("adds `mrp_run` in place to populated orders, reads older rows and older-style inserts as entered by hand, and drops it on the way down", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    const sql = (query: string) => orm.em.getConnection().execute(query);
    const columns = async () => (await sql("select name from pragma_table_info('production_order')")).map(({ name }) => name as string);
    // A previous image's insert names no run.
    const order = (id: string, code: string) =>
      sql(`insert into production_order (id, tenant_code, code, output_id, location_id, recipe_id, quantity, entered_quantity, entered_unit, numerator,
          denominator, planned_start, planned_finish, lead_time_days, produced, abandoned, status, created_at, updated_at, version)
        values ('${id}', 'prod', '${code}', 'm1', 'l1', 'r1', '10.000000', '10', 'kg', '1', '1', '2026-11-03', '2026-11-05', 2, '0.000000', '0.000000', 'open', 0, 0, 1)`);
    try {
      await orm.migrator.up({ migrations: migrations.map(({ name }) => name).filter((name) => name !== MIGRATION) });
      // The rows reference masters and a revision this test doesn't create.
      await sql("pragma foreign_keys = off");
      await order("o1", "00000001");
      const table = (await sql("select sql from sqlite_master where name = 'production_order'"))[0].sql as string;

      await orm.migrator.up();
      await order("o2", "00000002");
      await sql("update production_order set mrp_run = '00000004' where id = 'o2'");

      // Altered in place, not rebuilt, so `production_completion`'s references are untouched: the definition only gains the column.
      const altered = (await sql("select sql from sqlite_master where name = 'production_order'"))[0].sql as string;
      expect(altered).toBe(table.replace(", constraint", ", `mrp_run` text null, constraint"));
      expect(await orm.schema.getUpdateSchemaSQL()).not.toContain("`production_order`");
      expect(await sql("select code, mrp_run from production_order order by code")).toEqual([
        { code: "00000001", mrp_run: null },
        { code: "00000002", mrp_run: "00000004" },
      ]);
      // Through the entity, as the service reads it: an order from before reads as entered by hand.
      const em = orm.em.fork();
      selectTenant(em, "prod");
      const read = await em.find(ProductionOrder, {}, { orderBy: { code: "asc" }, fields: ["code", "mrpRun"] });
      expect(read.map(({ code, mrpRun }) => ({ code, mrpRun: mrpRun ?? null }))).toEqual([
        { code: "00000001", mrpRun: null },
        { code: "00000002", mrpRun: "00000004" },
      ]);

      await orm.migrator.down();
      expect(await columns()).not.toContain("mrp_run");
      expect(await sql("select code from production_order order by code")).toEqual([{ code: "00000001" }, { code: "00000002" }]);
    } finally {
      await orm.close();
    }
  });
});
