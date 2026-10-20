import { z } from "zod";

/** Matches the existing nine-digit Dataset-Generation header. */
export const MAX_DATASET_GENERATION = 999999999;
export const testResetSchema = z.strictObject({ generation: z.number().int().min(1).max(MAX_DATASET_GENERATION) });
export const testResetBodySchema = z.strictObject({});
