import { describe, expect, it } from "vitest";
import { AppError } from "../../http/errors";
import {
  QUANTITY_OUT_OF_RANGE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
} from "../../validators/boms/bom-fields.schema";
import { lineError } from "./line-error";

describe("lineError", () => {
  it("puts each refusal of a conversion on the line field it belongs to", () => {
    expect(lineError(new AppError("UNIT_NOT_CONVERTIBLE", "x"))).toEqual(["unit", UNIT_NOT_CONVERTIBLE_MESSAGE]);
    expect(lineError(new AppError("QUANTITY_ROUNDS_TO_ZERO", "x"))).toEqual(["quantity", QUANTITY_ROUNDS_TO_ZERO_MESSAGE]);
    expect(lineError(new AppError("QUANTITY_OUT_OF_RANGE", "x"))).toEqual(["quantity", QUANTITY_OUT_OF_RANGE_MESSAGE]);
  });

  it("rethrows anything else", () => {
    const other = new AppError("SOMETHING_ELSE", "x");
    expect(() => lineError(other)).toThrow(other);
    const plain = new Error("boom");
    expect(() => lineError(plain)).toThrow(plain);
  });
});
