import { describe, expect, it } from "vitest";
import { CALENDAR_DATE_MESSAGE, calendarDateSchema, isCalendarDate } from "./calendar-date.schema";

describe("isCalendarDate", () => {
  it.each(["2026-01-01", "2028-02-29", "9999-12-31", "0001-01-01"])("accepts %s", (text) => {
    expect(isCalendarDate(text)).toBe(true);
  });

  it.each(["2026-02-30", "2027-02-29", "2026-13-01", "2026-00-10", "2026-2-1", "20260201", "2026-01-01T00:00", ""])(
    "refuses %j",
    (text) => {
      expect(isCalendarDate(text)).toBe(false);
    },
  );
});

describe("calendarDateSchema", () => {
  it("trims and keeps the ISO text", () => {
    expect(calendarDateSchema.parse(" 2027-01-01 ")).toBe("2027-01-01");
  });

  it.each(["2026-02-30", 20270101])("refuses %j with one message", (value) => {
    expect(calendarDateSchema.safeParse(value).error?.issues.map(({ message }) => message)).toEqual([CALENDAR_DATE_MESSAGE]);
  });
});
