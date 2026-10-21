import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIT_APPEND_ONLY } from "./entities";
import { migrations } from "./migrations";
import { initOrm } from "./orm";

const tempDatabase = () => path.join(mkdtempSync(path.join(tmpdir(), "cpg-audit-index-")), "cpg.sqlite");
const MIGRATION = "Migration20261021095627_audit_record_index";
const GLOBAL_INDEX = "global_audit_event_subject_type_subject_id_occurred_at_id_index";
const TENANT_INDEX = "tenant_audit_event_tenant_code_subject_type_subject_id_occurred_at_id_index";
const COLUMNS = "id, occurred_at, action, subject_type, subject_id, subject_label, before, after, actor_user_id, actor_username, session_id, channel";

describe("audit record index migration", () => {
  it("adds the record indexes to a populated database without touching its entries or the append-only triggers", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    const sql = (query: string, params: unknown[] = []) => orm.em.getConnection().execute(query, params);
    try {
      await orm.migrator.up({ migrations: migrations.map(({ name }) => name).filter((name) => name !== MIGRATION) });
      await sql(`insert into global_audit_event (${COLUMNS}) values ('g1', 1761040000000, 'users.user.created', 'User', 'u1', 'alice', null, '{"username":"alice"}', 'a1', 'admin', 's1', 'ui')`);
      await sql(`insert into tenant_audit_event (${COLUMNS}, tenant_code) values ('t1', 1761040000000, 'stock.movement.posted', 'StockMovement', 'm1', 'Steel', '{"quantity":"0"}', '{"businessDate":"2026-10-21"}', 'a1', 'admin', 's1', 'ui', 'prod')`);
      const before = [await sql("select * from global_audit_event"), await sql("select * from tenant_audit_event")];

      await orm.migrator.up();

      expect(await sql("select name from sqlite_master where type = 'index' and name in (?, ?) order by name", [GLOBAL_INDEX, TENANT_INDEX]))
        .toEqual([{ name: GLOBAL_INDEX }, { name: TENANT_INDEX }]);
      expect([await sql("select * from global_audit_event"), await sql("select * from tenant_audit_event")]).toEqual(before);
      for (const table of ["global_audit_event", "tenant_audit_event"]) {
        await expect(sql(`update ${table} set subject_label = 'mallory'`)).rejects.toThrow(AUDIT_APPEND_ONLY);
      }
      await expect(sql("delete from tenant_audit_event where tenant_code = 'prod'")).rejects.toThrow(AUDIT_APPEND_ONLY);
      await expect(sql("delete from global_audit_event")).rejects.toThrow(AUDIT_APPEND_ONLY);

      await orm.migrator.down();
      expect(await sql("select name from sqlite_master where type = 'index' and name in (?, ?)", [GLOBAL_INDEX, TENANT_INDEX])).toEqual([]);
      expect(await sql("select count(*) as count from tenant_audit_event")).toEqual([{ count: 1 }]);
    } finally {
      await orm.close();
    }
  });

  it("serves one record's newest-first page from the record index, without a temporary sort", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    const plan = async (query: string, params: unknown[]) =>
      (await orm.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${query}`, params)).map(({ detail }) => detail).join(" ");
    try {
      await orm.migrator.up();
      const tenantPage = await plan(
        `select * from tenant_audit_event where tenant_code = ? and subject_type = ? and subject_id = ?
         and (occurred_at < ? or (occurred_at = ? and id < ?)) order by occurred_at desc, id desc limit 51`,
        ["prod", "PurchaseOrder", "00000012", 1761040000000, 1761040000000, "cursor"],
      );
      expect(tenantPage).toContain(TENANT_INDEX);
      expect(tenantPage).not.toContain("TEMP B-TREE");
      const globalPage = await plan(
        "select * from global_audit_event where subject_type = ? and subject_id = ? order by occurred_at desc, id desc limit 51",
        ["User", "u1"],
      );
      expect(globalPage).toContain(GLOBAL_INDEX);
      expect(globalPage).not.toContain("TEMP B-TREE");
    } finally {
      await orm.close();
    }
  });
});
