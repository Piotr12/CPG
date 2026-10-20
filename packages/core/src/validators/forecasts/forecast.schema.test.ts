import { describe, expect, it } from "vitest";
import { CALENDAR_DATE_MESSAGE } from "../dates/calendar-date.schema";
import { UNIT_FORMAT_MESSAGE } from "../materials/material-fields.schema";
import { MATERIAL_CHOICE_MESSAGE } from "../planning-parameters/planning-parameter-fields.schema";
import { QUANTITY_MESSAGE } from "../quantities/quantity.schema";
import {
  forecastChangeBodySchema,
  forecastChangeFormSchema,
  forecastChangeSchema,
  forecastCreateSchema,
  forecastFilterSchema,
  forecastRemoveBodySchema,
  forecastRemoveSchema,
} from "./forecast.schema";

const forecast = { material: "00000005", location: "00000001", date: "2027-01-01", quantity: "20" };

describe("forecastCreateSchema", () => {
  it("parses a forecast with no customer, the quantity in the six-decimal form (DEM-001)", () => {
    expect(forecastCreateSchema.parse(forecast)).toEqual({ ...forecast, quantity: "20.000000" });
  });

  it("keeps the unit the quantity is entered in, and reads a blank one as none", () => {
    expect(forecastCreateSchema.parse({ ...forecast, unit: " case " }).unit).toBe("case");
    expect(forecastCreateSchema.parse({ ...forecast, unit: "  " }).unit).toBeUndefined();
  });

  it("accepts a forecast of 0", () => {
    expect(forecastCreateSchema.parse({ ...forecast, quantity: "0" }).quantity).toBe("0.000000");
  });

  it("refuses an impossible date, a negative quantity and a malformed unit", () => {
    const result = forecastCreateSchema.safeParse({ ...forecast, date: "2026-02-30", quantity: "-1", unit: "no good" });
    expect(result.error?.issues.map(({ path, message }) => [path[0], message])).toEqual([
      ["date", CALENDAR_DATE_MESSAGE],
      ["quantity", QUANTITY_MESSAGE],
      ["unit", UNIT_FORMAT_MESSAGE],
    ]);
  });
});

describe("change and remove", () => {
  const row = { material: "00000005", location: "00000001", date: "2027-01-01", version: 2 };

  it("change a quantity at a version, by API body or bound row", () => {
    expect(forecastChangeBodySchema.parse({ quantity: "40", version: 2 })).toEqual({ quantity: "40.000000", version: 2 });
    expect(forecastChangeBodySchema.parse({ quantity: "40", unit: "box", version: 2 }).unit).toBe("box");
    expect(forecastChangeFormSchema.parse({ quantity: "40", unit: "" })).toEqual({ quantity: "40.000000" });
    expect(forecastChangeSchema.parse({ quantity: "40", ...row })).toEqual({ quantity: "40.000000", ...row });
    expect(forecastChangeBodySchema.safeParse({ quantity: "40" }).success).toBe(false);
  });

  it("remove at a version, by API body or bound row", () => {
    expect(forecastRemoveBodySchema.parse({ version: 2 })).toEqual({ version: 2 });
    expect(forecastRemoveSchema.parse(row)).toEqual(row);
    expect(forecastRemoveSchema.safeParse({ ...row, date: "2027-1-1" }).success).toBe(false);
  });
});

describe("forecastFilterSchema", () => {
  it("reads blank or missing fields as no filter", () => {
    expect(forecastFilterSchema.parse({})).toEqual({});
    expect(forecastFilterSchema.parse({ material: "", location: " " })).toEqual({});
  });

  it("keeps a material and a location business ID", () => {
    expect(forecastFilterSchema.parse({ material: "00000005", location: "00000001" })).toEqual({
      material: "00000005",
      location: "00000001",
    });
  });

  it("refuses anything that is not a business ID", () => {
    const result = forecastFilterSchema.safeParse({ material: "cabinet" });
    expect(result.error?.issues.map(({ path, message }) => [path[0], message])).toEqual([["material", MATERIAL_CHOICE_MESSAGE]]);
  });
});
