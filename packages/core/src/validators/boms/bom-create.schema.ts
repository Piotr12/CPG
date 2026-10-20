import { z } from "zod";
import { calendarDateSchema } from "../dates/calendar-date.schema";
import {
  componentsSchema,
  outputReferenceSchema,
  prioritySchema,
  priorityTextSchema,
  throughNotBeforeFrom,
  validThroughSchema,
  validThroughTextSchema,
} from "./bom-fields.schema";

/**
 * `POST /api/tenants/{tenant}/boms`: the output and the first recipe (spec Q13). The priority is a
 * JSON integer, quantities are decimal strings, and `validThrough` may be left out for no end. The
 * material types, conversions and cross-BOM rules are the service's checks.
 */
export const bomCreateBodySchema = z
  .object({
    output: outputReferenceSchema,
    priority: prioritySchema,
    validFrom: calendarDateSchema,
    validThrough: validThroughSchema.default(null),
    components: componentsSchema,
  })
  .superRefine(throughNotBeforeFrom);

export type BomCreateBody = z.infer<typeof bomCreateBodySchema>;

/** The recipe form's fields: the priority as text, and an empty valid-through for no end. */
export const bomRecipeFormSchema = z
  .object({
    priority: priorityTextSchema,
    validFrom: calendarDateSchema,
    validThrough: validThroughTextSchema,
    components: componentsSchema,
  })
  .superRefine(throughNotBeforeFrom);

/** The Create BOM form and its `createBom` action: the recipe form plus the output. */
export const bomCreateFormSchema = bomRecipeFormSchema.safeExtend({ output: outputReferenceSchema });
