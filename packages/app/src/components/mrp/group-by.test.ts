import { describe, expect, it } from "vitest";
import type { MrpMarkView, MrpShortageView } from "@cpg/core";
import { groupBy } from "./group-by";

const MONDAY = "2026-10-05";
const TUESDAY = "2026-10-06";
const shortage = (fields: Partial<MrpShortageView>): MrpShortageView => ({
  kind: "forecast", date: MONDAY, originalDate: MONDAY, document: null, position: null, required: "20.000000", uncovered: "15.000000", root: null, ...fields,
});
const overdue = (date: string, document: string): MrpMarkView => ({
  kind: "overdue-supply", date, source: "purchase-order", document, position: 1, plannedDate: "2026-09-28", quantity: "30.000000",
});
const late = (date: string, proposal: string, kind: "late-supply" | "beyond-horizon" = "late-supply"): MrpMarkView => ({
  kind, date, proposal, plannedFinish: "2026-10-09", lateDays: 3, quantity: "5.000000",
});

describe("groupBy (#391, #397)", () => {
  it("groups a plan's short requirements by their day in one pass, each day keeping its entries in the order given", () => {
    const first = shortage({ kind: "forecast" });
    const second = shortage({ kind: "transfer", date: TUESDAY, document: "00000002" });
    const third = shortage({ kind: "safety-target" });
    const fourth = shortage({ kind: "component", date: TUESDAY, document: "00000004" });
    const fifth = shortage({ kind: "customer-order", document: "00000012", position: 0 });

    const days = groupBy([first, second, third, fourth, fifth], ({ date }) => date);

    expect([...days.keys()]).toEqual([MONDAY, TUESDAY]);
    expect(days.get(MONDAY)).toEqual([first, third, fifth]);
    expect(days.get(TUESDAY)).toEqual([second, fourth]);
    expect(days.get("2026-10-07")).toBeUndefined();
  });

  it("gives each day only its own marks, in their order, whatever their kinds", () => {
    const marks = [overdue(MONDAY, "00000003"), late(TUESDAY, "a"), late(MONDAY, "b", "beyond-horizon"), overdue(TUESDAY, "00000007"), overdue(MONDAY, "00000009")];

    const days = groupBy(marks, ({ date }) => date);

    expect(days.get(MONDAY)).toEqual([marks[0], marks[2], marks[4]]);
    expect(days.get(TUESDAY)).toEqual([marks[1], marks[3]]);
  });

  it("gives each proposal only its own timing marks, in their order", () => {
    const marks = [late(MONDAY, "a"), late(TUESDAY, "b", "beyond-horizon"), late(TUESDAY, "a", "beyond-horizon")];

    const proposals = groupBy(marks.filter((mark) => "proposal" in mark), (mark) => mark.proposal);

    expect(proposals.get("a")).toEqual([marks[0], marks[2]]);
    expect(proposals.get("b")).toEqual([marks[1]]);
    expect(proposals.get("c")).toBeUndefined();
  });

  it("has no groups for an empty list", () => {
    expect(groupBy([], String).size).toBe(0);
  });
});
