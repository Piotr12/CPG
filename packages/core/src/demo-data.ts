import { initOrm } from "@cpg/db";
import type { AppConfig } from "./config";
import { createAppContainer } from "./container/container";
import { scopeForTenant } from "./container/tenant-scope";
import { toDbOptions } from "./database";

import { DEMO_KINDS, demoSeeders, type DemoKind } from "./services/demo/seed-demo-data";
export { DEMO_KINDS, type DemoKind } from "./services/demo/seed-demo-data";

/** How one kind's seed went: how many records it created (0 when Test had some), or why it failed. */
export type DemoSeedResult = { seeded: number } | { error: unknown };

/**
 * Seeds the Test tenant with its demonstration records (TEN-001, D06): each kind Test has none of
 * gets its fixed list. Run at every server start, after the migrations, with a short-lived connection
 * like the other startup tasks (never the shared container). Each kind runs in its own transaction
 * and a failure in one is reported without stopping the others, so the next start retries only the
 * kinds still empty. Prod is never touched.
 */
export async function seedDemoData(config: AppConfig): Promise<Record<DemoKind, DemoSeedResult>> {
  const orm = await initOrm(toDbOptions(config));
  try {
    const { cradle } = await scopeForTenant(createAppContainer(config, orm), "test");
    const seeders = demoSeeders(cradle);
    const results = {} as Record<DemoKind, DemoSeedResult>;
    for (const kind of DEMO_KINDS) {
      try {
        results[kind] = { seeded: await seeders[kind].run() };
      } catch (error) {
        results[kind] = { error };
      }
    }
    return results;
  } finally {
    await orm.close();
  }
}
