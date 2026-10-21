import { initOrm } from "@cpg/db";
import type { AppConfig } from "./config";
import { createAppContainer } from "./container/container";
import { scopeForTenant } from "./container/tenant-scope";
import { toDbOptions } from "./database";
import type { TestTenantConfig } from "./domain/demo/test-tenant-config.schema";
import { inRequestTransaction } from "./http/request-transaction";
import { isUntouchedTest, seedTestTenantDataset, type DatasetKind } from "./services/demo/seed-demo-data";
import { isScopeReadOnly } from "./services/tenants/tenant.service";

export { DATASET_KINDS, type DatasetKind } from "./services/demo/seed-demo-data";

/**
 * How the startup seed went: the dataset written (how many records of each kind), nothing written
 * because Test is in use or read-only, or a failure that rolled everything back.
 */
export type DemoSeedResult =
  | { outcome: "seeded"; counts: Record<DatasetKind, number> }
  | { outcome: "skipped"; reason: "in use" | "read-only" }
  | { outcome: "failed"; error: unknown };

/**
 * Seeds the Test tenant with its generated demonstration dataset (TEN-001, D06; spec
 * `2026-10-21--0718UTC-test-tenant-dataset`, Q4) when Test is untouched: no material and no tenant
 * audit entry, as a fresh install leaves it. Run at every server start, after the migrations, with a
 * short-lived connection like the other startup tasks (never the shared container). The whole dataset
 * is written in one transaction, so a failure leaves Test empty and the next start tries again; a Test
 * in use keeps its data until the admin resets it, and a read-only Test is never written (R05). Prod
 * is never touched. `today` and `dataset` are the generator's inputs: the server's clock and the
 * container's committed configuration, unless a test passes others.
 */
export async function seedDemoData(
  config: AppConfig,
  { today = new Date(), dataset }: { today?: Date; dataset?: TestTenantConfig } = {},
): Promise<DemoSeedResult> {
  const orm = await initOrm(toDbOptions(config));
  try {
    const { cradle } = await scopeForTenant(createAppContainer(config, orm), "test");
    return await inRequestTransaction(cradle.em, async (): Promise<DemoSeedResult> => {
      if (await isScopeReadOnly(cradle.em)) return { outcome: "skipped", reason: "read-only" };
      if (!(await isUntouchedTest(cradle.em))) return { outcome: "skipped", reason: "in use" };
      return { outcome: "seeded", counts: await seedTestTenantDataset(cradle, today, dataset) };
    });
  } catch (error) {
    return { outcome: "failed", error };
  } finally {
    await orm.close();
  }
}
