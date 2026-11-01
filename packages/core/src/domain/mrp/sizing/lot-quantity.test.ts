import { describe, expect, it } from "vitest";
import { parseDecimal } from "../../quantities/decimal";
import { lotQuantity } from "./lot-quantity";

const q = (text: string) => parseDecimal(text)!;

describe("lotQuantity", () => {
  it.each([
    ["3", "10", "5", "10"],
    ["3", "0", "1", "3"],
    ["1.000001", "0", "0.000001", "1.000001"],
    ["1.000001", "0", "1", "2"],
    ["11", "10", "6", "12"],
    ["4.000001", "0", "2", "6"],
    ["6", "0", "1", "6"],
    ["12", "10", "5", "15"],
  ])("sizes a need of %s with minimum %s and multiple %s as %s", (need, minimum, multiple, expected) => {
    expect(lotQuantity(q(need), q(minimum), q(multiple))).toBe(q(expected));
  });

  it("raises to the minimum before rounding, so a minimum that is not a multiple still yields a whole multiple (#278 Q1)", () => {
    expect(lotQuantity(q("2"), q("10"), q("6"))).toBe(q("12"));
  });

  it("keeps a need equal to the minimum, or already on a multiple, unchanged", () => {
    expect(lotQuantity(q("10"), q("10"), q("5"))).toBe(q("10"));
    expect(lotQuantity(q("18"), q("10"), q("6"))).toBe(q("18"));
  });
});
