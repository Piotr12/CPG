import { describe, expect, it } from "vitest";
import { listSortSchema, SEARCH_TOO_LONG_MESSAGE } from "@cpg/core/validators/lists/list-query.schema";
import { firstParam, listHref, listLinks, readSearch, readSort } from "./list-params";

describe("firstParam", () => {
  it("reads a repeated parameter's first value", () => {
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam("a")).toBe("a");
    expect(firstParam(undefined)).toBeUndefined();
  });
});

describe("readSearch", () => {
  it("trims a search, and reads none as empty", () => {
    expect(readSearch({ q: "  steel " })).toEqual({ q: "steel", typed: "steel" });
    expect(readSearch({})).toEqual({ q: "", typed: "" });
  });

  it("refuses a search past the limits, keeping what was typed and searching for nothing", () => {
    const typed = "a b c d e f";
    expect(readSearch({ q: [typed, "x"] })).toEqual({ q: "", typed, error: SEARCH_TOO_LONG_MESSAGE });
  });
});

describe("readSort", () => {
  const schema = listSortSchema(["id", "description"] as const);

  it("reads an allow-listed sort and falls back to the default for anything else", () => {
    expect(readSort({ sort: "description", dir: "desc" }, schema)).toEqual({ sort: "description", dir: "desc" });
    expect(readSort({ sort: ["uuid"], dir: "up" }, schema)).toEqual({ sort: "id", dir: "asc" });
  });
});

describe("listHref", () => {
  it("leaves out empty parameters and page 1", () => {
    expect(listHref("/list", { q: "", sort: undefined, page: 1 })).toBe("/list");
    expect(listHref("/list", { q: "steel sheet", page: 2 })).toBe("/list?q=steel+sheet&page=2");
    expect(listHref("/list", { page: "1" })).toBe("/list");
  });
});

describe("listLinks", () => {
  const defaults = { sort: "id", dir: "asc" } as const;

  it("keeps plain addresses for the default order", () => {
    const links = listLinks({ path: "/list", search: "", sort: defaults, defaults });
    expect(links.sortHref("description", "asc")).toBe("/list?sort=description&dir=asc");
    expect(links.pageHref(2)).toBe("/list?page=2");
    expect(links.clearHref).toBe("/list");
    expect(links.keep).toEqual({});
    expect(links.path).toBe("/list");
  });

  it("carries the search, the sort and the list's filters, a sort and a search starting from page 1", () => {
    const links = listLinks({ path: "/list", search: "steel", sort: { sort: "description", dir: "desc" }, defaults, extra: { material: "00000001" } });
    expect(links.sortHref("id", "desc")).toBe("/list?material=00000001&q=steel&sort=id&dir=desc");
    expect(links.pageHref(3)).toBe("/list?material=00000001&q=steel&sort=description&dir=desc&page=3");
    expect(links.clearHref).toBe("/list?material=00000001&sort=description&dir=desc");
    expect(links.keep).toEqual({ material: "00000001", sort: "description", dir: "desc" });
  });
});
