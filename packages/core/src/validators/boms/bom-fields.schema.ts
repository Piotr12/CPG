import { z } from "zod";
import { BOM_COMPONENTS_MAX, BOM_PRIORITY_MAX } from "../../domain/boms/recipe-rules";
import { formatDecimal, parseDecimal } from "../../domain/quantities/decimal";
import { BUSINESS_ID_PATTERN } from "../business-ids/business-id.schema";
import { CALENDAR_DATE_MESSAGE, calendarDateSchema } from "../dates/calendar-date.schema";
import { unitSchema } from "../materials/material-fields.schema";
import { materialReferenceSchema } from "../planning-parameters/planning-parameter-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "../quantities/quantity.schema";

/** The English messages; screens translate them by matching these constants. */
export const OUTPUT_CHOICE_MESSAGE = "Choose the material this BOM makes.";
export const PRIORITY_MESSAGE = `Enter a whole number from 1 to ${BOM_PRIORITY_MAX}; 1 is the highest.`;
export const VALID_THROUGH_BEFORE_FROM_MESSAGE = "Valid through can't be before valid from.";
export const COMPONENT_COUNT_MESSAGE = `Add at least 1 and at most ${BOM_COMPONENTS_MAX} components.`;
export const DUPLICATE_COMPONENT_MESSAGE = "This material is already in the BOM: enter its total quantity once.";
export const BOM_ID_IMMUTABLE_MESSAGE = "A BOM's ID can't be changed.";
export const BOM_OUTPUT_IMMUTABLE_MESSAGE = "A BOM's output can't be changed: create a new BOM.";

/** A BOM referenced by its eight-digit ID, in a path or bound by a page. */
export const bomIdSchema = z.string().regex(BUSINESS_ID_PATTERN);

/** The material a BOM makes, by its eight-digit business ID. */
export const outputReferenceSchema = z
  .string({ error: OUTPUT_CHOICE_MESSAGE })
  .regex(BUSINESS_ID_PATTERN, OUTPUT_CHOICE_MESSAGE);

/** A priority as the API sends it: a JSON integer from 1 (the highest) to 999 (spec Q4). */
export const prioritySchema = z
  .number({ error: PRIORITY_MESSAGE })
  .int(PRIORITY_MESSAGE)
  .min(1, PRIORITY_MESSAGE)
  .max(BOM_PRIORITY_MAX, PRIORITY_MESSAGE);

/** The same priority as a form field sends it: digits only, so `1.5`, `-1` and `1e2` stay errors. */
export const priorityTextSchema = z
  .string({ error: PRIORITY_MESSAGE })
  .trim()
  .regex(/^\d{1,3}$/, PRIORITY_MESSAGE)
  .transform(Number)
  .pipe(prioritySchema);

/** The last valid day, included, or null for no end (spec Q4). */
export const validThroughSchema = calendarDateSchema.nullable();

/** The same as a form field sends it: an empty date input means no end. */
export const validThroughTextSchema = z
  .string({ error: CALENDAR_DATE_MESSAGE })
  .trim()
  .transform((text) => (text === "" ? null : text))
  .pipe(validThroughSchema);

/**
 * A quantity as entered, in any unit the material converts: a decimal string greater than 0 with at
 * most 12 integer and 6 fractional digits (R03), without trailing zeros (`"2.0"` → `"2"`), so an
 * unchanged line is recognised when an edit resends it (spec Q6).
 */
export const enteredQuantitySchema = z
  .string({ error: POSITIVE_QUANTITY_MESSAGE })
  .trim()
  .refine((text) => (parseDecimal(text) ?? 0n) > 0n, POSITIVE_QUANTITY_MESSAGE)
  .transform((text) => formatDecimal(parseDecimal(text)!));

/** One line: a material, and how much of it one output base unit needs, in `unit` (spec Q5). */
export const componentLineSchema = z.object({
  material: materialReferenceSchema,
  quantity: enteredQuantitySchema,
  unit: unitSchema,
});

export type ComponentLineInput = z.infer<typeof componentLineSchema>;

/** 1 to 100 lines, each with a different material (spec Q5); a repeat is an error on its material. */
export const componentsSchema = z
  .array(componentLineSchema, { error: COMPONENT_COUNT_MESSAGE })
  .min(1, COMPONENT_COUNT_MESSAGE)
  .max(BOM_COMPONENTS_MAX, COMPONENT_COUNT_MESSAGE)
  .superRefine((lines, ctx) => {
    const seen = new Set<string>();
    lines.forEach(({ material }, index) => {
      if (seen.has(material)) ctx.addIssue({ code: "custom", path: [index, "material"], message: DUPLICATE_COMPONENT_MESSAGE });
      seen.add(material);
    });
  });

/** Refuses a valid-through date before the valid-from date, on `validThrough`, when both are given. */
export function throughNotBeforeFrom(value: { validFrom?: string; validThrough?: string | null }, ctx: z.RefinementCtx): void {
  const { validFrom, validThrough } = value;
  if (validFrom !== undefined && validThrough && validThrough < validFrom) {
    ctx.addIssue({ code: "custom", path: ["validThrough"], message: VALID_THROUGH_BEFORE_FROM_MESSAGE });
  }
}

/** What the service says, next to the field, about a material that can't play its part (R02). */
export const RAW_OUTPUT_MESSAGE = "A raw material can't be a BOM's output: it is always bought.";
export const FINISHED_COMPONENT_MESSAGE = "A finished material can't be a component.";
/** What the service says about a line its conversion refuses (MAT-023, MAT-032). */
export const UNIT_NOT_CONVERTIBLE_MESSAGE = "This material has no conversion from this unit to its base unit.";
export const QUANTITY_ROUNDS_TO_ZERO_MESSAGE = "This quantity is less than 0.000001 of the material's base unit.";
export const QUANTITY_OUT_OF_RANGE_MESSAGE = "This quantity is too large to store in the material's base unit.";
