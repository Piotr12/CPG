import { TEST_TENANT_CONFIG, type TestTenantConfig } from "./test-tenant-config.schema";

/*
 * Test's two generated datasets (spec `2026-10-22--0902UTC-test-tenant-two-datasets`): one generator and
 * one catalogue, two history lengths. Tiny seeds an untouched Test at startup and is what a reset writes
 * unless the admin picks realistic, the committed configuration's full history.
 */

/** The datasets a Test reset can write, in the order the admin is offered them. */
export const TEST_DATASETS = ["tiny", "realistic"] as const;
export type TestDataset = (typeof TEST_DATASETS)[number];

/** The dataset of the startup seed and of a reset that names none. */
export const DEFAULT_TEST_DATASET: TestDataset = "tiny";

/** Tiny's history, in months: every rule of the realistic dataset at about a seventh of its documents (spec Q1). */
export const TINY_HISTORY_MONTHS = 2;

/** Each dataset's configuration: the committed one as it is, and tiny with the short history. */
export const TEST_DATASET_CONFIGS: Readonly<Record<TestDataset, TestTenantConfig>> = {
  tiny: { ...TEST_TENANT_CONFIG, horizon: { ...TEST_TENANT_CONFIG.horizon, historyMonths: TINY_HISTORY_MONTHS } },
  realistic: TEST_TENANT_CONFIG,
};
