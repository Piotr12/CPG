import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addWeekdays,
  dayNumber,
  daysInMonth,
  isoWeekday,
  isWeekday,
  mondayOf,
  monthEnd,
  monthLabel,
  monthOf,
  monthOfYear,
  monthStart,
  nthWeekday,
  weekdaysFrom,
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

  it("knows each month's last day and length, leap Februaries included", () => {
    expect([monthEnd(monthOf("2026-10-01")), monthEnd(monthOf("2024-02-01")), monthEnd(monthOf("2025-12-01"))]).toEqual(["2026-10-31", "2024-02-29", "2025-12-31"]);
    expect([daysInMonth(monthOf("2026-02-01")), daysInMonth(monthOf("2024-02-01")), daysInMonth(monthOf("2026-04-01"))]).toEqual([28, 29, 30]);
  });

  it("adds whole months, keeping the day or taking a shorter month's last", () => {
    expect(addMonths("2026-10-21", 12)).toBe("2027-10-21");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2027-01-31", 13)).toBe("2028-02-29");
    expect(addMonths("2026-10-21", -10)).toBe("2025-12-21");
  });
});

describe("addDays", () => {
  it("moves across month ends, leap days and year ends in UTC", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("numbers days from 1970-01-01, so day counts subtract", () => {
    expect(dayNumber("1970-01-01")).toBe(0);
    expect(dayNumber("2026-10-21") - dayNumber("2025-10-21")).toBe(365);
    expect(dayNumber("2024-03-01") - dayNumber("2024-02-28")).toBe(2);
  });
});

describe("weeks", () => {
  it("numbers ISO weekdays from Monday (1) to Sunday (7) and finds a week's Monday", () => {
    expect(["2026-10-19", "2026-10-23", "2026-10-24", "2026-10-25"].map(isoWeekday)).toEqual([1, 5, 6, 7]);
    expect(["2026-10-19", "2026-10-22", "2026-10-25", "2027-01-01"].map(mondayOf)).toEqual(["2026-10-19", "2026-10-19", "2026-10-19", "2026-12-28"]);
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

  it("finds the n-th weekday of a month, and refuses one past the last", () => {
    const october = monthOf("2026-10-01");
    expect(nthWeekday(october, 1)).toBe("2026-10-01");
    expect(nthWeekday(october, 8)).toBe("2026-10-12");
    expect(nthWeekday(october, 22)).toBe("2026-10-30");
    expect(() => nthWeekday(monthOf("2026-02-01"), 21)).toThrow("2026-02 has no weekday 21.");
  });

  it("lists the weekdays between two dates, both ends included when they are weekdays", () => {
    expect(weekdaysFrom("2026-10-16", "2026-10-20")).toEqual(["2026-10-16", "2026-10-19", "2026-10-20"]);
    expect(weekdaysFrom("2026-10-17", "2026-10-18")).toEqual([]);
    expect(weekdaysFrom("2026-10-01", "2026-10-31")).toEqual(weekdaysOf(monthOf("2026-10-01")));
  });

  it("counts weekdays forwards and backwards over weekends", () => {
    expect(addWeekdays("2026-10-19", -2)).toBe("2026-10-15");
    expect(addWeekdays("2026-10-16", 3)).toBe("2026-10-21");
    expect(addWeekdays("2026-10-18", -3)).toBe("2026-10-14");
    expect(addWeekdays("2026-10-18", 0)).toBe("2026-10-18");
  });
});
