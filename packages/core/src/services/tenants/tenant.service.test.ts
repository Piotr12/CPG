import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, migrate, Tenant, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { toDbOptions } from "../../database";
import { NotFoundError } from "../../http/errors";
import { TENANT_NAMES, TenantService } from "./tenant.service";

describe("TenantService", () => {
  let orm: Orm;

  beforeEach(async () => {
    const options = toDbOptions(loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-tenants-")) }));
    await migrate(options);
    orm = await initOrm(options);
  });
  afterEach(() => orm.close());

  const service = () => new TenantService({ em: orm.em.fork() });

  it("lists Test then Prod, each on its first generation (TEN-001, API-034)", async () => {
    await expect(service().list()).resolves.toEqual([
      { code: "test", name: "Test", generation: 1 },
      { code: "prod", name: "Prod", generation: 1 },
    ]);
    expect(TENANT_NAMES).toEqual({ test: "Test", prod: "Prod" });
  });

  it("reads one tenant", async () => {
    await expect(service().get("prod")).resolves.toEqual({ code: "prod", name: "Prod", generation: 1 });
  });

  it("reports a missing tenant row as TENANT_NOT_FOUND", async () => {
    await orm.em.getConnection().execute("delete from tenant where code = 'prod'");

    const error = await service().get("prod").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toMatchObject({ code: "TENANT_NOT_FOUND", message: "Unknown tenant.", status: 404 });
    await expect(service().list()).resolves.toEqual([{ code: "test", name: "Test", generation: 1 }]);
  });

  it("reads the current generation fresh, past a copy already in the identity map", async () => {
    const em = orm.em.fork();
    const tenants = new TenantService({ em });
    await expect(tenants.get("test")).resolves.toMatchObject({ generation: 1 });
    await orm.em.fork().nativeUpdate(Tenant, { code: "test" }, { generation: 2 });

    await expect(tenants.currentGeneration("test")).resolves.toBe(2);
  });

  it("reports a missing tenant row as TENANT_NOT_FOUND when reading its generation", async () => {
    await orm.em.getConnection().execute("delete from tenant where code = 'prod'");

    await expect(service().currentGeneration("prod")).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
  });
});
