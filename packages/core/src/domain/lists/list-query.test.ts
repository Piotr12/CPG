import { describe, expect, it } from "vitest";
import { listOrderBy, searchWhere, searchWords } from "./list-query";

describe("searchWords", () => {
  it("splits at whitespace and drops repeats", () => {
    expect(searchWords(" steel  sheet steel ")).toEqual(["steel", "sheet"]);
    expect(searchWords("")).toEqual([]);
  });

  it("splits at LIKE's wildcards and escape, so they never match anything", () => {
    expect(searchWords("M_8 10%\\x")).toEqual(["M", "8", "10", "x"]);
    expect(searchWords("%_")).toEqual([]);
  });
});

describe("searchWhere", () => {
  it("is empty without words", () => {
    expect(searchWhere("  ", ["code"])).toEqual({});
  });

  it("needs every word in at least one field, nesting dotted paths into references", () => {
    expect(searchWhere("steel 07", ["code", "material.description"])).toEqual({
      $and: [
        { $or: [{ code: { $like: "%steel%" } }, { material: { description: { $like: "%steel%" } } }] },
        { $or: [{ code: { $like: "%07%" } }, { material: { description: { $like: "%07%" } } }] },
      ],
    });
  });
});

describe("listOrderBy", () => {
  it("sorts by the path, then the business ID ascending", () => {
    expect(listOrderBy("output.code", "desc")).toEqual([{ output: { code: "desc" } }, { code: "asc" }]);
  });

  it("needs no tie-breaker when sorting by the business ID itself", () => {
    expect(listOrderBy("code", "desc")).toEqual([{ code: "desc" }]);
  });

  it("takes another tie-breaker", () => {
    expect(listOrderBy("name", "asc", "username")).toEqual([{ name: "asc" }, { username: "asc" }]);
  });

  it("sorts a decimal field by its integer part's length, then its text, then the tie-breaker (#224)", () => {
    const [length, text, tieBreaker, ...rest] = listOrderBy({ decimal: "quantity" }, "desc", "material.code");
    const [key] = Object.getOwnPropertySymbols(length);
    expect(String(key)).toMatch(/instr\(.+\.quantity \|\| '\.', '\.'\)/);
    expect(length[key]).toBe("desc");
    expect([text, tieBreaker, rest]).toEqual([{ quantity: "desc" }, { material: { code: "asc" } }, []]);
  });
});
