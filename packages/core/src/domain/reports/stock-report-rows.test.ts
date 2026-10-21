import { describe, expect, it } from "vitest";
import { PairTally, reportPage } from "./stock-report-rows";

const pair = (material: string, location: string, quantity = 0n, inTransitFrom = 0n, inTransitTo = 0n) => ({ material, location, quantity, inTransitFrom, inTransitTo });

describe("PairTally", () => {
  it("sums each figure of a pair, and keeps pairs apart", () => {
    const tally = new PairTally();
    tally.add("m1", "l1", "quantity", 5n);
    tally.add("m1", "l1", "inTransitFrom", 2n);
    tally.add("m1", "l1", "inTransitFrom", 3n);
    tally.add("m1", "l2", "inTransitTo", 7n);
    expect(tally.values()).toEqual([pair("m1", "l1", 5n, 5n), pair("m1", "l2", 0n, 0n, 7n)]);
  });
});

describe("reportPage", () => {
  const pairs = [pair("00000002", "00000001", 1n), pair("00000001", "00000002", 0n, 0n, 4n), pair("00000001", "00000001", 0n), pair("00000001", "00000003", 0n, 9n)];

  it("leaves out pairs that are all zero, and orders the rest by material, then location", () => {
    expect(reportPage(pairs, { includeZero: false, page: 1, pageSize: 10 })).toEqual({
      total: 3,
      rows: [pair("00000001", "00000002", 0n, 0n, 4n), pair("00000001", "00000003", 0n, 9n), pair("00000002", "00000001", 1n)],
    });
  });

  it("keeps the all-zero pairs when asked", () => {
    const { total, rows } = reportPage(pairs, { includeZero: true, page: 1, pageSize: 10 });
    expect(total).toBe(4);
    expect(rows[0]).toEqual(pair("00000001", "00000001"));
  });

  it("slices one page, counting every kept row in the total, and an empty page past the end", () => {
    expect(reportPage(pairs, { includeZero: true, page: 2, pageSize: 3 })).toEqual({ total: 4, rows: [pair("00000002", "00000001", 1n)] });
    expect(reportPage(pairs, { includeZero: true, page: 3, pageSize: 3 })).toEqual({ total: 4, rows: [] });
  });
});
