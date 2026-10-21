import { describe, expect, it } from "vitest";
import { formatSignedQuantity, parseSignedQuantity } from "./signed-quantity";

describe("signed stock quantities", () => {
  it.each([["+12", 12000000n], ["-0.000001", -1n], ["-2.5", -2500000n], ["0", 0n], ["-0", 0n], ["12.345678", 12345678n]])("parses %s exactly", (text, expected) => {
    expect(parseSignedQuantity(text)).toBe(expected);
    expect(parseSignedQuantity(formatSignedQuantity(expected))).toBe(expected);
  });
  it.each(["--1", "+-1", ".5", "1e2", "1000000000000", "0.0000001", " 1", "-"])("rejects %s", (text) => expect(parseSignedQuantity(text)).toBeNull());
  it("formats negative fractions without losing or duplicating the sign", () => {
    expect(formatSignedQuantity(-1n)).toBe("-0.000001");
    expect(formatSignedQuantity(-2500000n)).toBe("-2.500000");
    expect(formatSignedQuantity(0n)).toBe("0.000000");
  });
});
