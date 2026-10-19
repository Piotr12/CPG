import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GlobalAuditEvent, initOrm, selectTenant, TenantAuditEvent, TenantViolationError, type Orm } from "@cpg/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { auditListSchema } from "../../validators/audit/audit-list.schema";
import { AuditService } from "./audit.service";

const UNKNOWN_ID = "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f";
const TIME = new Date("2026-10-19T12:00:00Z");

/** An audit row's columns; `n` makes each one recognisable. */
const row = (n: number, occurredAt: Date) => ({
  occurredAt,
  action: "users.user.created",
  subjectType: "User",
  subjectId: `subject-${n}`,
  subjectLabel: `user-${n}`,
  before: null,
  after: { username: `user-${n}` },
  actorUserId: "admin-id",
  actorUsername: "admin",
  sessionId: "admin-session",
  channel: "ui" as const,
  tokenId: null,
  tokenName: null,
});

describe("AuditService", () => {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-audit-service-")) });
  let orm: Orm;

  const scoped = (code?: "test" | "prod") => {
    const em = orm.em.fork();
    if (code) selectTenant(em, code);
    return em;
  };
  const service = (code?: "test" | "prod") => new AuditService({ em: scoped(code) });
  const query = (raw: Record<string, unknown> = {}) => auditListSchema.parse(raw);
  /** Every Global entry, page by page, as the labels each page holds. */
  async function walkGlobal(limit: number): Promise<string[][]> {
    const pages: string[][] = [];
    let before: string | undefined;
    do {
      const page = await service().listGlobal(query({ before, limit }));
      pages.push(page.entries.map(({ subject }) => subject.label));
      before = page.nextBefore ?? undefined;
    } while (before);
    return pages;
  }

  beforeAll(async () => {
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    // Five Global entries: three at one instant (ties ordered by id), two later.
    const em = scoped();
    for (let n = 1; n <= 3; n++) em.create(GlobalAuditEvent, row(n, TIME));
    em.create(GlobalAuditEvent, row(4, new Date(TIME.getTime() + 1000)));
    em.create(GlobalAuditEvent, row(5, new Date(TIME.getTime() + 2000)));
    await em.flush();
    // One entry per tenant.
    for (const code of ["test", "prod"] as const) {
      const tenantEm = scoped(code);
      tenantEm.create(TenantAuditEvent, { ...row(10, TIME), subjectLabel: `${code}-material` });
      await tenantEm.flush();
    }
  });
  afterAll(() => orm.close());

  it("lists the Global audit newest first, as views", async () => {
    const { entries, nextBefore } = await service().listGlobal(query());

    expect(entries.map(({ subject }) => subject.label).slice(0, 2)).toEqual(["user-5", "user-4"]);
    expect(entries).toHaveLength(5);
    expect(nextBefore).toBeNull();
    expect(entries[0]).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      occurredAt: new Date(TIME.getTime() + 2000),
      action: "users.user.created",
      subject: { type: "User", id: "subject-5", label: "user-5" },
      before: null,
      after: { username: "user-5" },
      actor: { userId: "admin-id", username: "admin" },
      sessionId: "admin-session",
      channel: "ui",
      token: null,
    });
  });

  it("pages without repeats or gaps, also through entries that share one instant", async () => {
    const pages = await walkGlobal(2);

    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.length)).toEqual([2, 2, 1]);
    expect(pages[0]).toEqual(["user-5", "user-4"]);
    expect(pages.flat().sort()).toEqual(["user-1", "user-2", "user-3", "user-4", "user-5"]);
  });

  it("orders entries of one instant the same way every time", async () => {
    expect((await walkGlobal(1)).flat()).toEqual((await walkGlobal(4)).flat());
  });

  it("says when there is no older page, even on an exactly full one", async () => {
    expect((await service().listGlobal(query({ limit: 5 }))).nextBefore).toBeNull();
    expect((await service().listGlobal(query({ limit: 4 }))).nextBefore).not.toBeNull();
  });

  it("rejects a cursor this audit doesn't hold", async () => {
    await expect(service().listGlobal(query({ before: UNKNOWN_ID }))).rejects.toMatchObject({
      code: "AUDIT_CURSOR_NOT_FOUND",
      status: 404,
    });
  });

  it("lists only the scope's tenant (R05), and rejects the other tenant's entry as a cursor", async () => {
    const test = await service("test").listTenant(query());
    const prod = await service("prod").listTenant(query());

    expect(test.entries.map(({ subject }) => subject.label)).toEqual(["test-material"]);
    expect(prod.entries.map(({ subject }) => subject.label)).toEqual(["prod-material"]);
    await expect(service("test").listTenant(query({ before: prod.entries[0].id }))).rejects.toMatchObject({
      code: "AUDIT_CURSOR_NOT_FOUND",
    });
    expect((await service("test").listTenant(query({ before: test.entries[0].id }))).entries).toEqual([]);
  });

  it("refuses the tenant audit without a tenant scope", async () => {
    await expect(service().listTenant(query())).rejects.toThrow(TenantViolationError);
  });

  it("shows an API entry's token, and reads entries this request just wrote", async () => {
    const em = scoped();
    const service = new AuditService({ em });
    em.create(GlobalAuditEvent, {
      ...row(6, new Date(TIME.getTime() + 3000)),
      sessionId: undefined,
      before: undefined,
      after: undefined,
      channel: "api",
      tokenId: "t-1",
      tokenName: "robot-a",
    });
    await em.flush();

    const [entry] = (await service.listGlobal(query({ limit: 1 }))).entries;
    expect(entry).toMatchObject({
      channel: "api",
      sessionId: null,
      before: null,
      after: null,
      token: { id: "t-1", name: "robot-a" },
    });
  });
});

describe("auditListSchema", () => {
  it("defaults to 50 and reads query-string numbers", () => {
    expect(auditListSchema.parse({})).toEqual({ limit: 50 });
    expect(auditListSchema.parse({ limit: "100" })).toEqual({ limit: 100 });
  });

  it.each([{ limit: "0" }, { limit: "101" }, { limit: "2.5" }, { limit: "lots" }, { before: "not-a-uuid" }])(
    "rejects %j",
    (raw) => {
      expect(auditListSchema.safeParse(raw).success).toBe(false);
    },
  );
});
