import { describe, expect, it } from "vitest";
import { readRow } from "./readable";

const factor = { numerator: "12", denominator: "1" };

describe("readRow", () => {
  it("reads every quantity as micro-units when the factor is above zero and every date is real", () => {
    expect(readRow({ quantities: { quantity: "2.5", fulfilled: "0.000000" }, factor, dates: ["2026-11-05"] })).toEqual({ quantity: 2_500_000n, fulfilled: 0n });
    expect(readRow({ quantities: { quantity: "7" } })).toEqual({ quantity: 7_000_000n });
  });

  it("refuses a quantity that isn't a six-decimal number of zero or more: text, a sign, seven decimals", () => {
    for (const text of ["abc", "-3", "1.0000001", "", "1e3"]) expect(readRow({ quantities: { quantity: "1", other: text } })).toBeNull();
  });

  it("refuses a factor whose numerator or denominator is zero, negative or not a number, never assuming 1:1 (MAT-023)", () => {
    for (const bad of [
      { numerator: "1", denominator: "0" },
      { numerator: "0", denominator: "1" },
      { numerator: "1", denominator: "-2" },
      { numerator: "x", denominator: "1" },
    ]) {
      expect(readRow({ quantities: { quantity: "1" }, factor: bad })).toBeNull();
    }
  });

  it("refuses a date that isn't a real YYYY-MM-DD day", () => {
    for (const date of ["2026-11-5", "2026-02-30", "soon"]) expect(readRow({ quantities: { quantity: "1" }, dates: ["2026-11-01", date] })).toBeNull();
  });
});
