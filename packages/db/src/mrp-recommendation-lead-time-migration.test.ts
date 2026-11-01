import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { migrations } from "./migrations";
import { initOrm } from "./orm";

const MIGRATION = "Migration20261101075645_mrp_recommendation_lead_time";
const tempDatabase = () => path.join(mkdtempSync(path.join(tmpdir(), "cpg-mrp-lead-time-migration-")), "cpg.sqlite");

describe("MRP recommendation lead time migration (#279)", () => {
  it("adds the column in place to populated recommendations, defaults older rows and older-style inserts to 0, and drops it on the way down", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    const sql = (query: string) => orm.em.getConnection().execute(query);
    const columns = async () => (await sql("select name from pragma_table_info('mrp_recommendation')")).map(({ name }) => name as string).sort();
    // A previous image's insert names no lead time.
    const recommendation = (id: string, needDate: string) =>
      sql(`insert into mrp_recommendation (id, tenant_code, run_id, material, location, kind, need_date, quantity)
        values ('${id}', 'test', 'r1', '00000001', '00000001', 'purchase-requisition', '${needDate}', '10.000000')`);
    try {
      await orm.migrator.up({ migrations: migrations.map(({ name }) => name).filter((name) => name !== MIGRATION) });
      await sql(`insert into mrp_run (id, tenant_code, code, created_at, start_date, horizon_days, mode, generation, pairs, actor_user_id, actor_username, channel)
        values ('r1', 'test', '00000001', 0, '2026-11-01', 90, 'manual', 1, 1, 'u1', 'anna', 'ui')`);
      await recommendation("p1", "2026-11-05");
      const table = (await sql("select sql from sqlite_master where name = 'mrp_recommendation'"))[0].sql as string;

      await orm.migrator.up();
      expect(await sql("select id, need_date, quantity, lead_time_days from mrp_recommendation")).toEqual([
        { id: "p1", need_date: "2026-11-05", quantity: "10.000000", lead_time_days: 0 },
      ]);
      await recommendation("p2", "2026-11-06");
      await sql("insert into mrp_recommendation (id, tenant_code, run_id, material, location, kind, need_date, quantity, lead_time_days) values ('p3', 'test', 'r1', '00000002', '00000001', 'production-order', '2026-11-06', '1.000000', 7)");
      expect(await sql("select id, lead_time_days from mrp_recommendation order by id")).toEqual([
        { id: "p1", lead_time_days: 0 },
        { id: "p2", lead_time_days: 0 },
        { id: "p3", lead_time_days: 7 },
      ]);
      await expect(sql("update mrp_recommendation set lead_time_days = null where id = 'p3'")).rejects.toThrow(/NOT NULL constraint failed/);
      // Altered in place, not rebuilt: the table's own definition gains only the column, its cascade kept.
      const altered = (await sql("select sql from sqlite_master where name = 'mrp_recommendation'"))[0].sql as string;
      // SQLite writes an added column after the last one, before the table constraints (after #287's `accepted_document`).
      expect(altered).toBe(table.replace(", constraint", ", `lead_time_days` integer not null default 0, constraint"));
      expect(altered).toContain("on delete cascade");
      expect(await orm.schema.getUpdateSchemaSQL()).not.toContain("`mrp_recommendation`");

      await orm.migrator.down();
      expect(await columns()).not.toContain("lead_time_days");
      expect(await sql("select id from mrp_recommendation order by id")).toEqual([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);
    } finally {
      await orm.close();
    }
  });
});
