import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, Material, selectTenant, type Orm, type TenantCode } from "@cpg/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { findMaterial, materialNotFound } from "./find-material";

describe("findMaterial", () => {
  let orm: Orm;
  const scopedEm = (tenant: TenantCode) => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };

  beforeAll(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-find-material-")) });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    const em = scopedEm("prod");
    em.create(Material, { code: "00000001", type: "raw", description: "Prod steel", baseUnit: "kg" });
    await em.flush();
  });

  afterAll(async () => {
    await orm.close();
  });

  it("loads a material of the scope's tenant by its business ID", async () => {
    expect(await findMaterial(scopedEm("prod"), "00000001")).toMatchObject({ code: "00000001", description: "Prod steel" });
  });

  it("refreshes a row already in the identity map when asked", async () => {
    const em = scopedEm("prod");
    const material = await findMaterial(em, "00000001");
    const other = scopedEm("prod");
    const copy = await findMaterial(other, "00000001");
    copy.description = "Renamed";
    await other.flush();
    expect(await findMaterial(em, "00000001", { refresh: true })).toBe(material);
    expect(material).toMatchObject({ description: "Renamed", version: 2 });
  });

  it("doesn't find another tenant's material (TEN-014)", async () => {
    await expect(findMaterial(scopedEm("test"), "00000001")).rejects.toMatchObject({
      code: "MATERIAL_NOT_FOUND",
      status: 404,
      message: "There is no material 00000001 in this tenant.",
    });
  });

  it("names the ID in its not-found error", () => {
    expect(materialNotFound("abc").message).toBe("There is no material abc in this tenant.");
  });
});
