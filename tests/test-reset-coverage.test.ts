import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { entities, GLOBAL_ENTITIES, initOrm, isTenantOwned, testResetEntities } from "@cpg/db";
import { expect, it } from "vitest";

it("automatically includes every registered tenant-owned entity and no global entity in Test reset", async () => {
  const orm = await initOrm({ databasePath: path.join(mkdtempSync(path.join(tmpdir(), "cpg-reset-coverage-")), "db.sqlite") });
  try {
    const names = testResetEntities(orm.em.fork()).map((meta) => meta.className).sort();
    expect(names).toEqual(entities.filter((entity) => isTenantOwned(entity.meta)).map((entity) => entity.meta.className).sort());
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => GLOBAL_ENTITIES.some((entity) => entity.meta.className === name))).toEqual([]);
  } finally {
    await orm.close();
  }
});
