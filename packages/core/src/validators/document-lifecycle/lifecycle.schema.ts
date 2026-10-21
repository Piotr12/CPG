import { z } from "zod";
import { versionSchema } from "../version.schema";

export const LIFECYCLE_SELECTION_MESSAGE = "Choose between 1 and 100 different lines from this document.";
const selection = <T extends z.ZodType>(id: T) => z.array(id)
  .min(1, LIFECYCLE_SELECTION_MESSAGE).max(100, LIFECYCLE_SELECTION_MESSAGE)
  .refine((ids) => new Set(ids).size === ids.length, LIFECYCLE_SELECTION_MESSAGE).optional();

/** Closure is an explicit versioned command; clients cannot send arbitrary status or quantities. */
export const documentLifecycleSchema = z.strictObject({ version: versionSchema });
export const customerOrderLifecycleSchema = documentLifecycleSchema.extend({ lines: selection(z.uuid()) });
export const purchaseOrderLifecycleSchema = documentLifecycleSchema.extend({ lines: selection(z.number().int().positive()) });
