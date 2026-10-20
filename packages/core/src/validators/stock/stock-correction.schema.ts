import { z } from "zod";
import { parseSignedQuantity } from "../../domain/stock/signed-quantity";
import { unitSchema } from "../materials/material-fields.schema";
import { locationReferenceSchema, materialReferenceSchema } from "../planning-parameters/planning-parameter-fields.schema";

export const STOCK_QUANTITY_MESSAGE = "Enter a nonzero signed quantity, with at most 12 integer digits and 6 decimals.";
export const STOCK_REASON_MESSAGE = "Enter a reason, up to 500 characters.";
/** A correction changes a location's physical stock only; transit is written off on its transfer (TRF-014). */
export const CORRECTION_TRANSIT_MESSAGE = "A correction changes physical stock at a location: write off in-transit stock on its transfer.";
export const stockPairSchema = z.object({ material: materialReferenceSchema, location: locationReferenceSchema });
/** How many movements one page of a pair's ledger holds, newest first. */
export const STOCK_LEDGER_PAGE_SIZE = 100;
/** A pair and a page of its ledger (stock report spec Q6); other parameters are ignored, as they always were. */
export const stockLedgerQuerySchema = stockPairSchema.extend({ page: z.coerce.number().int().min(1).max(1_000_000).default(1) });
export const stockLineSchema = stockPairSchema.extend({
  quantity: z.string({ error: STOCK_QUANTITY_MESSAGE }).trim().refine((text) => {
    const value = parseSignedQuantity(text);
    return value !== null && value !== 0n;
  }, STOCK_QUANTITY_MESSAGE),
  unit: unitSchema,
});
export const stockReasonSchema = z.string({ error: STOCK_REASON_MESSAGE }).trim().min(1, STOCK_REASON_MESSAGE).max(500, STOCK_REASON_MESSAGE);
/**
 * Extra client fields (date, actor, source, factor) are discarded; only these inputs are writable. A
 * correction that names a `transfer` is refused, not trimmed: it can never reach in-transit stock (TRF-014).
 */
export const stockCorrectionSchema = stockLineSchema.extend({
  reason: stockReasonSchema,
  transfer: z.never({ error: CORRECTION_TRANSIT_MESSAGE }).optional(),
});
export const stockPostingSchema = z.object({ lines: z.array(stockLineSchema).min(1).max(100), reason: stockReasonSchema });
