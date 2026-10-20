import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Customer, initOrm, Location, selectTenant, type Orm, type TenantCode } from "@cpg/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { findNamedRecord } from "../named-records/find-named-record";
import { findLocation, LOCATION_LOOKUP } from "./find-location";

describe("findLocation and findNamedRecord", () => {
  let orm: Orm;
  const scopedEm = (tenant: TenantCode) => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };

  beforeAll(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-find-location-")) });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    const em = scopedEm("prod");
    em.create(Location, { code: "00000001", name: "Main plant" });
    em.create(Customer, { code: "00000002", name: "Acme" });
    await em.flush();
  });

  afterAll(async () => {
    await orm.close();
  });

  it("loads a location of the scope's tenant by its business ID", async () => {
    const location = await findLocation(scopedEm("prod"), "00000001");
    expect(location).toBeInstanceOf(Object);
    expect(location).toMatchObject({ code: "00000001", name: "Main plant" });
  });

  it("doesn't find another tenant's location, or another kind's ID (TEN-014)", async () => {
    const notFound = (id: string) => ({ code: "LOCATION_NOT_FOUND", status: 404, message: `There is no location ${id} in this tenant.` });
    await expect(findLocation(scopedEm("test"), "00000001")).rejects.toMatchObject(notFound("00000001"));
    await expect(findLocation(scopedEm("prod"), "00000002")).rejects.toMatchObject(notFound("00000002"));
  });

  it("names any kind's error after its lookup", async () => {
    const customers = { entity: Customer, noun: "customer", codePrefix: "CUSTOMER" };
    expect(await findNamedRecord(scopedEm("prod"), customers, "00000002")).toMatchObject({ name: "Acme" });
    await expect(findNamedRecord(scopedEm("prod"), customers, "00000001")).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
    expect(LOCATION_LOOKUP).toEqual({ entity: Location, noun: "location", codePrefix: "LOCATION" });
  });
});
