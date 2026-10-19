import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GlobalAuditEvent, initOrm, migrate, selectTenant, Tenant, TenantViolationError, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { toDbOptions } from "../../database";
import { NotFoundError } from "../../http/errors";
import type { AuditActor } from "../audit/actor";
import { isScopeReadOnly, TENANT_NAMES, TenantService } from "./tenant.service";

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
      { code: "test", name: "Test", generation: 1, readOnly: false },
      { code: "prod", name: "Prod", generation: 1, readOnly: false },
    ]);
    expect(TENANT_NAMES).toEqual({ test: "Test", prod: "Prod" });
  });

  it("reads one tenant", async () => {
    await expect(service().get("prod")).resolves.toEqual({ code: "prod", name: "Prod", generation: 1, readOnly: false });
  });

  it("reports a missing tenant row as TENANT_NOT_FOUND", async () => {
    await orm.em.getConnection().execute("delete from tenant where code = 'prod'");

    const error = await service().get("prod").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toMatchObject({ code: "TENANT_NOT_FOUND", message: "Unknown tenant.", status: 404 });
    await expect(service().list()).resolves.toEqual([{ code: "test", name: "Test", generation: 1, readOnly: false }]);
  });

  it("reads the current generation and flag fresh, past a copy already in the identity map", async () => {
    const em = orm.em.fork();
    const tenants = new TenantService({ em });
    await expect(tenants.get("test")).resolves.toMatchObject({ generation: 1, readOnly: false });
    await orm.em.fork().nativeUpdate(Tenant, { code: "test" }, { generation: 2, readOnly: true });

    await expect(tenants.currentState("test")).resolves.toEqual({ generation: 2, readOnly: true });
  });

  it("reports a missing tenant row as TENANT_NOT_FOUND when reading its state", async () => {
    await orm.em.getConnection().execute("delete from tenant where code = 'prod'");

    await expect(service().currentState("prod")).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
  });

  describe("setReadOnly", () => {
    const admin: AuditActor = { userId: "u-admin", username: "admin", sessionId: "s1", channel: "ui", token: null };
    const audit = () =>
      orm.em
        .fork()
        .find(GlobalAuditEvent, {}, { orderBy: { occurredAt: "asc" } })
        .then((events) =>
          events.map(({ action, subjectType, subjectId, subjectLabel, before, after, actorUsername }) => ({
            action,
            subject: `${subjectType} ${subjectId} ${subjectLabel}`,
            before,
            after,
            actorUsername,
          })),
        );

    it("makes a tenant read-only and writable again, each change audited with before and after (AUD-016)", async () => {
      await expect(service().setReadOnly("prod", true, admin)).resolves.toEqual({
        code: "prod",
        name: "Prod",
        generation: 1,
        readOnly: true,
      });
      expect(await audit()).toEqual([
        {
          action: "tenants.tenant.read-only-changed",
          subject: "Tenant prod Prod",
          before: { readOnly: false },
          after: { readOnly: true },
          actorUsername: "admin",
        },
      ]);

      await new Promise((resolve) => setTimeout(resolve, 5));
      await expect(service().setReadOnly("prod", false, admin)).resolves.toMatchObject({ readOnly: false });
      expect((await audit()).map(({ before, after }) => [before, after])).toEqual([
        [{ readOnly: false }, { readOnly: true }],
        [{ readOnly: true }, { readOnly: false }],
      ]);
    });

    it("keeps the flags independent (TEN-021)", async () => {
      await service().setReadOnly("test", true, admin);

      await expect(service().list()).resolves.toEqual([
        { code: "test", name: "Test", generation: 1, readOnly: true },
        { code: "prod", name: "Prod", generation: 1, readOnly: false },
      ]);
    });

    it("changes and records nothing when the flag already has the value", async () => {
      await expect(service().setReadOnly("test", false, admin)).resolves.toMatchObject({ readOnly: false });

      expect(await audit()).toEqual([]);
    });

    it("compares with the stored flag, not a copy the request loaded earlier", async () => {
      const tenants = new TenantService({ em: orm.em.fork() });
      await expect(tenants.get("prod")).resolves.toMatchObject({ readOnly: false });
      await orm.em.fork().nativeUpdate(Tenant, { code: "prod" }, { readOnly: true });

      await expect(tenants.setReadOnly("prod", true, admin)).resolves.toMatchObject({ readOnly: true });
      expect(await audit()).toEqual([]);
      await expect(tenants.setReadOnly("prod", false, admin)).resolves.toMatchObject({ readOnly: false });
      expect((await audit()).map(({ before, after }) => [before, after])).toEqual([[{ readOnly: true }, { readOnly: false }]]);
    });

    it("reports a missing tenant row as TENANT_NOT_FOUND and records nothing", async () => {
      await orm.em.getConnection().execute("delete from tenant where code = 'prod'");

      await expect(service().setReadOnly("prod", true, admin)).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
      expect(await audit()).toEqual([]);
    });
  });

  describe("isScopeReadOnly", () => {
    it("reads the scope's own tenant flag, fresh", async () => {
      const em = orm.em.fork();
      selectTenant(em, "test");
      await em.findOneOrFail(Tenant, { code: "test" });
      await orm.em.fork().nativeUpdate(Tenant, { code: "prod" }, { readOnly: true });

      await expect(isScopeReadOnly(em)).resolves.toBe(false);
      await orm.em.fork().nativeUpdate(Tenant, { code: "test" }, { readOnly: true });
      await expect(isScopeReadOnly(em)).resolves.toBe(true);
    });

    it("refuses an EntityManager with no tenant scope", async () => {
      await expect(isScopeReadOnly(orm.em.fork())).rejects.toBeInstanceOf(TenantViolationError);
    });
  });
});
