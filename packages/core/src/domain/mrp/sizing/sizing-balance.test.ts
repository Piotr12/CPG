import { describe, expect, it } from "vitest";
import { parseDecimal } from "../../quantities/decimal";
import { sizingBuckets, type SizingDay } from "./sizing-balance";

const q = (text: string) => parseDecimal(text)!;
const DATES = ["2026-10-01", "2026-10-02", "2026-10-03"];
/** Days whose balance before proposals is −`short`, with `atRisk` at-risk output, and a target of 1. */
const days = (short: string[], atRisk: string[] = ["0", "0", "0"]): SizingDay[] =>
  DATES.map((date, day) => ({ date, safetyTarget: q("1"), projectedBefore: -q(short[day]), atRiskSupply: q(atRisk[day]) }));

describe("sizingBuckets", () => {
  it("returns the days themselves when nothing is at risk, provisional or carried", () => {
    const unchanged = days(["1", "2", "3"]);
    expect(sizingBuckets(unchanged, null, [])).toBe(unchanged);
  });

  it("keeps each day's date and target, and adds nothing back on a day with nothing to add", () => {
    expect(sizingBuckets(days(["1", "2", "3"]), [0n, 0n, 0n], [])).toEqual(DATES.map((date, day) => ({ date, safetyTarget: q("1"), projectedBefore: -q(String(day + 1)) })));
  });

  it("adds every at-risk output back from its day on (E17-S03 spec Q2)", () => {
    expect(sizingBuckets(days(["1", "2", "3"], ["0", "2", "0.5"]), null, []).map(({ projectedBefore }) => projectedBefore)).toEqual([-q("1"), 0n, -q("0.5")]);
  });

  it("adds the provisional demand back from its day on when given, so the balance is the one without it (Q6)", () => {
    expect(sizingBuckets(days(["1", "4", "4"]), [0n, q("3"), 0n], []).map(({ projectedBefore }) => projectedBefore)).toEqual([-q("1"), -q("1"), -q("1")]);
  });

  it("carries each proposal in from its need date, summing two on one day, as sizing carries its own", () => {
    const carried = [{ needDate: "2026-10-02", quantity: q("1") }, { needDate: "2026-10-02", quantity: q("0.5") }, { needDate: "2026-10-03", quantity: q("2") }];
    expect(sizingBuckets(days(["1", "2", "3"]), null, carried).map(({ projectedBefore }) => projectedBefore)).toEqual([-q("1"), -q("0.5"), q("0.5")]);
  });
});
