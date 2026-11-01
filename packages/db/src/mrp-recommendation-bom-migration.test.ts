import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { migrations } from "./migrations";
import { initOrm } from "./orm";

const MIGRATION = "Migration20261101112824_mrp_recommendation_bom";
const tempDatabase = () => path.join(mkdtempSync(path.join(tmpdir(), "cpg-mrp-recommendation-bom-migration-")), "cpg.sqlite");

describe("MRP recommendation BOM migration (#281)", () => {
  it("adds both columns in place to populated recommendations, leaves older rows and older-style inserts null, and drops them on the way down", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    const sql = (query: string) => orm.em.getConnection().execute(query);
    const columns = async () => (await sql("select name from pragma_table_info('mrp_recommendation')")).map(({ name }) => name as string).sort();
    // A previous image's insert names no BOM.
    const recommendation = (id: string, needDate: string) =>
      sql(`insert into mrp_recommendation (id, tenant_code, run_id, material, location, kind, need_date, quantity, lead_time_days)
        values ('${id}', 'test', 'r1', '00000001', '00000001', 'production-order', '${needDate}', '10.000000', 2)`);
    try {
      await orm.migrator.up({ migrations: migrations.map(({ name }) => name).filter((name) => name !== MIGRATION) });
      await sql(`insert into mrp_run (id, tenant_code, code, created_at, start_date, horizon_days, mode, generation, pairs, actor_user_id, actor_username, channel)
        values ('r1', 'test', '00000001', 0, '2026-11-01', 90, 'manual', 1, 1, 'u1', 'anna', 'ui')`);
      await recommendation("p1", "2026-11-05");
      const table = (await sql("select sql from sqlite_master where name = 'mrp_recommendation'"))[0].sql as string;

      await orm.migrator.up();
      expect(await sql("select id, quantity, lead_time_days, bom, bom_revision from mrp_recommendation")).toEqual([
        { id: "p1", quantity: "10.000000", lead_time_days: 2, bom: null, bom_revision: null },
      ]);
      await recommendation("p2", "2026-11-06");
      await sql(`insert into mrp_recommendation (id, tenant_code, run_id, material, location, kind, need_date, quantity, lead_time_days, bom, bom_revision)
        values ('p3', 'test', 'r1', '00000002', '00000001', 'production-order', '2026-11-06', '1.000000', 7, '00000004', 2)`);
      expect(await sql("select id, bom, bom_revision from mrp_recommendation order by id")).toEqual([
        { id: "p1", bom: null, bom_revision: null },
        { id: "p2", bom: null, bom_revision: null },
        { id: "p3", bom: "00000004", bom_revision: 2 },
      ]);
      // Altered in place, not rebuilt: the table's own definition gains only the two columns, its cascade kept.
      const altered = (await sql("select sql from sqlite_master where name = 'mrp_recommendation'"))[0].sql as string;
      expect(altered).toBe(table.replace(", constraint", ", `bom` text null, `bom_revision` integer null, constraint"));
      expect(altered).toContain("on delete cascade");
      expect(await orm.schema.getUpdateSchemaSQL()).not.toContain("`mrp_recommendation`");

      await orm.migrator.down();
      expect(await columns()).not.toContain("bom");
      expect(await columns()).not.toContain("bom_revision");
      expect(await sql("select id from mrp_recommendation order by id")).toEqual([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);
    } finally {
      await orm.close();
    }
  });
});
