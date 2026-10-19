import { describe, expect, it } from "vitest";
import { businessIdSchema } from "./business-id.schema";

describe("businessIdSchema", () => {
  it("takes exactly eight digits", () => {
    expect(businessIdSchema.safeParse("00000001").success).toBe(true);
    for (const id of ["1", "0000001", "000000001", "0000000a", " 00000001", 1]) {
      expect(businessIdSchema.safeParse(id).success).toBe(false);
    }
  });
});
