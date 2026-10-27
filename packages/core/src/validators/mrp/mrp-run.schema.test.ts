import { describe, expect, it } from "vitest";
import { mrpRunSchema } from "./mrp-run.schema";

describe("mrpRunSchema", () => {
  it("accepts an empty body or an empty object, as a run takes no input yet", () => {
    expect(mrpRunSchema.parse(null)).toBeNull();
    expect(mrpRunSchema.parse({})).toEqual({});
  });

  it("refuses any key, so a later run option is an additive change, not a silently ignored one", () => {
    expect(mrpRunSchema.safeParse({ mode: "automatic" }).success).toBe(false);
    expect(mrpRunSchema.safeParse([]).success).toBe(false);
  });
});
