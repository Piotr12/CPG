import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, Material, selectTenant } from "@cpg/db";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { migrateDatabase, toDbOptions } from "./database";
import { seedDemoData } from "./demo-data";
import { DEMO_MATERIALS } from "./domain/materials/demo-materials";

describe("seedDemoData", () => {
  it("fills an empty Test with the demo materials once, never Prod, and closes its connection", async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-demo-data-")) });
    await migrateDatabase(config);

    expect(await seedDemoData(config)).toBe(DEMO_MATERIALS.length);
    expect(await seedDemoData(config)).toBe(0);

    const orm = await initOrm(toDbOptions(config));
    try {
      const count = (tenant: "test" | "prod") => {
        const em = orm.em.fork();
        selectTenant(em, tenant);
        return em.count(Material, {});
      };
      expect(await count("test")).toBe(DEMO_MATERIALS.length);
      expect(await count("prod")).toBe(0);
    } finally {
      await orm.close();
    }
  });
});
