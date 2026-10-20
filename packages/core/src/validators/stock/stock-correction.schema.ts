import { z } from "zod";
import { parseSignedQuantity } from "../../domain/stock/signed-quantity";
import { unitSchema } from "../materials/material-fields.schema";
import { locationReferenceSchema, materialReferenceSchema } from "../planning-parameters/planning-parameter-fields.schema";

export const STOCK_QUANTITY_MESSAGE = "Enter a nonzero signed quantity, with at most 12 integer digits and 6 decimals.";
export const STOCK_REASON_MESSAGE = "Enter a reason, up to 500 characters.";
export const stockPairSchema = z.object({ material: materialReferenceSchema, location: locationReferenceSchema });
export const stockLineSchema = stockPairSchema.extend({
  quantity: z.string({ error: STOCK_QUANTITY_MESSAGE }).trim().refine((text) => {
    const value = parseSignedQuantity(text);
    return value !== null && value !== 0n;
  }, STOCK_QUANTITY_MESSAGE),
  unit: unitSchema,
});
export const stockReasonSchema = z.string({ error: STOCK_REASON_MESSAGE }).trim().min(1, STOCK_REASON_MESSAGE).max(500, STOCK_REASON_MESSAGE);
/** Extra client fields (date, actor, source, factor) are discarded; only these inputs are writable. */
export const stockCorrectionSchema = stockLineSchema.extend({ reason: stockReasonSchema });
export const stockPostingSchema = z.object({ lines: z.array(stockLineSchema).min(1).max(100), reason: stockReasonSchema });
