import { z } from "zod";
import { BUSINESS_ID_PATTERN } from "../business-ids/business-id.schema";
import { enteredQuantitySchema } from "../boms/bom-fields.schema";
import { calendarDateSchema } from "../dates/calendar-date.schema";
import { unitSchema } from "../materials/material-fields.schema";
import { DUPLICATE_LINE_MESSAGE } from "../purchasing/purchasing-fields.schema";

/** The English messages; screens translate them by matching these constants. */
export const CUSTOMER_ORDER_CHOICE_MESSAGE = "Choose a customer order.";
export const SHIPMENT_CHOICE_MESSAGE = "Choose a shipment.";
export const ORDER_LINE_CHOICE_MESSAGE = "Choose a line of the order.";
export const SHIPMENT_LINE_COUNT_MESSAGE = "Ship at least 1 and at most 100 lines.";
/** What the service says, next to the line, about a line of another order (SAL-008). */
export const SHIPMENT_LINE_ORDER_MESSAGE = "A shipment covers one customer order: this line is from another.";
/** What the service says about an order-line ID that isn't a line of the shipment's order. */
export const SHIPMENT_NO_SUCH_LINE_MESSAGE = "This order has no such line.";
/** What the service says about a planned quantity above the order line's outstanding (spec Q3). */
export const SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE = "This is more than the order line still has outstanding.";

/** The most lines one shipment carries, as many as a customer order. */
export const SHIPMENT_LINES_MAX = 100;

/** Shipments and goods issues are listed in fixed pages, so a list stays bounded as history grows (lesson 2026-10-20). */
export const DOCUMENT_PAGE_SIZE = 100;

/** A 1-based page of a document list: `?page=2`; the first page when absent. */
export const pageSchema = z.coerce.number().int().min(1).max(1_000_000).default(1);

/** A customer order referenced by its eight-digit business ID. */
export const customerOrderReferenceSchema = z.string({ error: CUSTOMER_ORDER_CHOICE_MESSAGE }).regex(BUSINESS_ID_PATTERN, CUSTOMER_ORDER_CHOICE_MESSAGE);

/** A shipment referenced by its eight-digit business ID. */
export const shipmentReferenceSchema = z.string({ error: SHIPMENT_CHOICE_MESSAGE }).regex(BUSINESS_ID_PATTERN, SHIPMENT_CHOICE_MESSAGE);

/**
 * One shipment line (spec Q1, Q2): the order line it ships, by the line's stable ID, and the quantity
 * planned to go in any unit the material converts. A client may also state the line's
 * `customerOrder`; one other than the shipment's is refused (SAL-008).
 */
export const shipmentLineSchema = z.object({
  orderLine: z.uuid({ error: ORDER_LINE_CHOICE_MESSAGE }),
  quantity: enteredQuantitySchema,
  unit: unitSchema,
  customerOrder: customerOrderReferenceSchema.optional(),
});

/**
 * `POST /api/tenants/{tenant}/shipments`, and the Create shipment form: one customer order, the date
 * the goods are planned to leave, and 1 to 100 lines, each for a different line of the order.
 */
export const shipmentCreateSchema = z.object({
  customerOrder: customerOrderReferenceSchema,
  plannedDate: calendarDateSchema,
  lines: z
    .array(shipmentLineSchema, { error: SHIPMENT_LINE_COUNT_MESSAGE })
    .min(1, SHIPMENT_LINE_COUNT_MESSAGE)
    .max(SHIPMENT_LINES_MAX, SHIPMENT_LINE_COUNT_MESSAGE)
    .superRefine((lines, ctx) => {
      const seen = new Set<string>();
      lines.forEach(({ orderLine }, index) => {
        if (seen.has(orderLine)) ctx.addIssue({ code: "custom", path: [index, "orderLine"], message: DUPLICATE_LINE_MESSAGE });
        seen.add(orderLine);
      });
    }),
});

export type ShipmentCreateInput = z.infer<typeof shipmentCreateSchema>;

/** The Create shipment form's own check: the date and lines, since the page binds the order. */
export const shipmentFormSchema = shipmentCreateSchema.omit({ customerOrder: true });

/** `GET /api/tenants/{tenant}/shipments`: a page of every shipment, or of one customer order's. */
export const shipmentListQuerySchema = z.object({ customerOrder: customerOrderReferenceSchema.optional(), page: pageSchema });
