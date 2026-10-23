import { z } from "zod";
import { calendarDateSchema } from "../dates/calendar-date.schema";
import { enteredQuantitySchema } from "../boms/bom-fields.schema";
import { unitSchema } from "../materials/material-fields.schema";
import { locationReferenceSchema, materialReferenceSchema } from "../planning-parameters/planning-parameter-fields.schema";
import { pageSchema } from "../shipments/shipment.schema";
import { versionSchema } from "../version.schema";
import {
  DUPLICATE_LINE_MESSAGE,
  LINE_NUMBER_MESSAGE,
  optionalRequisitionSchema,
  ORDER_IMMUTABLE_MESSAGE,
  ORDER_LINE_COUNT_MESSAGE,
  ORDER_LINES_MAX,
  supplierReferenceSchema,
} from "./purchasing-fields.schema";

/**
 * One line of a new order (spec Q4, Q5): a material, a quantity in any unit it converts, the date it
 * is planned for, and optionally the requisition it converts. A client may also state the line's
 * `location`; a location other than the order's is refused (BUY-007).
 */
export const orderLineSchema = z.object({
  material: materialReferenceSchema,
  quantity: enteredQuantitySchema,
  unit: unitSchema,
  plannedDate: calendarDateSchema,
  requisition: optionalRequisitionSchema,
  location: locationReferenceSchema.optional(),
});

export type OrderLineInput = z.infer<typeof orderLineSchema>;

const linesSchema = z
  .array(orderLineSchema, { error: ORDER_LINE_COUNT_MESSAGE })
  .min(1, ORDER_LINE_COUNT_MESSAGE)
  .max(ORDER_LINES_MAX, ORDER_LINE_COUNT_MESSAGE);

/** `POST /api/tenants/{tenant}/purchase-orders`, and the Create purchase order form: one supplier, one location, 1 to 100 lines. */
export const orderCreateSchema = z.object({
  supplier: supplierReferenceSchema,
  location: locationReferenceSchema,
  lines: linesSchema,
});

export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

/** What a line never changes, refused rather than ignored: a received line's quantities can't be reinterpreted (BUY-022, BUY-023). */
const immutableLineField = z.never({ error: ORDER_IMMUTABLE_MESSAGE }).optional();

/** A line's new date, addressed by its 1-based number in the order; its material, unit and quantity are refused. */
const lineDateSchema = z.object({
  line: z.number({ error: LINE_NUMBER_MESSAGE }).int(LINE_NUMBER_MESSAGE).min(1, LINE_NUMBER_MESSAGE),
  plannedDate: calendarDateSchema,
  material: immutableLineField,
  unit: immutableLineField,
  quantity: immutableLineField,
});

/**
 * `PATCH /api/tenants/{tenant}/purchase-orders/{id}` (spec Q8): new planned dates for some lines, at
 * the version the client loaded. The supplier, the location and a line's material, unit and quantity
 * are refused rather than ignored.
 */
export const orderUpdateBodySchema = z.object({
  version: versionSchema,
  lines: z
    .array(lineDateSchema, { error: ORDER_LINE_COUNT_MESSAGE })
    .min(1, ORDER_LINE_COUNT_MESSAGE)
    .max(ORDER_LINES_MAX, ORDER_LINE_COUNT_MESSAGE)
    .superRefine((lines, ctx) => {
      const seen = new Set<number>();
      lines.forEach(({ line }, index) => {
        if (seen.has(line)) ctx.addIssue({ code: "custom", path: [index, "line"], message: DUPLICATE_LINE_MESSAGE });
        seen.add(line);
      });
    }),
  supplier: z.never({ error: ORDER_IMMUTABLE_MESSAGE }).optional(),
  location: z.never({ error: ORDER_IMMUTABLE_MESSAGE }).optional(),
});

/** `GET /api/tenants/{tenant}/purchase-orders`: a 1-based `?page=` (additive; the first page when absent), as the shipments list takes it. */
export const purchaseOrderListQuerySchema = z.object({ page: pageSchema });

/**
 * A purchase-order line's Change date form (spec 2026-10-21--2036UTC-purchasing-date-edits): only the
 * new planned date. The action supplies the line and the version the dialog opened with.
 */
export const orderLineDateSchema = lineDateSchema.pick({ plannedDate: true });
