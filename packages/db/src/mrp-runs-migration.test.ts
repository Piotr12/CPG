import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initOrm } from "./orm";

const tempDatabase = () => path.join(mkdtempSync(path.join(tmpdir(), "cpg-mrp-runs-migration-")), "cpg.sqlite");
const TABLES = ["mrp_daily_result", "mrp_run"];
const FIGURES = Array.from({ length: 13 }, () => "'0.000000'").join(", ");

describe("MRP runs migration", () => {
  it("adds the two tables as the entities declare them, touches no other table, and drops them with rows on the way down", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    const sql = (query: string) => orm.em.getConnection().execute(query);
    const tables = async () =>
      (await sql("select name from sqlite_master where type = 'table'")).map(({ name }) => name as string).filter((name) => TABLES.includes(name)).sort();
    try {
      await orm.migrator.up();
      expect(await tables()).toEqual(TABLES);
      // The tables that ran are the ones the entities declare.
      const diff = await orm.schema.getUpdateSchemaSQL();
      for (const table of TABLES) expect(diff).not.toContain(`\`${table}\``);
      expect((await sql("select sql from sqlite_master where name = 'mrp_daily_result_tenant_code_run_id_material_location_date_unique'"))[0].sql).toBe(
        "CREATE UNIQUE INDEX `mrp_daily_result_tenant_code_run_id_material_location_date_unique` on `mrp_daily_result` (`tenant_code`, `run_id`, `material`, `location`, `date`)",
      );

      await sql(`insert into mrp_run (id, tenant_code, code, created_at, start_date, horizon_days, mode, generation, pairs, actor_user_id, actor_username, channel)
        values ('r1', 'prod', '00000001', 0, '2026-10-27', 90, 'manual', 1, 1, 'u1', 'anna', 'ui')`);
      await sql(`insert into mrp_daily_result (id, tenant_code, run_id, material, location, date, firm_demand, forecast_demand, dependent_demand, transfer_out,
        tentative_supply, dependable_supply, at_risk_supply, transfer_in, proposed_receipts, safety_target, projected_before, projected_after, shortage)
        values ('d1', 'prod', 'r1', '00000001', '00000001', '2026-10-27', ${FIGURES})`);
      await expect(sql("update mrp_run set mode = 'scheduled' where id = 'r1'")).rejects.toThrow(/CHECK constraint failed/);

      await orm.migrator.down();
      expect(await tables()).toEqual([]);
    } finally {
      await orm.close();
    }
  });
});
