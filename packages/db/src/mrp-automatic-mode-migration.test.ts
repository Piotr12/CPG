import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MrpRun } from "./entities";
import { migrations } from "./migrations";
import { initOrm } from "./orm";
import { selectTenant } from "./entities/tenants/tenant-owned";

const MIGRATION = "Migration20261102105033_mrp_automatic_mode";
const tempDatabase = () => path.join(mkdtempSync(path.join(tmpdir(), "cpg-mrp-automatic-mode-migration-")), "cpg.sqlite");

describe("MRP automatic mode migration (E19-S03)", () => {
  it("adds `creation` in place to populated runs, reads older runs and older-style inserts as manual with no creation, and drops it on the way down", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    const sql = (query: string) => orm.em.getConnection().execute(query);
    const columns = async () => (await sql("select name from pragma_table_info('mrp_run')")).map(({ name }) => name as string);
    // A previous image's insert names no creation.
    const run = (id: string, code: string) =>
      sql(`insert into mrp_run (id, tenant_code, code, created_at, start_date, horizon_days, mode, generation, pairs, actor_user_id, actor_username, channel)
        values ('${id}', 'test', '${code}', 0, '2026-11-01', 90, 'manual', 1, 1, 'u1', 'anna', 'ui')`);
    try {
      await orm.migrator.up({ migrations: migrations.map(({ name }) => name).filter((name) => name !== MIGRATION) });
      await run("r1", "00000001");
      const table = (await sql("select sql from sqlite_master where name = 'mrp_run'"))[0].sql as string;

      await orm.migrator.up();
      await run("r2", "00000002");
      await sql(`insert into mrp_run (id, tenant_code, code, created_at, start_date, horizon_days, mode, generation, pairs, actor_user_id, actor_username, channel, creation)
        values ('r3', 'test', '00000003', 0, '2026-11-02', 90, 'automatic', 1, 1, 'u1', 'anna', 'api', '{"status":"created","documents":3}')`);
      // Through the entity, as the service reads it: older rows are manual runs with no creation.
      const em = orm.em.fork();
      selectTenant(em, "test");
      const read = await em.find(MrpRun, {}, { orderBy: { code: "asc" } });
      expect(read.map(({ code, mode, creation }) => ({ code, mode, creation: creation ?? null }))).toEqual([
        { code: "00000001", mode: "manual", creation: null },
        { code: "00000002", mode: "manual", creation: null },
        { code: "00000003", mode: "automatic", creation: { status: "created", documents: 3 } },
      ]);
      // Altered in place, not rebuilt: the table's own definition gains only the column.
      const altered = (await sql("select sql from sqlite_master where name = 'mrp_run'"))[0].sql as string;
      expect(altered).toBe(table.replace(", constraint", ", `creation` json null, constraint"));
      expect(await orm.schema.getUpdateSchemaSQL()).not.toContain("`mrp_run`");

      await orm.migrator.down();
      expect(await columns()).not.toContain("creation");
      expect(await sql("select code from mrp_run order by code")).toEqual([{ code: "00000001" }, { code: "00000002" }, { code: "00000003" }]);
    } finally {
      await orm.close();
    }
  });
});
