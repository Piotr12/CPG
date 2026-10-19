import { z } from "zod";
import { formatDecimal, parseDecimal } from "../../domain/quantities/decimal";

/**
 * The three material types (R02). Re-declared here (equal to `@cpg/db`'s, which a test asserts) so
 * client code importing this subpath never pulls the ORM into the browser bundle.
 */
export const MATERIAL_TYPES = ["raw", "intermediate", "finished"] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

/** Longest description: the PRD sets none (D04), and a list column stays readable at this length. */
export const DESCRIPTION_MAX = 200;
/** Longest unit code (spec Q2). */
export const UNIT_MAX = 16;

/** The English messages; screens translate them by matching these constants. */
export const TYPE_MESSAGE = "Choose raw, intermediate or finished.";
export const DESCRIPTION_REQUIRED_MESSAGE = "Enter a description.";
export const DESCRIPTION_TOO_LONG_MESSAGE = `Use at most ${DESCRIPTION_MAX} characters.`;
export const UNIT_FORMAT_MESSAGE = `Use 1–${UNIT_MAX} letters, digits, dots, dashes or underscores, starting with a letter or digit.`;
export const FACTOR_MESSAGE = "Enter a number greater than 0, with at most 12 digits before the point and 6 after it.";
export const MATERIAL_ID_IMMUTABLE_MESSAGE = "A material's ID can't be changed.";

/**
 * A unit code, trimmed and otherwise kept as typed (spec Q2): `Mg` and `mg` are different units. No
 * spaces and no `/`, so a unit is always a plain URL path segment.
 */
const UNIT_PATTERN = new RegExp(`^[\\p{L}\\p{N}][\\p{L}\\p{N}._-]{0,${UNIT_MAX - 1}}$`, "u");

export const materialTypeSchema = z.enum(MATERIAL_TYPES, { error: TYPE_MESSAGE });

export const descriptionSchema = z
  .string({ error: DESCRIPTION_REQUIRED_MESSAGE })
  .trim()
  .min(1, DESCRIPTION_REQUIRED_MESSAGE)
  .max(DESCRIPTION_MAX, DESCRIPTION_TOO_LONG_MESSAGE);

export const unitSchema = z.string({ error: UNIT_FORMAT_MESSAGE }).trim().regex(UNIT_PATTERN, UNIT_FORMAT_MESSAGE);

/**
 * A conversion factor's numerator or denominator: a positive decimal **string** (spec Q3), so a JSON
 * number, a binary float, never enters. Canonicalized: `"12.50"` → `"12.5"`.
 */
export const factorSchema = z
  .string({ error: FACTOR_MESSAGE })
  .trim()
  .refine((text) => (parseDecimal(text) ?? 0n) > 0n, FACTOR_MESSAGE)
  .transform(canonical);

/** A valid decimal in its shortest form: `"12.50"` → `"12.5"`, `"007"` → `"7"`. */
function canonical(text: string): string {
  return formatDecimal(parseDecimal(text)!);
}

/** A material's business ID in a path or a reference: eight digits (R01). */
export const materialIdSchema = z.string().regex(/^\d{8}$/);
