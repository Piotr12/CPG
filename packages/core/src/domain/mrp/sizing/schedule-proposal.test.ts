import { describe, expect, it } from "vitest";
import { addDays } from "../../demand/demand-buckets";
import { MRP_HORIZON_DAYS } from "../projection/horizon";
import { scheduleProposal } from "./schedule-proposal";

const TODAY = "2026-10-01";
const day = (offset: number) => addDays(TODAY, offset);
const schedule = (needDate: string, leadTimeDays: number) => scheduleProposal(needDate, leadTimeDays, TODAY, MRP_HORIZON_DAYS);

describe("scheduleProposal", () => {
  it("MAT-018: a need on 15 October with a lead time of 7 starts on 8 October, seven calendar days with the weekend, on time", () => {
    // 10 and 11 October 2026 are a weekend: seven business days earlier would be 6 October.
    expect(schedule("2026-10-15", 7)).toEqual({ plannedStart: "2026-10-08", plannedFinish: "2026-10-15", lateDays: 0, beyondHorizon: false });
  });

  it("starts exactly today when the lead time reaches back to today, and is not late", () => {
    expect(schedule(day(7), 7)).toEqual({ plannedStart: TODAY, plannedFinish: day(7), lateDays: 0, beyondHorizon: false });
  });

  it("MRP-037: a need on day 3 with a lead time of 7 starts today, finishes on day 7 and is 4 days late, the need unchanged", () => {
    expect(schedule("2026-10-04", 7)).toEqual({ plannedStart: TODAY, plannedFinish: "2026-10-08", lateDays: 4, beyondHorizon: false });
  });

  it("MRP-038: a need before today starts today and is late from its own date, never starting in the past", () => {
    expect(schedule(day(-1), 4)).toEqual({ plannedStart: TODAY, plannedFinish: day(4), lateDays: 5, beyondHorizon: false });
    expect(schedule(TODAY, 4)).toEqual({ plannedStart: TODAY, plannedFinish: day(4), lateDays: 4, beyondHorizon: false });
  });

  it("with a lead time of 0 starts and finishes on the need date", () => {
    expect(schedule(TODAY, 0)).toEqual({ plannedStart: TODAY, plannedFinish: TODAY, lateDays: 0, beyondHorizon: false });
    expect(schedule(day(30), 0)).toEqual({ plannedStart: day(30), plannedFinish: day(30), lateDays: 0, beyondHorizon: false });
  });

  it("MRP-049: a need on day 20 with a Buy lead time of 120 finishes on day 120, 100 days late, Beyond Horizon", () => {
    expect(schedule(day(20), 120)).toEqual({ plannedStart: TODAY, plannedFinish: day(120), lateDays: 100, beyondHorizon: true });
  });

  it("keeps a finish on day 89 inside the horizon and puts one on day 90 beyond it", () => {
    expect(schedule(day(10), 89)).toMatchObject({ plannedFinish: day(89), beyondHorizon: false });
    expect(schedule(day(10), 90)).toMatchObject({ plannedFinish: day(90), beyondHorizon: true });
    expect(schedule(day(89), 0)).toMatchObject({ plannedFinish: day(89), beyondHorizon: false });
  });
});
