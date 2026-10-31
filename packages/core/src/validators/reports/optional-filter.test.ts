import { describe, expect, it } from "vitest";
import { z } from "zod";
import { optionalFilter } from "./optional-filter";

describe("optionalFilter", () => {
  const filter = z.strictObject({ material: optionalFilter(z.string().regex(/^\d{8}$/)) });

  it("reads an empty value, the form's All choice, as no filter, as it does an absent one", () => {
    expect(filter.parse({ material: "" })).toEqual({});
    expect(filter.parse({})).toEqual({});
  });

  it("still validates a value that is given", () => {
    expect(filter.parse({ material: "00000001" })).toEqual({ material: "00000001" });
    expect(filter.safeParse({ material: "1" }).success).toBe(false);
  });
});
