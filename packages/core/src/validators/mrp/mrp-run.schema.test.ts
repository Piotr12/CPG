import { MRP_RUN_MODES } from "@cpg/db";
import { describe, expect, it } from "vitest";
import { MRP_RUN_INPUT_MODES, mrpRunSchema } from "./mrp-run.schema";

describe("mrpRunSchema", () => {
  it("accepts an empty body, an empty object, or either mode (E19-S03)", () => {
    expect(mrpRunSchema.parse(null)).toBeNull();
    expect(mrpRunSchema.parse({})).toEqual({});
    expect(mrpRunSchema.parse({ mode: "manual" })).toEqual({ mode: "manual" });
    expect(mrpRunSchema.parse({ mode: "automatic" })).toEqual({ mode: "automatic" });
  });

  it("refuses another mode, a null mode and any other key, so a later run option stays an additive change", () => {
    expect(mrpRunSchema.safeParse({ mode: "auto" }).success).toBe(false);
    expect(mrpRunSchema.safeParse({ mode: null }).success).toBe(false);
    expect(mrpRunSchema.safeParse({ extra: 1 }).success).toBe(false);
    expect(mrpRunSchema.safeParse([]).success).toBe(false);
  });

  it("offers exactly the modes the run's column allows", () => {
    expect(MRP_RUN_INPUT_MODES).toEqual(MRP_RUN_MODES);
  });
});
