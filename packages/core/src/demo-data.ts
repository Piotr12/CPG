import { initOrm } from "@cpg/db";
import type { AppConfig } from "./config";
import { createAppContainer } from "./container/container";
import { scopeForTenant } from "./container/tenant-scope";
import { toDbOptions } from "./database";

/**
 * Seeds the Test tenant with its demonstration records when it has none (TEN-001, D06), and returns
 * how many materials it created. Run at every server start, after the migrations, with a short-lived
 * connection like the other startup tasks (never the shared container). Prod is never touched.
 */
export async function seedDemoData(config: AppConfig): Promise<number> {
  const orm = await initOrm(toDbOptions(config));
  try {
    const test = await scopeForTenant(createAppContainer(config, orm), "test");
    return await test.cradle.materialService.seedDemo();
  } finally {
    await orm.close();
  }
}
