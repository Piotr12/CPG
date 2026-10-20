import { z } from "zod";
import { BUSINESS_ID_PATTERN } from "../business-ids/business-id.schema";
import { calendarDateSchema } from "../dates/calendar-date.schema";
import { unitSchema } from "../materials/material-fields.schema";
import { positiveQuantitySchema } from "../quantities/quantity.schema";
import { versionSchema } from "../version.schema";

export const ORDER_LINES_MAX = 100;
export const ORDER_LINE_COUNT_MESSAGE = `Add at least 1 and at most ${ORDER_LINES_MAX} lines.`;
export const ORDER_REFERENCE_MESSAGE = "Choose a record from this tenant.";
export const ORDER_LINE_ID_MESSAGE = "Each existing line must belong to this order and appear once.";
export const ORDER_QUANTITY_MIN_MESSAGE = "Quantity can't be less than the fulfilled and abandoned amount.";
export const orderReferenceSchema = z.string({ error: ORDER_REFERENCE_MESSAGE }).regex(BUSINESS_ID_PATTERN, ORDER_REFERENCE_MESSAGE);

const fields = {
  material: orderReferenceSchema,
  quantity: positiveQuantitySchema,
  unit: unitSchema,
  requiredDate: calendarDateSchema,
};
export const customerOrderLineSchema = z.strictObject(fields);
export const customerOrderEditLineSchema = z.strictObject({ id: z.uuid().optional(), ...fields });
const header = { customer: orderReferenceSchema, location: orderReferenceSchema };
const lines = <T extends z.ZodType>(schema: T) => z.array(schema).min(1, ORDER_LINE_COUNT_MESSAGE).max(ORDER_LINES_MAX, ORDER_LINE_COUNT_MESSAGE);
export const customerOrderCreateSchema = z.strictObject({ ...header, lines: lines(customerOrderLineSchema) });
export const customerOrderUpdateSchema = z.strictObject({ version: versionSchema, ...header, lines: lines(customerOrderEditLineSchema) });
export const customerOrderUpdateActionSchema = customerOrderUpdateSchema.extend({ orderId: orderReferenceSchema });
export type CustomerOrderInput = z.infer<typeof customerOrderCreateSchema>;
export type CustomerOrderChanges = Omit<z.infer<typeof customerOrderUpdateSchema>, "version">;
