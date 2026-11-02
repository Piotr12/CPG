import { describe, expect, it } from "vitest";
import { MRP_FIGURES } from "../../../services/mrp/mrp-run-view";
import { addDays } from "../../demand/demand-buckets";
import { formatSignedQuantity, parseSignedQuantity } from "../../stock/signed-quantity";
import type { MrpMark } from "./plan-marks";
import { foldWeeks, MRP_WEEK_FLOWS, MRP_WEEK_LEVELS, type WeekDay } from "./weekly";

const ZERO = "0.000000";
const text = (value: bigint) => formatSignedQuantity(value);
const units = (n: number) => BigInt(Math.round(n * 1_000_000));

/** `count` stored days from `start`, all figures zero, then `edit` applied to each. */
function days(start: string, count: number, edit: (day: WeekDay, index: number) => void = () => {}): WeekDay[] {
  return Array.from({ length: count }, (_, index) => {
    const day = Object.fromEntries(MRP_FIGURES.map((figure) => [figure, ZERO])) as WeekDay;
    day.date = addDays(start, index);
    edit(day, index);
    return day;
  });
}

/**
 * UX-027: a run on Thursday 1 October 2026, a balance of 10 at the end of the 4th, firm demand of 8 on
 * each day of W41 (Monday 5 to Sunday 11 October), dependable receipts of 20 on the 7th and 30 on the 10th.
 */
function ux027(): WeekDay[] {
  let balance = units(10);
  return days("2026-10-01", 90, (day) => {
    if (day.date >= "2026-10-05" && day.date <= "2026-10-11") {
      day.firmDemand = text(units(8));
      const receipt = day.date === "2026-10-07" ? 20 : day.date === "2026-10-10" ? 30 : 0;
      day.dependableSupply = text(units(receipt));
      balance += units(receipt) - units(8);
    }
    day.projectedBefore = text(balance);
    day.projectedAfter = text(balance);
    day.shortage = text(balance < 0n ? -balance : 0n);
  });
}

describe("foldWeeks", () => {
  it("UX-027: sums W41's flows and takes its last day's balance and its weakest day's, never a sum of balances or shortages", () => {
    const stored = ux027();
    const w41 = stored.filter(({ date }) => date >= "2026-10-05" && date <= "2026-10-11");
    expect(w41.map(({ projectedBefore }) => parseSignedQuantity(projectedBefore))).toEqual([2, -6, 6, -2, -10, 12, 4].map(units));

    const week = foldWeeks(stored, []).find((item) => item.week === 41)!;

    expect(week).toMatchObject({
      start: "2026-10-05", end: "2026-10-11", year: 2026, week: 41, partial: false,
      firmDemand: "56.000000", dependableSupply: "50.000000",
      projectedBefore: "4.000000", projectedAfter: "4.000000",
      lowestProjectedBefore: "-10.000000", peakShortage: "10.000000",
    });
    // The sum of the balances (6) and of the daily shortages (18) appear nowhere.
    expect(Object.values(week)).not.toContain("6.000000");
    expect(Object.values(week)).not.toContain("18.000000");
    expect(week).not.toHaveProperty("shortage");
  });

  it("cuts the first and last weeks to the horizon: Thursday 1 to Sunday 4 October, and Monday 28 to Tuesday 29 December, W53 of 2026", () => {
    const weeks = foldWeeks(ux027(), []);
    expect(weeks).toHaveLength(14);
    expect(weeks[0]).toMatchObject({ start: "2026-10-01", end: "2026-10-04", year: 2026, week: 40, partial: true, projectedBefore: "10.000000" });
    expect(weeks.at(-1)).toMatchObject({ start: "2026-12-28", end: "2026-12-29", year: 2026, week: 53, partial: true });
    expect(weeks.slice(1, -1).every(({ partial }) => !partial)).toBe(true);
  });

  it("takes the last horizon day's balance for a cut week, never a day outside the run", () => {
    const stored = days("2026-10-01", 90, (day, index) => (day.projectedBefore = text(units(index))));
    expect(foldWeeks(stored, []).at(-1)!.projectedBefore).toBe("89.000000");
  });

  it("crosses a year boundary from W53 of 2026 into W1 of 2027, with whole weeks when the horizon starts on a Monday", () => {
    const weeks = foldWeeks(days("2026-12-28", 90), []);
    expect(weeks.slice(0, 2).map(({ start, end, year, week, partial }) => ({ start, end, year, week, partial }))).toEqual([
      { start: "2026-12-28", end: "2027-01-03", year: 2026, week: 53, partial: false },
      { start: "2027-01-04", end: "2027-01-10", year: 2027, week: 1, partial: false },
    ]);
    // 90 = 12 × 7 + 6: the thirteenth week is cut.
    expect(weeks).toHaveLength(13);
    expect(weeks.at(-1)).toMatchObject({ start: "2027-03-22", end: "2027-03-27", partial: true });
  });

  it("sums fractions exactly and keeps a fractional negative balance's sign outside the fraction", () => {
    const stored = days("2026-10-05", 7, (day, index) => {
      day.forecastDemand = "0.250000";
      day.projectedBefore = index === 3 ? "-15.500000" : "1.000000";
      day.shortage = index === 3 ? "15.500000" : ZERO;
    });
    expect(foldWeeks(stored, [])[0]).toMatchObject({ forecastDemand: "1.750000", lowestProjectedBefore: "-15.500000", peakShortage: "15.500000", projectedBefore: "1.000000" });
  });

  it("takes the safety target in force on the week's last day, a level and not a flow (spec Q4)", () => {
    const stored = days("2026-10-05", 7, (day, index) => (day.safetyTarget = index === 6 ? "7.000000" : "5.000000"));
    expect(foldWeeks(stored, [])[0].safetyTarget).toBe("7.000000");
  });

  it("gives each week the marks of its days, in their order", () => {
    const mark = (date: string, proposal: string): MrpMark => ({ kind: "late-supply", date, proposal, plannedFinish: "2026-10-20", lateDays: 2, quantity: "1.000000" });
    const marks = [mark("2026-10-01", "a"), mark("2026-10-04", "b"), mark("2026-10-05", "c"), mark("2026-10-11", "d")];
    const weeks = foldWeeks(ux027(), marks);
    expect(weeks[0].marks.map((m) => ("proposal" in m ? m.proposal : null))).toEqual(["a", "b"]);
    expect(weeks[1].marks.map((m) => ("proposal" in m ? m.proposal : null))).toEqual(["c", "d"]);
    expect(weeks[2].marks).toEqual([]);
    const late: MrpMark = { kind: "late-requisition", date: "2026-10-06", document: "00000007", plannedDate: "2026-10-06", plannedFinish: "2026-10-08", lateDays: 2, quantity: "5.000000" };
    expect(foldWeeks(ux027(), [late])[1].marks).toEqual([late]);
  });

  it("refuses a stored figure that isn't a six-decimal quantity rather than guessing", () => {
    expect(() => foldWeeks(days("2026-10-05", 1, (day) => (day.firmDemand = "8,5")), [])).toThrow('An MRP daily figure isn\'t a six-decimal quantity: "8,5".');
  });

  it("sums or levels every figure but the shortage, which only its peak stands for", () => {
    expect([...MRP_WEEK_FLOWS, ...MRP_WEEK_LEVELS, "shortage"].sort()).toEqual([...MRP_FIGURES].sort());
  });
});
