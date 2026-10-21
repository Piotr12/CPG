import { describe, expect, it } from "vitest";
import {
  addDays,
  addWeekdays,
  isWeekday,
  lastWeekday,
  monthLabel,
  monthOf,
  monthOfYear,
  monthStart,
  nthWeekday,
  weekdaysOf,
  yearOf,
} from "./calendar";

describe("months", () => {
  it("number months so they add like integers, across year ends", () => {
    const october = monthOf("2026-10-21");
    expect(october).toBe(2026 * 12 + 9);
    expect(monthStart(october + 3)).toBe("2027-01-01");
    expect(monthStart(october - 10)).toBe("2025-12-01");
    expect(monthLabel(october - 24)).toBe("2024-10");
    expect([yearOf(october + 3), monthOfYear(october + 3)]).toEqual([2027, 0]);
  });
});

describe("addDays", () => {
  it("moves across month ends, leap days and year ends in UTC", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });
});

describe("weekdays", () => {
  it("lists October 2026's 22 weekdays, Monday to Friday", () => {
    const weekdays = weekdaysOf(monthOf("2026-10-01"));
    expect(weekdays).toHaveLength(22);
    expect(weekdays.slice(0, 3)).toEqual(["2026-10-01", "2026-10-02", "2026-10-05"]);
    expect(weekdays.every(isWeekday)).toBe(true);
    expect(weekdaysOf(monthOf("2026-10-01"))).toBe(weekdays);
  });

  it("gives February 20 weekdays, or 21 in a leap year that starts it on a weekday", () => {
    expect(weekdaysOf(monthOf("2026-02-01"))).toHaveLength(20);
    expect(weekdaysOf(monthOf("2024-02-01"))).toHaveLength(21);
  });

  it("tells weekends from weekdays", () => {
    expect(["2026-10-17", "2026-10-18", "2026-10-19"].map(isWeekday)).toEqual([false, false, true]);
  });

  it("finds the n-th and the last weekday of a month, and refuses one past the last", () => {
    const october = monthOf("2026-10-01");
    expect(nthWeekday(october, 1)).toBe("2026-10-01");
    expect(nthWeekday(october, 8)).toBe("2026-10-12");
    expect(nthWeekday(october, 20)).toBe("2026-10-28");
    expect(lastWeekday(october)).toBe("2026-10-30");
    expect(() => nthWeekday(monthOf("2026-02-01"), 21)).toThrow("2026-02 has no weekday 21.");
  });

  it("counts weekdays forwards and backwards over weekends", () => {
    expect(addWeekdays("2026-10-19", -2)).toBe("2026-10-15");
    expect(addWeekdays("2026-10-16", 3)).toBe("2026-10-21");
    expect(addWeekdays("2026-10-18", -3)).toBe("2026-10-14");
    expect(addWeekdays("2026-10-18", 0)).toBe("2026-10-18");
  });
});
