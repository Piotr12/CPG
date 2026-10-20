import { z } from "zod";
import { formatDecimal, parseDecimal } from "../../domain/quantities/decimal";

/** The English messages; screens translate them by matching these constants. */
export const QUANTITY_MESSAGE = "Enter a number of at least 0, with at most 12 digits before the point and 6 after it.";
export const POSITIVE_QUANTITY_MESSAGE =
  "Enter a number greater than 0, with at most 12 digits before the point and 6 after it.";

/** A valid decimal as a stored base-unit quantity: always six decimals (`"10.5"` → `"10.500000"`). */
function stored(text: string): string {
  return formatDecimal(parseDecimal(text)!, { fixed: true });
}

/**
 * A base-unit quantity of at least 0 (R03): a decimal **string**, so a JSON number never enters, with
 * at most 12 integer and 6 fractional digits, normalized to the six-decimal form every stored
 * quantity has (the `toBaseQuantity` form).
 */
export const quantitySchema = z
  .string({ error: QUANTITY_MESSAGE })
  .trim()
  .refine((text) => parseDecimal(text) !== null, QUANTITY_MESSAGE)
  .transform(stored);

/** A base-unit quantity greater than 0, such as a lot multiple. */
export const positiveQuantitySchema = z
  .string({ error: POSITIVE_QUANTITY_MESSAGE })
  .trim()
  .refine((text) => (parseDecimal(text) ?? 0n) > 0n, POSITIVE_QUANTITY_MESSAGE)
  .transform(stored);
