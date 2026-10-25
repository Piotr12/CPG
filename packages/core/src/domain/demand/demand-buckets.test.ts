import { describe, expect, it } from "vitest";
import { addDays, addMonths, bucketIndex, bucketStart, DEMAND_WINDOWS, demandWindow, isoWeek, monthStart } from "./demand-buckets";

// 2026-10-25 is a Sunday: the last day of ISO week 43, which started on Monday 19 October.
const TODAY = "2026-10-25";

describe("calendar helpers", () => {
  it("moves dates by days across months and years", () => {
    expect(addDays("2026-10-25", 7)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("finds a month's first day and moves by whole months", () => {
    expect(monthStart("2026-10-25")).toBe("2026-10-01");
    expect(addMonths("2026-10-01", 3)).toBe("2027-01-01");
    expect(addMonths("2026-10-25", -10)).toBe("2025-12-01");
  });

  it("numbers ISO weeks by the year of their Thursday", () => {
    expect(isoWeek("2026-10-25")).toEqual({ year: 2026, week: 43 });
    expect(isoWeek("2026-10-26")).toEqual({ year: 2026, week: 44 });
    expect(isoWeek("2025-12-29")).toEqual({ year: 2026, week: 1 });
    expect(isoWeek("2026-12-31")).toEqual({ year: 2026, week: 53 });
    expect(isoWeek("2027-01-03")).toEqual({ year: 2026, week: 53 });
    expect(isoWeek("2027-01-04")).toEqual({ year: 2027, week: 1 });
  });

  it("starts a bucket on the day, the ISO Monday or the 1st", () => {
    expect(bucketStart("day", TODAY)).toBe(TODAY);
    expect(bucketStart("week", TODAY)).toBe("2026-10-19");
    expect(bucketStart("week", "2026-10-19")).toBe("2026-10-19");
    expect(bucketStart("week", "1969-12-31")).toBe("1969-12-29");
    expect(bucketStart("month", TODAY)).toBe("2026-10-01");
  });
});

describe("demandWindow", () => {
  it("shows 13 weeks back and ahead around this week, today on its last day", () => {
    const window = demandWindow("week", TODAY);
    expect(window.buckets).toHaveLength(27);
    expect(window).toMatchObject({ bucket: "week", today: TODAY, from: "2026-07-20", to: "2027-01-25" });
    expect(window.buckets[13]).toEqual({ start: "2026-10-19", end: "2026-10-26", past: false, current: true, todayFraction: 6 / 7 });
    expect(window.buckets[12]).toEqual({ start: "2026-10-12", end: "2026-10-19", past: true, current: false });
    expect(window.buckets[14]).toEqual({ start: "2026-10-26", end: "2026-11-02", past: false, current: false });
    expect(window.buckets.filter(({ current }) => current)).toHaveLength(1);
  });

  it("shows 21 days each way, today at the start of its own bucket", () => {
    const window = demandWindow("day", TODAY);
    expect(window.buckets).toHaveLength(43);
    expect(window).toMatchObject({ from: "2026-10-04", to: "2026-11-16" });
    expect(window.buckets[21]).toEqual({ start: TODAY, end: "2026-10-26", past: false, current: true, todayFraction: 0 });
  });

  it("shows nine months back and six ahead, calendar months of their own lengths", () => {
    const window = demandWindow("month", TODAY);
    expect(window.buckets).toHaveLength(16);
    expect(window).toMatchObject({ from: "2026-01-01", to: "2027-05-01" });
    expect(window.buckets[9]).toEqual({ start: "2026-10-01", end: "2026-11-01", past: false, current: true, todayFraction: 24 / 31 });
    expect(window.buckets[1]).toMatchObject({ start: "2026-02-01", end: "2026-03-01", past: true });
  });

  it("moves by `ahead` buckets per offset, keeping past and current from the real today", () => {
    const later = demandWindow("week", TODAY, 1);
    expect(later.from).toBe("2026-10-19");
    expect(later.buckets[0]).toMatchObject({ current: true });
    expect(later.buckets.slice(1).every(({ past, current }) => !past && !current)).toBe(true);
    const earlier = demandWindow("month", TODAY, -1);
    expect(earlier).toMatchObject({ from: "2025-07-01", to: "2026-11-01" });
    expect(earlier.buckets.at(-1)).toMatchObject({ start: "2026-10-01", current: true });
    const far = demandWindow("day", TODAY, -20);
    expect(far.to < TODAY).toBe(true);
    expect(far.buckets.every(({ past }) => past)).toBe(true);
    expect(DEMAND_WINDOWS.day.ahead).toBe(21);
  });

  it("crosses a year through ISO week 53 into week 1", () => {
    const window = demandWindow("week", "2026-12-30");
    const current = window.buckets.findIndex(({ current }) => current);
    expect(window.buckets[current].start).toBe("2026-12-28");
    expect(isoWeek(window.buckets[current].start)).toEqual({ year: 2026, week: 53 });
    expect(window.buckets[current + 1].start).toBe("2027-01-04");
    expect(isoWeek(window.buckets[current + 1].start)).toEqual({ year: 2027, week: 1 });
  });
});

describe("bucketIndex", () => {
  it("places a date in its bucket, and nowhere outside the window", () => {
    const week = demandWindow("week", TODAY);
    expect(bucketIndex(week, "2026-07-20")).toBe(0);
    expect(bucketIndex(week, "2026-07-19")).toBeNull();
    expect(bucketIndex(week, "2026-10-21")).toBe(13);
    expect(bucketIndex(week, "2027-01-24")).toBe(26);
    expect(bucketIndex(week, "2027-01-25")).toBeNull();
    const month = demandWindow("month", TODAY);
    expect(bucketIndex(month, "2026-01-31")).toBe(0);
    expect(bucketIndex(month, "2027-01-15")).toBe(12);
    const day = demandWindow("day", TODAY);
    expect(bucketIndex(day, TODAY)).toBe(21);
    expect(bucketIndex(day, "2026-11-15")).toBe(42);
  });
});
