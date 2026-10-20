import { z } from "zod";
import { LEAD_TIME_DAYS_MAX, PROCUREMENT_MODES } from "../../domain/planning-parameters/procurement";
import { BUSINESS_ID_PATTERN } from "../business-ids/business-id.schema";

/** The English messages; screens translate them by matching these constants. */
export const MATERIAL_CHOICE_MESSAGE = "Choose a material.";
export const LOCATION_CHOICE_MESSAGE = "Choose a location.";
export const PROCUREMENT_MESSAGE = "Choose Make or Buy.";
export const LEAD_TIME_MESSAGE = `Enter a whole number of days from 0 to ${LEAD_TIME_DAYS_MAX}.`;
/** What the services say when Make is chosen for a raw material (R02, MAT-014), on `procurement`. */
export const RAW_MATERIAL_BUY_ONLY_MESSAGE = "A raw material is always bought: choose Buy.";

/** A material referenced by its eight-digit business ID; anything else asks to choose one. */
export const materialReferenceSchema = z
  .string({ error: MATERIAL_CHOICE_MESSAGE })
  .regex(BUSINESS_ID_PATTERN, MATERIAL_CHOICE_MESSAGE);

/** A location referenced by its eight-digit business ID. */
export const locationReferenceSchema = z
  .string({ error: LOCATION_CHOICE_MESSAGE })
  .regex(BUSINESS_ID_PATTERN, LOCATION_CHOICE_MESSAGE);

export const procurementSchema = z.enum(PROCUREMENT_MODES, { error: PROCUREMENT_MESSAGE });

/** A lead time in whole calendar days (MAT-018), as the API sends it: a JSON integer. */
export const leadTimeDaysSchema = z
  .number({ error: LEAD_TIME_MESSAGE })
  .int(LEAD_TIME_MESSAGE)
  .min(0, LEAD_TIME_MESSAGE)
  .max(LEAD_TIME_DAYS_MAX, LEAD_TIME_MESSAGE);

/** The same lead time as a form field sends it: digits only, so `7.5`, `-1` and `1e2` stay errors. */
export const leadTimeDaysTextSchema = z
  .string({ error: LEAD_TIME_MESSAGE })
  .trim()
  .regex(/^\d{1,3}$/, LEAD_TIME_MESSAGE)
  .transform(Number)
  .pipe(leadTimeDaysSchema);
