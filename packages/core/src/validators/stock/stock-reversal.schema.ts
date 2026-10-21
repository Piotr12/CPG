import { z } from "zod";
import { stockReasonSchema } from "./stock-correction.schema";

/** A reversal always uses the stored whole quantity and today's date; no other fields are writable. */
export const stockReversalSchema = z.strictObject({ reason: stockReasonSchema });
export const stockMovementIdSchema = z.uuid();
export const stockReversalActionSchema = stockReversalSchema.extend({ movementId: stockMovementIdSchema });
