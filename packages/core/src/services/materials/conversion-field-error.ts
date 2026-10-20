import {
  QUANTITY_OUT_OF_RANGE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
} from "../../validators/boms/bom-fields.schema";
import { AppError } from "../../http/errors";

/** Where a form shows each refusal of `convertToBaseQuantity`, by the conversion's error code. */
const CONVERSION_ERRORS: Record<string, [field: string, message: string]> = {
  UNIT_NOT_CONVERTIBLE: ["unit", UNIT_NOT_CONVERTIBLE_MESSAGE],
  QUANTITY_ROUNDS_TO_ZERO: ["quantity", QUANTITY_ROUNDS_TO_ZERO_MESSAGE],
  QUANTITY_OUT_OF_RANGE: ["quantity", QUANTITY_OUT_OF_RANGE_MESSAGE],
};

/**
 * The field and message for a conversion's refusal (spec Q5 of the BOMs, MAT-023, MAT-032), so a
 * caller can show it next to `unit` or `quantity`; anything else is rethrown.
 */
export function conversionFieldError(error: unknown): [field: string, message: string] {
  const mapped = error instanceof AppError ? CONVERSION_ERRORS[error.code] : undefined;
  if (!mapped) throw error;
  return mapped;
}
