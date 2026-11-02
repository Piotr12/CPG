import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initOrm } from "./orm";

const tempDatabase = () => path.join(mkdtempSync(path.join(tmpdir(), "cpg-mrp-run-exceptions-migration-")), "cpg.sqlite");

describe("MRP run exceptions migration (#280)", () => {
  it("adds the table as the entity declares it, with any code, cascades from its run, and drops it on the way down, leaving the runs", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    const sql = (query: string) => orm.em.getConnection().execute(query);
    const tables = async () => (await sql("select name from sqlite_master where type = 'table' and name like 'mrp_%'")).map(({ name }) => name as string).sort();
    try {
      await orm.migrator.up();
      expect(await tables()).toEqual(["mrp_daily_result", "mrp_recommendation", "mrp_run", "mrp_run_exception"]);
      expect(await orm.schema.getUpdateSchemaSQL()).not.toContain("`mrp_run_exception`");
      expect((await sql("select sql from sqlite_master where name = 'mrp_run_exception_tenant_code_run_id_material_location_position_unique'"))[0].sql).toBe(
        "CREATE UNIQUE INDEX `mrp_run_exception_tenant_code_run_id_material_location_position_unique` on `mrp_run_exception` (`tenant_code`, `run_id`, `material`, `location`, `position`)",
      );

      const run = (id: string, code: string) =>
        sql(`insert into mrp_run (id, tenant_code, code, created_at, start_date, horizon_days, mode, generation, pairs, actor_user_id, actor_username, channel)
          values ('${id}', 'test', '${code}', 0, '2026-11-01', 90, 'manual', 1, 1, 'u1', 'anna', 'ui')`);
      const exception = (id: string, runId: string, position: number, code = "MISSING_BOM") =>
        sql(`insert into mrp_run_exception (id, tenant_code, run_id, position, exception_code, material, location, date, details)
          values ('${id}', 'test', '${runId}', ${position}, '${code}', '00000001', '00000001', '2026-11-05', null)`);
      await run("r1", "00000001");
      await run("r2", "00000002");
      await exception("e1", "r1", 0);
      await exception("e2", "r2", 0);
      // No CHECK on the code: a later story's code is stored without a table rebuild (spec Q6).
      await exception("e3", "r2", 1, "A_CODE_FROM_A_LATER_STORY");
      await expect(exception("e4", "r1", 0)).rejects.toThrow(/UNIQUE constraint failed/);

      // A Test reset by an image that predates this table deletes runs only, with foreign keys deferred to the commit.
      await orm.em.transactional(async (em) => {
        const connection = em.getConnection();
        await connection.execute("pragma defer_foreign_keys = on", [], "run", em.getTransactionContext());
        await connection.execute("delete from mrp_run where id = 'r1'", [], "run", em.getTransactionContext());
      });
      expect(await sql("select id from mrp_run_exception order by id")).toEqual([{ id: "e2" }, { id: "e3" }]);

      await orm.migrator.down(); // E19-S03's creation column comes off first,
      await orm.migrator.down(); // then #281's BOM columns.
      await orm.migrator.down();
      expect(await tables()).toEqual(["mrp_daily_result", "mrp_recommendation", "mrp_run"]);
      expect(await sql("select id from mrp_run")).toEqual([{ id: "r2" }]);
    } finally {
      await orm.close();
    }
  });
});
