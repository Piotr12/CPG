import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initOrm } from "./orm";

const tempDatabase = () => path.join(mkdtempSync(path.join(tmpdir(), "cpg-mrp-recommendations-migration-")), "cpg.sqlite");

describe("MRP recommendations migration (#278)", () => {
  it("adds the table as the entity declares it, cascades from its run, and drops it on the way down, leaving the runs", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    const sql = (query: string) => orm.em.getConnection().execute(query);
    const tables = async () => (await sql("select name from sqlite_master where type = 'table' and name like 'mrp_%'")).map(({ name }) => name as string).sort();
    try {
      await orm.migrator.up();
      expect(await tables()).toEqual(["mrp_daily_result", "mrp_recommendation", "mrp_run"]);
      expect(await orm.schema.getUpdateSchemaSQL()).not.toContain("`mrp_recommendation`");
      expect((await sql("select sql from sqlite_master where name = 'mrp_recommendation_tenant_code_run_id_material_location_need_date_unique'"))[0].sql).toBe(
        "CREATE UNIQUE INDEX `mrp_recommendation_tenant_code_run_id_material_location_need_date_unique` on `mrp_recommendation` (`tenant_code`, `run_id`, `material`, `location`, `need_date`)",
      );

      const run = (id: string, code: string) =>
        sql(`insert into mrp_run (id, tenant_code, code, created_at, start_date, horizon_days, mode, generation, pairs, actor_user_id, actor_username, channel)
          values ('${id}', 'test', '${code}', 0, '2026-11-01', 90, 'manual', 1, 1, 'u1', 'anna', 'ui')`);
      const recommendation = (id: string, runId: string) =>
        sql(`insert into mrp_recommendation (id, tenant_code, run_id, material, location, kind, need_date, quantity)
          values ('${id}', 'test', '${runId}', '00000001', '00000001', 'purchase-requisition', '2026-11-05', '10.000000')`);
      await run("r1", "00000001");
      await run("r2", "00000002");
      await recommendation("p1", "r1");
      await recommendation("p2", "r2");
      await expect(sql("update mrp_recommendation set kind = 'transfer' where id = 'p1'")).rejects.toThrow(/CHECK constraint failed/);
      await expect(recommendation("p3", "r1")).rejects.toThrow(/UNIQUE constraint failed/);

      // A Test reset by an image that predates this table deletes runs only, with foreign keys deferred to the commit.
      await orm.em.transactional(async (em) => {
        const connection = em.getConnection();
        await connection.execute("pragma defer_foreign_keys = on", [], "run", em.getTransactionContext());
        await connection.execute("delete from mrp_run where id = 'r1'", [], "run", em.getTransactionContext());
      });
      expect(await sql("select id from mrp_recommendation")).toEqual([{ id: "p2" }]);

      // Back to the migration before it: the later lead-time column goes first.
      await orm.migrator.down({ to: "Migration20261027061605_mrp_runs" });
      expect(await tables()).toEqual(["mrp_daily_result", "mrp_run"]);
      expect(await sql("select id from mrp_run")).toEqual([{ id: "r2" }]);
    } finally {
      await orm.close();
    }
  });
});
