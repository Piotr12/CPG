import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initOrm, type Orm } from "./orm";
import { ESCAPE_MESSAGE, LIKE_CACHE_SIZE, likePattern, registerUnicodeLike, type DefiningFunctions, type SqlValue } from "./unicode-like";

describe("likePattern", () => {
  it("anchors the pattern, so text around a match must be covered by a wildcard", () => {
    expect(likePattern("bolt").test("bolt")).toBe(true);
    expect(likePattern("bolt").test("a bolt")).toBe(false);
    expect(likePattern("%bolt%").test("a bolt, M8")).toBe(true);
  });

  it("matches `_` to exactly one character, a letter outside the BMP included", () => {
    expect(likePattern("a_c").test("abc")).toBe(true);
    expect(likePattern("a_c").test("ac")).toBe(false);
    expect(likePattern("a_c").test("abbc")).toBe(false);
    expect(likePattern("a_c").test("a😀c")).toBe(true);
  });

  it("treats regular-expression syntax as plain characters", () => {
    const pattern = "^$\\.*+?()[]{}|/";
    expect(likePattern(pattern).test(pattern)).toBe(true);
    expect(likePattern("a.c").test("abc")).toBe(false);
    expect(likePattern("a-b").test("a-b")).toBe(true);
  });

  it("makes the character after the escape literal, wildcards and the escape itself included", () => {
    expect(likePattern("100!%", "!").test("100%")).toBe(true);
    expect(likePattern("100!%", "!").test("1000")).toBe(false);
    expect(likePattern("a!_c", "!").test("abc")).toBe(false);
    expect(likePattern("a!!b", "!").test("a!b")).toBe(true);
  });

  it("lets an escape that is a wildcard character stop being a wildcard, as SQLite does", () => {
    expect(likePattern("a%%", "%").test("a%")).toBe(true);
    expect(likePattern("a%%", "%").test("abc")).toBe(false);
  });

  it("never matches a pattern ending in its escape character, as SQLite", () => {
    expect(likePattern("ab!", "!").test("ab")).toBe(false);
    expect(likePattern("ab!", "!").test("ab!")).toBe(false);
  });
});

describe("registerUnicodeLike on a real SQLite connection", () => {
  let orm: Orm;
  /** `value LIKE pattern [ESCAPE escape]`, as SQLite evaluates it. */
  let like: (value: SqlValue, pattern: SqlValue, escape?: SqlValue) => unknown;

  beforeAll(async () => {
    orm = await initOrm({ databasePath: path.join(mkdtempSync(path.join(tmpdir(), "cpg-like-")), "cpg.sqlite") });
    const db = await orm.em.getConnection().getNativeClient();
    like = (value, pattern, escape) =>
      escape === undefined
        ? db.prepare("select ? like ? as matched").get(value, pattern).matched
        : db.prepare("select ? like ? escape ? as matched").get(value, pattern, escape).matched;
  });

  afterAll(async () => {
    await orm.close();
  });

  it("ignores the case of Polish letters, in both directions (#223)", () => {
    expect(like("Łożysko kulkowe", "%łożysko%")).toBe(1);
    expect(like("łożysko", "%ŁOŻYSKO%")).toBe(1);
    for (const [upper, lower] of [["Ą", "ą"], ["Ć", "ć"], ["Ę", "ę"], ["Ł", "ł"], ["Ń", "ń"], ["Ó", "ó"], ["Ś", "ś"], ["Ź", "ź"], ["Ż", "ż"]]) {
      expect(like(upper, lower)).toBe(1);
      expect(like(lower, upper)).toBe(1);
    }
  });

  it("still ignores ASCII case and still tells different letters apart", () => {
    expect(like("Steel Sheet", "%steel%")).toBe(1);
    expect(like("łożysko", "%lozysko%")).toBe(0);
    expect(like("śruba", "%sruba%")).toBe(0);
  });

  it("matches `%` and `_` across a newline", () => {
    expect(like("first line\nsecond", "%line_second")).toBe(1);
    expect(like("a\nb", "a%")).toBe(1);
  });

  it("answers NULL for a NULL pattern, value or escape, so NOT LIKE stays NULL too", async () => {
    expect(like(null, "%a%")).toBeNull();
    expect(like("a", null)).toBeNull();
    expect(like("a", "a", null)).toBeNull();
    const db = await orm.em.getConnection().getNativeClient();
    expect(db.prepare("select ? not like ? as matched").get("Łódź", "łódź").matched).toBe(0);
    expect(db.prepare("select null not like ? as matched").get("a").matched).toBeNull();
  });

  it("compares a number as its text and a BLOB as its UTF-8 text", () => {
    expect(like(1234, "%23%")).toBe(1);
    expect(like(Buffer.from("Żuraw", "utf8"), "żuraw")).toBe(1);
    expect(like("Żuraw", Buffer.from("żuraw", "utf8"))).toBe(1);
  });

  it("honours ESCAPE, and refuses an escape that isn't one character with SQLite's message", () => {
    expect(like("100%", "100\\%", "\\")).toBe(1);
    expect(like("1000", "100\\%", "\\")).toBe(0);
    expect(like("Ł_1", "ł\\_1", "\\")).toBe(1);
    expect(() => like("a", "a", "")).toThrow(ESCAPE_MESSAGE);
    expect(() => like("a", "a", "ab")).toThrow(ESCAPE_MESSAGE);
    expect(() => like(null, "a", "")).toThrow(ESCAPE_MESSAGE);
    expect(like("a", "a", "😀")).toBe(1);
  });

  it("filters a table's rows on the ORM's own connection", async () => {
    const connection = orm.em.getConnection();
    await connection.execute("create table probe (description text)");
    await connection.execute("insert into probe (description) values ('Łożysko kulkowe'), ('Śruba M8'), ('bearing')");
    expect(await connection.execute("select description from probe where description like ? order by description", ["%łożysko%"])).toEqual([
      { description: "Łożysko kulkowe" },
    ]);
    expect(await connection.execute("select count(*) as n from probe where description like ?", ["%ŚRUBA%"])).toEqual([{ n: 1 }]);
  });
});

describe("registerUnicodeLike's pattern cache", () => {
  /** Captures the two registered forms; `compiled` lists every pattern compiled, in order. */
  function registered(size?: number) {
    const compiled: string[] = [];
    const forms: Record<number, (...args: SqlValue[]) => unknown> = {};
    const db: DefiningFunctions = {
      function(name, options, implementation) {
        expect([name, options]).toEqual(["like", { deterministic: true }]);
        forms[implementation.length] = implementation as (...args: SqlValue[]) => unknown;
      },
    };
    registerUnicodeLike(db, size, (pattern, escape) => {
      compiled.push(pattern);
      return likePattern(pattern, escape);
    });
    return { forms, compiled };
  }

  it("registers a two- and a three-argument form", () => {
    const { forms } = registered();
    expect(Object.keys(forms).sort()).toEqual(["2", "3"]);
    expect(forms[2]("%Ł%", "ał")).toBe(1);
    expect(forms[3]("%!%", "50%", "!")).toBe(1);
    expect(forms[3]("%!%", "50", "!")).toBe(0);
  });

  it("keeps the same pattern apart with and without an escape", () => {
    const { forms } = registered();
    expect(forms[2]("a!%", "a!xyz")).toBe(1);
    expect(forms[3]("a!%", "a!xyz", "!")).toBe(0);
    expect(forms[3]("a!%", "a%", "!")).toBe(1);
    expect(forms[2]("a!%", "a%")).toBe(0);
  });

  it("compiles a pattern once, and again only after it was dropped beyond the cache's size", () => {
    const { forms, compiled } = registered(2);
    forms[2]("a", "a");
    forms[2]("a", "A");
    forms[2]("b", "b");
    forms[2]("c", "c"); // drops "a", the oldest
    expect(forms[2]("b", "B")).toBe(1);
    expect(forms[2]("a", "a")).toBe(1);
    expect(compiled).toEqual(["a", "b", "c", "a"]);
  });

  it("keeps a hundred patterns by default", () => {
    expect(LIKE_CACHE_SIZE).toBe(100);
  });
});
