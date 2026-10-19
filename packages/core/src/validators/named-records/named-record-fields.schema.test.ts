import { NAMED_RECORD_NAME_MAX } from "@cpg/db";
import { describe, expect, it } from "vitest";
import { NAME_MAX, NAME_REQUIRED_MESSAGE, NAME_TOO_LONG_MESSAGE, nameSchema } from "./named-record-fields.schema";

describe("nameSchema", () => {
  it("matches the column length in @cpg/db", () => {
    expect(NAME_MAX).toBe(NAMED_RECORD_NAME_MAX);
  });

  it("trims and keeps 1 to 100 characters", () => {
    expect(nameSchema.parse("  Main plant, Wrocław ")).toBe("Main plant, Wrocław");
    expect(nameSchema.parse("x".repeat(100))).toHaveLength(100);
  });

  it("refuses a blank, missing or too long name (spec Q3)", () => {
    for (const [value, message] of [
      ["", NAME_REQUIRED_MESSAGE],
      ["   ", NAME_REQUIRED_MESSAGE],
      [undefined, NAME_REQUIRED_MESSAGE],
      [42, NAME_REQUIRED_MESSAGE],
      ["x".repeat(101), NAME_TOO_LONG_MESSAGE],
    ] as const) {
      expect(nameSchema.safeParse(value).error?.issues[0]?.message).toBe(message);
    }
  });
});
