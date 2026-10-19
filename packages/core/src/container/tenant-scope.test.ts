import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, migrate, TENANT_FILTER, type Orm } from "@cpg/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config";
import { toDbOptions } from "../database";
import { createAppContainer, getContainer } from "./container";
import type { AppContainer } from "./cradle";
import { scopeForTenant, tenantScope } from "./tenant-scope";

describe("scopeForTenant", () => {
  let orm: Orm;
  let container: AppContainer;

  beforeAll(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-tenant-scope-")) });
    await migrate(toDbOptions(config));
    orm = await initOrm(toDbOptions(config));
    container = createAppContainer(config, orm);
  });
  afterAll(() => orm.close());

  it("registers the tenant and scopes the request's EntityManager to it", async () => {
    const scope = await scopeForTenant(container, "prod");

    expect(scope.cradle.tenant).toEqual({ code: "prod", name: "Prod", generation: 1, readOnly: false });
    expect(scope.cradle.em.getFilterParams(TENANT_FILTER)).toEqual({ code: "prod" });
  });

  it("keeps two tenant scopes apart", async () => {
    const [test, prod] = await Promise.all([scopeForTenant(container, "test"), scopeForTenant(container, "prod")]);

    expect(test.cradle.em).not.toBe(prod.cradle.em);
    expect(test.cradle.em.getFilterParams(TENANT_FILTER)).toEqual({ code: "test" });
    expect(prod.cradle.tenant.code).toBe("prod");
  });

  it.each(["staging", "TEST", "Prod", ""])("rejects %j as TENANT_NOT_FOUND", async (code) => {
    await expect(scopeForTenant(container, code)).rejects.toMatchObject({ code: "TENANT_NOT_FOUND", status: 404 });
  });

  it("leaves global scopes without a tenant", () => {
    const scope = container.createScope();

    expect(() => scope.cradle.tenant).toThrow(/tenant/);
    expect(scope.cradle.em.getFilterParams(TENANT_FILTER)).toBeUndefined();
  });
});

describe("tenantScope", () => {
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => (await getContainer()).cradle.orm.close());

  it("builds the tenant scope on the process-wide container", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "cpg-tenant-scope-global-"));
    await migrate(toDbOptions(loadConfig({ DATA_DIR: dataDir })));
    vi.stubEnv("DATA_DIR", dataDir);

    const scope = await tenantScope("test");

    expect(scope.cradle.tenant.code).toBe("test");
    expect(scope.cradle.config).toBe((await getContainer()).cradle.config);
  });
});
