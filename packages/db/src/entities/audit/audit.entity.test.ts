import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initOrm, migrate, type Orm } from "../../orm";
import { selectTenant, TenantViolationError } from "../tenants/tenant-owned";
import type { TenantCode } from "../tenants/tenant.entity";
import { AUDIT_APPEND_ONLY, type AuditSnapshot } from "./audit-event";
import { GlobalAuditEvent } from "./global-audit-event.entity";
import { TenantAuditEvent } from "./tenant-audit-event.entity";

const entry = (overrides: { before?: AuditSnapshot | null; after?: AuditSnapshot | null } = {}) => ({
  action: "users.user.deactivated",
  subjectType: "User",
  subjectId: "4b0c1c5e-0000-4000-8000-000000000001",
  subjectLabel: "alice",
  before: { active: true },
  after: { active: false },
  actorUserId: "4b0c1c5e-0000-4000-8000-000000000002",
  actorUsername: "admin",
  sessionId: "4b0c1c5e-0000-4000-8000-000000000003",
  channel: "ui" as const,
  ...overrides,
});

describe("GlobalAuditEvent and TenantAuditEvent", () => {
  const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-audit-")), "cpg.sqlite");
  let orm: Orm;

  const scope = (code?: TenantCode) => {
    const em = orm.em.fork();
    if (code) selectTenant(em, code);
    return em;
  };
  const execute = (sql: string) => orm.em.getConnection().execute(sql);

  beforeAll(async () => {
    await migrate({ databasePath });
    orm = await initOrm({ databasePath });
  });
  afterAll(() => orm.close());

  it("stores a Global entry with its id, time and parsed snapshots", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T11:00:00Z") });
    try {
      const em = scope();
      const event = em.create(GlobalAuditEvent, entry());
      await em.flush();

      const stored = await scope().findOneOrFail(GlobalAuditEvent, { id: event.id });
      expect(stored.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(stored.occurredAt).toEqual(new Date("2026-10-19T11:00:00Z"));
      expect(stored.before).toEqual({ active: true });
      expect(stored.after).toEqual({ active: false });
      expect(stored.tokenId).toBeNull();
      expect(stored.tokenName).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stores null snapshots (a password reset records no values)", async () => {
    const em = scope();
    const event = em.create(GlobalAuditEvent, entry({ before: null, after: null }));
    await em.flush();

    const stored = await scope().findOneOrFail(GlobalAuditEvent, { id: event.id });
    expect(stored.before).toBeNull();
    expect(stored.after).toBeNull();
  });

  it("fills a tenant entry's tenant from the scope and keeps it from the other tenant (R05)", async () => {
    const em = scope("prod");
    const event = em.create(TenantAuditEvent, entry());
    await em.flush();

    expect((await scope("prod").findOneOrFail(TenantAuditEvent, { id: event.id })).tenant.code).toBe("prod");
    expect(await scope("test").findOne(TenantAuditEvent, { id: event.id })).toBeNull();
  });

  it("refuses to read the tenant audit without a tenant scope", async () => {
    await expect(scope().find(TenantAuditEvent, {})).rejects.toThrow(TenantViolationError);
  });

  /** The ORM calls each store is probed with, typed per entity (the two schemas don't unify). */
  const stores = [
    {
      table: "global_audit_event",
      create: async () => {
        const em = scope();
        const { id } = em.create(GlobalAuditEvent, entry());
        await em.flush();
        return id;
      },
      update: (id: string) => scope().nativeUpdate(GlobalAuditEvent, { id }, { subjectLabel: "mallory" }),
      remove: (id: string) => scope().nativeDelete(GlobalAuditEvent, { id }),
    },
    {
      table: "tenant_audit_event",
      create: async () => {
        const em = scope("test");
        const { id } = em.create(TenantAuditEvent, entry());
        await em.flush();
        return id;
      },
      update: (id: string) => scope("test").nativeUpdate(TenantAuditEvent, { id }, { subjectLabel: "mallory" }),
      remove: (id: string) => scope("test").nativeDelete(TenantAuditEvent, { id }),
    },
  ];

  describe.each(stores)("$table is append-only (AUD-010)", ({ table, create, update, remove }) => {
    let id: string;

    beforeAll(async () => {
      id = await create();
    });

    it("aborts an update through the ORM", async () => {
      await expect(update(id)).rejects.toThrow(AUDIT_APPEND_ONLY);
    });

    it("aborts a delete through the ORM", async () => {
      await expect(remove(id)).rejects.toThrow(AUDIT_APPEND_ONLY);
    });

    it("aborts raw SQL updates and deletes, and the entry is unchanged", async () => {
      await expect(execute(`update ${table} set subject_label = 'mallory'`)).rejects.toThrow(AUDIT_APPEND_ONLY);
      await expect(execute(`delete from ${table}`)).rejects.toThrow(AUDIT_APPEND_ONLY);

      const [row] = await execute(`select subject_label from ${table} where id = '${id}'`);
      expect(row.subject_label).toBe("alice");
    });
  });
});
