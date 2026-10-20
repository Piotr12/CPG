import { AppError } from "../../http/errors";
import {
  QUANTITY_OUT_OF_RANGE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
} from "../../validators/boms/bom-fields.schema";

/** Where a line shows each refusal of its conversion (BOMs spec Q5), by the conversion's error code. */
const LINE_ERRORS: Record<string, [field: string, message: string]> = {
  UNIT_NOT_CONVERTIBLE: ["unit", UNIT_NOT_CONVERTIBLE_MESSAGE],
  QUANTITY_ROUNDS_TO_ZERO: ["quantity", QUANTITY_ROUNDS_TO_ZERO_MESSAGE],
  QUANTITY_OUT_OF_RANGE: ["quantity", QUANTITY_OUT_OF_RANGE_MESSAGE],
};

/**
 * The line field and message for a conversion's refusal; anything else is rethrown. Shared by every
 * document whose lines enter a quantity in any unit (BOM components, requisitions, order lines).
 */
export function lineError(error: unknown): [field: string, message: string] {
  const mapped = error instanceof AppError ? LINE_ERRORS[error.code] : undefined;
  if (!mapped) throw error;
  return mapped;
}
