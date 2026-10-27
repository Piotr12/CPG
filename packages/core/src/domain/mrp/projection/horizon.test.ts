import { describe, expect, it } from "vitest";
import { addDays } from "../../demand/demand-buckets";
import { horizonDates, MRP_HORIZON_DAYS } from "./horizon";

describe("MRP horizon", () => {
  it("MRP-003: today 1 October gives 90 dates, 1 October through 29 December, each one day after the last", () => {
    const dates = horizonDates("2026-10-01");
    expect(MRP_HORIZON_DAYS).toBe(90);
    expect(dates).toHaveLength(90);
    expect(dates[0]).toBe("2026-10-01");
    expect(dates.at(-1)).toBe("2026-12-29");
    expect(new Set(dates).size).toBe(90);
    for (let day = 1; day < dates.length; day++) expect(dates[day]).toBe(addDays(dates[day - 1], 1));
  });

  it("crosses a year boundary by UTC days", () => {
    const dates = horizonDates("2026-12-15");
    expect(dates[16]).toBe("2026-12-31");
    expect(dates[17]).toBe("2027-01-01");
    expect(dates.at(-1)).toBe("2027-03-14");
  });
});
