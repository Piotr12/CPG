import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, Location, selectTenant, Supplier, type Orm, type TenantCode } from "@cpg/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { findActiveSupplier, findSupplier } from "./find-supplier";

describe("findSupplier", () => {
  let orm: Orm;
  const scopedEm = (tenant: TenantCode) => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };

  beforeAll(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-find-supplier-")) });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    const em = scopedEm("prod");
    em.create(Supplier, { code: "00000001", name: "Fasteners Wholesale" });
    em.create(Supplier, { code: "00000002", name: "Old supplier", active: false });
    em.create(Location, { code: "00000003", name: "Plant" });
    await em.flush();
  });

  afterAll(async () => {
    await orm.close();
  });

  it("loads a supplier of the scope's tenant by its business ID, inactive ones too", async () => {
    expect(await findSupplier(scopedEm("prod"), "00000001")).toMatchObject({ code: "00000001", name: "Fasteners Wholesale" });
    expect(await findSupplier(scopedEm("prod"), "00000002")).toMatchObject({ active: false });
  });

  it("doesn't find another tenant's supplier, or another kind's ID (TEN-014)", async () => {
    await expect(findSupplier(scopedEm("test"), "00000001")).rejects.toMatchObject({ code: "SUPPLIER_NOT_FOUND", status: 404 });
    await expect(findSupplier(scopedEm("prod"), "00000003")).rejects.toMatchObject({ code: "SUPPLIER_NOT_FOUND" });
  });

  it("refuses an inactive supplier for a new document (BUY-025, LFC-023)", async () => {
    expect(await findActiveSupplier(scopedEm("prod"), "00000001")).toMatchObject({ code: "00000001" });
    await expect(findActiveSupplier(scopedEm("prod"), "00000002")).rejects.toMatchObject({ code: "SUPPLIER_INACTIVE", status: 409 });
    await expect(findActiveSupplier(scopedEm("test"), "00000001")).rejects.toMatchObject({ code: "SUPPLIER_NOT_FOUND" });
  });
});
