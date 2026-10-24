import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initOrm } from "./orm";
import { cacheStatements } from "./statement-cache";

/** A stand-in database that prepares a new statement object per call and counts the calls. */
function fakeDatabase() {
  const prepared: string[] = [];
  return { prepared, prepare: (sql: string) => { prepared.push(sql); return { sql, busy: false }; } };
}

describe("cacheStatements", () => {
  it("prepares each SQL text once and hands back the same statement", () => {
    const db = fakeDatabase();
    cacheStatements(db);
    const first = db.prepare("select 1");
    expect(db.prepare("select 1")).toBe(first);
    expect(db.prepare("select 2")).not.toBe(first);
    expect(db.prepared).toEqual(["select 1", "select 2"]);
  });

  it("prepares a fresh statement while the cached one is busy", () => {
    const db = fakeDatabase();
    cacheStatements(db);
    const first = db.prepare("select 1");
    first.busy = true;
    const second = db.prepare("select 1");
    expect(second).not.toBe(first);
    expect(db.prepare("select 1")).toBe(second);
  });

  it("drops the least recently used statement beyond its size", () => {
    const db = fakeDatabase();
    cacheStatements(db, 2);
    const a = db.prepare("a");
    db.prepare("b");
    expect(db.prepare("a")).toBe(a); // a is now the most recent
    db.prepare("c"); // evicts b
    expect(db.prepare("a")).toBe(a);
    db.prepare("b");
    expect(db.prepared).toEqual(["a", "b", "c", "b"]);
  });

  it("reuses statements on the ORM's connection, also across a schema change and during an iteration", async () => {
    const orm = await initOrm({ databasePath: path.join(mkdtempSync(path.join(tmpdir(), "cpg-statements-")), "cpg.sqlite") });
    try {
      const connection = orm.em.getConnection();
      const db = await connection.getNativeClient();
      expect(db.prepare("select 1 as one")).toBe(db.prepare("select 1 as one"));

      await connection.execute("create table probe (a integer)");
      await connection.execute("insert into probe (a) values (1), (2)");
      expect(await connection.execute("select * from probe order by a")).toEqual([{ a: 1 }, { a: 2 }]);
      await connection.execute("alter table probe add column b integer default 7");
      expect(await connection.execute("select * from probe order by a")).toEqual([{ a: 1, b: 7 }, { a: 2, b: 7 }]);

      const rows: unknown[] = [];
      for (const row of db.prepare("select a from probe order by a").iterate()) {
        rows.push(row, db.prepare("select a from probe order by a").all());
      }
      expect(rows).toEqual([{ a: 1 }, [{ a: 1 }, { a: 2 }], { a: 2 }, [{ a: 1 }, { a: 2 }]]);
    } finally {
      await orm.close();
    }
  });
});
