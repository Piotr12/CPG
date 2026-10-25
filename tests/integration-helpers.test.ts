import { describe, expect, it } from "vitest";
import { allPages, LIST_PAGE_SIZE, untilOk, type ApiResponse } from "./integration/api";

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

// The realistic Test reset's restore (tests/integration/test-reset-realistic.test.ts, #192).
describe("untilOk", () => {
  const answer = (status: number, text = "{}"): ApiResponse => ({ status, replayed: null, text });
  /** A call that gives the outcomes in turn, counting how often it is made. */
  const calls = (...outcomes: (ApiResponse | Error)[]) => {
    const made = { count: 0 };
    const call = async () => {
      const outcome = outcomes[made.count++];
      if (outcome instanceof Error) throw outcome;
      return outcome;
    };
    return { made, call };
  };

  it("returns the first 200 without calling again", async () => {
    const { made, call } = calls(answer(200, "first"), answer(200, "second"));
    expect((await untilOk("restore", call)).text).toBe("first");
    expect(made.count).toBe(1);
  });

  it("retries a refusal or a dropped connection once, and returns the 200 that follows", async () => {
    for (const first of [answer(503, "busy"), new Error("ECONNRESET")]) {
      const { made, call } = calls(first, answer(200, "restored"));
      expect((await untilOk("restore", call)).text).toBe("restored");
      expect(made.count).toBe(2);
    }
  });

  it("throws naming every failed attempt once they are used up", async () => {
    const { made, call } = calls(answer(409, '{"error":"stale"}'), new Error("ECONNRESET"));
    await expect(untilOk("Restoring Test failed", call)).rejects.toThrow(
      'Restoring Test failed: attempt 1: HTTP 409 {"error":"stale"}; attempt 2: Error: ECONNRESET',
    );
    expect(made.count).toBe(2);
  });
});
