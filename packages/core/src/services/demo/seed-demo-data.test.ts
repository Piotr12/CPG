import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, migrate } from "@cpg/db";
import { expect, it } from "vitest";
import { loadConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import { scopeForTenant } from "../../container/tenant-scope";
import { toDbOptions } from "../../database";
import { DEMO_KINDS, demoSeeders, seedResetDemoData } from "./seed-demo-data";

it("runs the complete ordered fixture set and refuses an incomplete second seed", async () => {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-reset-seeds-")) });
  await migrate(toDbOptions(config));
  const orm = await initOrm(toDbOptions(config));
  try {
    const { cradle } = await scopeForTenant(createAppContainer(config, orm), "test");
    expect(Object.keys(demoSeeders(cradle))).toEqual(DEMO_KINDS);
    await seedResetDemoData(cradle);
    expect((await cradle.bomService.list()).length).toBe(demoSeeders(cradle).BOMs.expected);
    await expect(seedResetDemoData(cradle)).rejects.toThrow("Incomplete demonstration seed: materials");
  } finally { await orm.close(); }
});
