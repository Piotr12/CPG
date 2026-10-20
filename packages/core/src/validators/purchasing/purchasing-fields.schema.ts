import { z } from "zod";
import { BUSINESS_ID_PATTERN } from "../business-ids/business-id.schema";

/** The English messages; screens translate them by matching these constants. */
export const SUPPLIER_CHOICE_MESSAGE = "Choose a supplier.";
export const REQUISITION_CHOICE_MESSAGE = "Choose a requisition.";
export const ORDER_LINE_COUNT_MESSAGE = "Add at least 1 and at most 100 lines.";
export const LINE_NUMBER_MESSAGE = "Enter a line number from 1.";
export const DUPLICATE_LINE_MESSAGE = "This line is listed twice.";
export const REQUISITION_IMMUTABLE_MESSAGE = "Only the required date of a requisition can change.";
export const ORDER_IMMUTABLE_MESSAGE = "Only the planned dates of an order's lines can change.";

/** What the services say, next to the field, about a line that breaks a rule (BUY-007, BUY-003). */
export const LINE_LOCATION_MESSAGE = "A purchase order has one location: this line is for another.";
export const LINE_REQUISITION_MATERIAL_MESSAGE = "This is not the requisition's material.";
export const LINE_REQUISITION_LOCATION_MESSAGE = "The requisition is for another location than this order.";
export const LINE_NO_SUCH_LINE_MESSAGE = "This order has no such line.";

/** The most lines one purchase order carries. */
export const ORDER_LINES_MAX = 100;

/** A supplier referenced by its eight-digit business ID. */
export const supplierReferenceSchema = z
  .string({ error: SUPPLIER_CHOICE_MESSAGE })
  .regex(BUSINESS_ID_PATTERN, SUPPLIER_CHOICE_MESSAGE);

/** A purchase requisition referenced by its eight-digit business ID. */
export const requisitionReferenceSchema = z
  .string({ error: REQUISITION_CHOICE_MESSAGE })
  .regex(BUSINESS_ID_PATTERN, REQUISITION_CHOICE_MESSAGE);

/** A requisition on a line, or none: the form's empty choice and the API's `null` or absence both mean none. */
export const optionalRequisitionSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  requisitionReferenceSchema.nullish().transform((id) => id ?? null),
);
