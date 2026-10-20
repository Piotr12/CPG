import { z } from "zod";
import { IMPORT_REFERENCE_MAX } from "../../domain/imports/workbook-layout";
import {
  enteredQuantitySchema,
  outputReferenceSchema,
  priorityTextSchema,
  throughNotBeforeFrom,
  validThroughSchema,
} from "../boms/bom-fields.schema";
import { BUSINESS_ID_PATTERN } from "../business-ids/business-id.schema";
import { calendarDateSchema } from "../dates/calendar-date.schema";
import { descriptionSchema, factorSchema, materialTypeSchema, unitSchema } from "../materials/material-fields.schema";
import { nameSchema } from "../named-records/named-record-fields.schema";
import { planningParameterCreateFormSchema } from "../planning-parameters/planning-parameter-create.schema";
import { materialReferenceSchema } from "../planning-parameters/planning-parameter-fields.schema";
import { safetyStockTargetCreateSchema } from "../safety-stock/safety-stock-target.schema";

/*
 * One row of each import sheet, after its cells are normalized (spec
 * `2026-10-20--0908UTC-master-data-bom-import`, Q3, Q8, Q9): a blank cell is null. The fields reuse
 * the screens' and the API's schemas, so a cell gets the same message a form field would.
 */

/** The English messages; screens translate them by matching these constants. */
export const ID_FORMAT_MESSAGE = "Enter an eight-digit ID, or leave it blank to create a new record.";
export const ACTIVE_MESSAGE = "Enter yes or no, or leave it blank.";
export const REFERENCE_FORMAT_MESSAGE = `Use at most ${IMPORT_REFERENCE_MAX} characters, with at least one letter.`;
export const BOM_TARGET_MESSAGE = "Enter the BOM ID or the import reference of a row on the BOM headers sheet.";

/** A record's own ID: blank creates (null), eight digits update. */
const recordIdSchema = z.string().regex(BUSINESS_ID_PATTERN, ID_FORMAT_MESSAGE).nullable();

/** Active: yes, no, or blank (null) to keep an existing record's flag. */
const activeSchema = z.boolean({ error: ACTIVE_MESSAGE }).nullable();

export const materialRowSchema = z.object({
  id: recordIdSchema,
  type: materialTypeSchema,
  description: descriptionSchema,
  baseUnit: unitSchema,
  active: activeSchema,
});

export const unitConversionRowSchema = z.object({
  material: materialReferenceSchema,
  unit: unitSchema,
  numerator: factorSchema,
  denominator: factorSchema,
});

/** Locations, customers and suppliers. */
export const namedRecordRowSchema = z.object({
  id: recordIdSchema,
  name: nameSchema,
  active: activeSchema,
});

/** The Add parameters form's schema: the lead time arrives as text, as it does from a cell. */
export const planningParameterRowSchema = planningParameterCreateFormSchema;

export const safetyStockRowSchema = safetyStockTargetCreateSchema;

export const bomHeaderRowSchema = z
  .object({
    id: recordIdSchema,
    reference: z.string().max(IMPORT_REFERENCE_MAX, REFERENCE_FORMAT_MESSAGE).regex(/\p{L}/u, REFERENCE_FORMAT_MESSAGE).nullable(),
    output: outputReferenceSchema.nullable(),
    priority: priorityTextSchema,
    validFrom: calendarDateSchema,
    validThrough: validThroughSchema,
    active: activeSchema,
  })
  .superRefine(throughNotBeforeFrom);

const bomTargetSchema = z.union(
  [
    z.object({
      kind: z.literal("id"),
      id: z.string().regex(BUSINESS_ID_PATTERN),
    }),
    z.object({ kind: z.literal("reference"), reference: z.string() }),
  ],
  { error: BOM_TARGET_MESSAGE },
);

export const bomLineRowSchema = z.object({
  bom: bomTargetSchema,
  material: materialReferenceSchema,
  quantity: enteredQuantitySchema,
  unit: unitSchema.nullable(),
});

export type MaterialRow = z.infer<typeof materialRowSchema>;
export type UnitConversionRow = z.infer<typeof unitConversionRowSchema>;
export type NamedRecordRow = z.infer<typeof namedRecordRowSchema>;
export type PlanningParameterRow = z.infer<typeof planningParameterRowSchema>;
export type SafetyStockRow = z.infer<typeof safetyStockRowSchema>;
export type BomHeaderRow = z.infer<typeof bomHeaderRowSchema>;
export type BomLineRow = z.infer<typeof bomLineRowSchema>;
