import { describe, expect, it } from "vitest";
import { DEMAND_OFFSET_MESSAGE, DEMAND_SELECTION_MESSAGE, demandReviewQuerySchema } from "./demand-review.schema";

const ids = (count: number) => Array.from({ length: count }, (_, index) => String(index + 1).padStart(8, "0"));

describe("demandReviewQuerySchema", () => {
  it("defaults to weeks around today, every product and location, the default unit", () => {
    expect(demandReviewQuerySchema.parse({})).toEqual({ bucket: "week", material: [], location: [], offset: 0 });
  });

  it("reads one value or repeated values, dropping empty ones and repeats", () => {
    expect(demandReviewQuerySchema.parse({ bucket: "month", material: "00000001", location: ["00000002", "", "00000003", "00000002"], unit: " pallet ", offset: "-3" })).toEqual({
      bucket: "month", material: ["00000001"], location: ["00000002", "00000003"], unit: "pallet", offset: -3,
    });
    expect(demandReviewQuerySchema.parse({ material: "", unit: "  " })).toEqual({ bucket: "week", material: [], location: [], offset: 0 });
  });

  it("accepts 500 products and refuses 501, counting a repeated one once", () => {
    expect(demandReviewQuerySchema.parse({ material: ids(500) }).material).toHaveLength(500);
    expect(demandReviewQuerySchema.parse({ material: [...ids(500), "00000001"] }).material).toHaveLength(500);
    const refused = demandReviewQuerySchema.safeParse({ material: ids(501) });
    expect(refused.error?.issues).toEqual([expect.objectContaining({ path: ["material"], message: DEMAND_SELECTION_MESSAGE })]);
  });

  it("moves at most 20 windows either way, in whole steps", () => {
    expect(demandReviewQuerySchema.parse({ offset: "20" }).offset).toBe(20);
    expect(demandReviewQuerySchema.parse({ offset: "-20" }).offset).toBe(-20);
    for (const offset of ["21", "-21", "1.5", "abc"]) {
      expect(demandReviewQuerySchema.safeParse({ offset }).error?.issues[0]?.message, offset).toBe(DEMAND_OFFSET_MESSAGE);
    }
  });

  it("refuses an unknown bucket, a malformed reference and an unknown parameter", () => {
    for (const query of [{ bucket: "year" }, { material: "1" }, { location: ["00000001", "x"] }, { materials: "00000001" }, { unit: 3 }]) {
      expect(demandReviewQuerySchema.safeParse(query).success, JSON.stringify(query)).toBe(false);
    }
  });
});
