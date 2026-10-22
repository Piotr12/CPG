import { z } from "zod";
import { TEST_DATASETS } from "../../domain/demo/test-datasets";

/** Matches the existing nine-digit Dataset-Generation header. */
export const MAX_DATASET_GENERATION = 999999999;
/** Which dataset a reset writes; absent means tiny (spec `2026-10-22--0902UTC-test-tenant-two-datasets`, Q4). */
const datasetSchema = z.enum(TEST_DATASETS).optional();
export const testResetSchema = z.strictObject({ generation: z.number().int().min(1).max(MAX_DATASET_GENERATION), dataset: datasetSchema });
export const testResetBodySchema = z.strictObject({ dataset: datasetSchema });
