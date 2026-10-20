import { describe, expect, it } from "vitest";
import { AppError } from "../../http/errors";
import {
  QUANTITY_OUT_OF_RANGE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
} from "../../validators/boms/bom-fields.schema";
import { conversionFieldError } from "./conversion-field-error";

describe("conversionFieldError", () => {
  it.each([
    ["UNIT_NOT_CONVERTIBLE", "unit", UNIT_NOT_CONVERTIBLE_MESSAGE],
    ["QUANTITY_ROUNDS_TO_ZERO", "quantity", QUANTITY_ROUNDS_TO_ZERO_MESSAGE],
    ["QUANTITY_OUT_OF_RANGE", "quantity", QUANTITY_OUT_OF_RANGE_MESSAGE],
  ])("puts %s on %s", (code, field, message) => {
    expect(conversionFieldError(new AppError(code, "refused"))).toEqual([field, message]);
  });

  it("rethrows an error of another code, and anything that is not an AppError", () => {
    const other = new AppError("OTHER", "x");
    expect(() => conversionFieldError(other)).toThrow(other);
    expect(() => conversionFieldError("boom")).toThrow("boom");
  });
});
