import { describe, expect, it } from "vitest";
import { allPages, LIST_PAGE_SIZE } from "./integration/api";

/** A list of `count` numbered rows served `LIST_PAGE_SIZE` to a page, recording the pages asked for. */
const pagedList = (count: number) => {
  const rows = Array.from({ length: count }, (_, index) => index + 1);
  const requested: number[] = [];
  const readPage = async (page: number) => {
    requested.push(page);
    return rows.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE);
  };
  return { rows, requested, readPage };
};

// The integration tests' page walker (tests/integration/api.ts), which the Test-reset Prod snapshot relies on (#201).
describe("allPages", () => {
  it("reads successive pages until a short one, and returns every row once, in order", async () => {
    const list = pagedList(2 * LIST_PAGE_SIZE + 37);
    expect(await allPages(list.readPage)).toEqual(list.rows);
    expect(list.requested).toEqual([1, 2, 3]);
  });

  it("stops after the first page when it is short, an empty list included", async () => {
    const short = pagedList(40);
    expect(await allPages(short.readPage)).toEqual(short.rows);
    expect(short.requested).toEqual([1]);
    const empty = pagedList(0);
    expect(await allPages(empty.readPage)).toEqual([]);
    expect(empty.requested).toEqual([1]);
  });

  it("asks for one more page after an exact multiple of the page size, which comes back empty", async () => {
    const list = pagedList(2 * LIST_PAGE_SIZE);
    expect(await allPages(list.readPage)).toEqual(list.rows);
    expect(list.requested).toEqual([1, 2, 3]);
  });
});
