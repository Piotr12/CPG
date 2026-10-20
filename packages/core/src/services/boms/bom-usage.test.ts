import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, Material, selectTenant, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import type { AuditActor } from "../audit/actor";
import { bomUsingMaterial } from "./bom-usage";
import { BomService } from "./bom.service";

const ACTOR: AuditActor = { userId: "admin-id", username: "admin", sessionId: "admin-session", channel: "ui", token: null };
const recipe = (output: string, components: string[]) => ({
  output,
  priority: 1,
  validFrom: "2027-01-01",
  validThrough: null,
  components: components.map((material) => ({ material, quantity: "1", unit: "each" })),
});

describe("bomUsingMaterial", () => {
  let orm: Orm;
  const em = () => {
    const scoped = orm.em.fork();
    selectTenant(scoped, "prod");
    return scoped;
  };
  const material = async (code: string) => em().findOneOrFail(Material, { code });

  beforeEach(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-bom-usage-")) });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    const seed = em();
    for (const [code, type] of [["00000001", "raw"], ["00000002", "raw"], ["00000003", "intermediate"], ["00000004", "finished"], ["00000005", "raw"]] as const) {
      seed.create(Material, { code, type, description: code, baseUnit: "each" });
    }
    await seed.flush();
  });
  afterEach(async () => {
    await orm.close();
  });

  it("names the BOM that makes the material, or uses it in any revision, and null for an unused one", async () => {
    const boms = new BomService({ em: em() });
    await boms.create(recipe("00000003", ["00000002"]), ACTOR);
    const cabinet = await boms.create(recipe("00000004", ["00000003", "00000001"]), ACTOR);
    await boms.create({ ...recipe("00000004", ["00000001"]), priority: 2 }, ACTOR);
    // BOM 00000002's edit drops 00000001, which stays in its old revision 1 (and in BOM 00000003).
    await boms.update(cabinet.id, { components: [{ material: "00000003", quantity: "2", unit: "each" }] }, cabinet.version, ACTOR);

    expect(await bomUsingMaterial(em(), await material("00000003"))).toBe("00000001");
    expect(await bomUsingMaterial(em(), await material("00000004"))).toBe("00000002");
    expect(await bomUsingMaterial(em(), await material("00000002"))).toBe("00000001");
    expect(await bomUsingMaterial(em(), await material("00000001"))).toBe("00000002");
    expect(await bomUsingMaterial(em(), await material("00000005"))).toBeNull();
  });
});
