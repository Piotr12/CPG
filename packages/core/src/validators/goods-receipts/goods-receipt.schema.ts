import { z } from "zod";
import { BUSINESS_ID_PATTERN } from "../business-ids/business-id.schema";
import { enteredQuantitySchema } from "../boms/bom-fields.schema";
import { unitSchema } from "../materials/material-fields.schema";
import { DUPLICATE_LINE_MESSAGE, LINE_NUMBER_MESSAGE } from "../purchasing/purchasing-fields.schema";

/** The English messages; screens translate them by matching these constants. */
export const ORDER_CHOICE_MESSAGE = "Choose a purchase order.";
export const RECEIPT_LINE_COUNT_MESSAGE = "Receive at least 1 and at most 100 lines.";
/** What the service says, next to the line, about a line of another order (BUY-013). */
export const RECEIPT_LINE_ORDER_MESSAGE = "A goods receipt covers one purchase order: this line is from another.";

/** The most lines one goods receipt carries, as many as a purchase order. */
export const RECEIPT_LINES_MAX = 100;

/** A purchase order referenced by its eight-digit business ID. */
export const orderReferenceSchema = z.string({ error: ORDER_CHOICE_MESSAGE }).regex(BUSINESS_ID_PATTERN, ORDER_CHOICE_MESSAGE);

/**
 * One receipt line (spec Q1, Q2): the purchase-order line it is for, by its 1-based number, and the
 * quantity that arrived in any unit the material converts. A client may also state the line's
 * `purchaseOrder`; one other than the receipt's is refused (BUY-013).
 */
export const receiptLineSchema = z.object({
  line: z.number({ error: LINE_NUMBER_MESSAGE }).int(LINE_NUMBER_MESSAGE).min(1, LINE_NUMBER_MESSAGE),
  quantity: enteredQuantitySchema,
  unit: unitSchema,
  purchaseOrder: orderReferenceSchema.optional(),
});

export type ReceiptLineInput = z.infer<typeof receiptLineSchema>;

/**
 * `POST /api/tenants/{tenant}/goods-receipts`, and the Post goods receipt form: one purchase order and
 * 1 to 100 lines, each for a different line of it. No date: a receipt posts on today's business date
 * (INV-010).
 */
export const receiptCreateSchema = z.object({
  purchaseOrder: orderReferenceSchema,
  lines: z
    .array(receiptLineSchema, { error: RECEIPT_LINE_COUNT_MESSAGE })
    .min(1, RECEIPT_LINE_COUNT_MESSAGE)
    .max(RECEIPT_LINES_MAX, RECEIPT_LINE_COUNT_MESSAGE)
    .superRefine((lines, ctx) => {
      const seen = new Set<number>();
      lines.forEach(({ line }, index) => {
        if (seen.has(line)) ctx.addIssue({ code: "custom", path: [index, "line"], message: DUPLICATE_LINE_MESSAGE });
        seen.add(line);
      });
    }),
});

export type ReceiptCreateInput = z.infer<typeof receiptCreateSchema>;

/** `GET /api/tenants/{tenant}/goods-receipts`: every receipt, or one purchase order's. */
export const receiptListQuerySchema = z.object({ purchaseOrder: orderReferenceSchema.optional() });
