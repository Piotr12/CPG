import { describe, expect, it } from "vitest";
import { LOCATION_CHOICE_MESSAGE, MATERIAL_CHOICE_MESSAGE } from "../planning-parameters/planning-parameter-fields.schema";
import { MRP_GENERATION_NEEDS_RUN_MESSAGE, MRP_RUN_ID_MESSAGE, mrpLatestQuerySchema, mrpReportPageQuerySchema } from "./mrp-latest.schema";

describe("mrpLatestQuerySchema", () => {
  it("defaults to the first page of whichever run is latest", () => {
    expect(mrpLatestQuerySchema.parse({})).toEqual({ page: 1 });
  });

  it("reads the page and the run the client paged from out of the query string", () => {
    expect(mrpLatestQuerySchema.parse({ page: "3", run: "00000012" })).toEqual({ page: 3, run: "00000012" });
    expect(mrpLatestQuerySchema.parse({ run: "00000012", generation: "4" })).toEqual({ page: 1, run: "00000012", generation: 4 });
  });

  it("refuses a generation without the run it belongs to, or one that isn't a whole number from 1", () => {
    const alone = mrpLatestQuerySchema.safeParse({ generation: "4" });
    expect(alone.error?.issues[0]).toMatchObject({ path: ["generation"], message: MRP_GENERATION_NEEDS_RUN_MESSAGE });
    expect(mrpLatestQuerySchema.safeParse({ run: "00000012", generation: "0" }).success).toBe(false);
  });

  it.each([{ page: "0" }, { page: "1.5" }, { page: "page" }, { page: "1000001" }])("refuses page %o", (query) => {
    expect(mrpLatestQuerySchema.safeParse(query).success).toBe(false);
  });

  it("refuses a run that isn't an eight-digit ID, naming the rule", () => {
    const parsed = mrpLatestQuerySchema.safeParse({ run: "12" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]).toMatchObject({ path: ["run"], message: MRP_RUN_ID_MESSAGE });
  });

  it("refuses another parameter, so a misspelt one never silently shows something else", () => {
    expect(mrpLatestQuerySchema.safeParse({ pages: "2" }).success).toBe(false);
  });

  it("filters by a material and a location, and reads an empty value, the form's All, as no filter (E18-S01)", () => {
    expect(mrpLatestQuerySchema.parse({ material: "00000012", location: "00000003", page: "2" })).toEqual({ material: "00000012", location: "00000003", page: 2 });
    expect(mrpLatestQuerySchema.parse({ material: "", location: "" })).toEqual({ page: 1 });
  });

  it("refuses a filter that isn't an eight-digit ID, naming the field", () => {
    expect(mrpLatestQuerySchema.safeParse({ material: "12" }).error?.issues[0]).toMatchObject({ path: ["material"], message: MATERIAL_CHOICE_MESSAGE });
    expect(mrpLatestQuerySchema.safeParse({ location: "x" }).error?.issues[0]).toMatchObject({ path: ["location"], message: LOCATION_CHOICE_MESSAGE });
  });
});

describe("mrpReportPageQuerySchema", () => {
  it("takes the page's filters and page", () => {
    expect(mrpReportPageQuerySchema.parse({ material: "00000012", location: "", page: "3" })).toEqual({ material: "00000012", page: 3 });
    expect(mrpReportPageQuerySchema.parse({})).toEqual({ page: 1 });
  });

  it("refuses run and generation, since the page always shows the latest run, and any other parameter", () => {
    expect(mrpReportPageQuerySchema.safeParse({ run: "00000001" }).success).toBe(false);
    expect(mrpReportPageQuerySchema.safeParse({ generation: "1" }).success).toBe(false);
    expect(mrpReportPageQuerySchema.safeParse({ includeZero: "true" }).success).toBe(false);
    expect(mrpReportPageQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });
});
