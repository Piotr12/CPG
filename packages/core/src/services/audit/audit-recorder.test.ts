import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GlobalAuditEvent, initOrm, selectTenant, TenantAuditEvent, TenantViolationError, type Orm } from "@cpg/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import type { AuditActor } from "./actor";
import { recordGlobalAudit, recordTenantAudit, type AuditEntry } from "./audit-recorder";

const actor: AuditActor = { userId: "u-1", username: "admin", sessionId: "s-1", channel: "ui", token: null };
const apiActor: AuditActor = {
  userId: "u-2",
  username: "robot",
  sessionId: null,
  channel: "api",
  token: { id: "t-1", name: "robot-a" },
};

let next = 0;
/** An entry with a fresh subject id, so tests can find their own rows in the shared append-only tables. */
function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    action: "users.user.deactivated",
    subject: { type: "User", id: `subject-${++next}`, label: "alice" },
    before: { active: true },
    after: { active: false },
    ...overrides,
  };
}

describe("audit recorder", () => {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-audit-recorder-")) });
  let orm: Orm;

  const tenantEm = () => {
    const em = orm.em.fork();
    selectTenant(em, "test");
    return em;
  };

  beforeAll(async () => {
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
  });
  afterAll(() => orm.close());

  describe("recordGlobalAudit", () => {
    it("stores every actor and subject field, and only on the caller's flush", async () => {
      const em = orm.em.fork();
      const recorded = entry();
      recordGlobalAudit(em, actor, recorded);

      expect(await orm.em.fork().count(GlobalAuditEvent, { subjectId: recorded.subject.id })).toBe(0);
      await em.flush();

      const stored = await orm.em.fork().findOneOrFail(GlobalAuditEvent, { subjectId: recorded.subject.id });
      expect(stored).toMatchObject({
        action: "users.user.deactivated",
        subjectType: "User",
        subjectLabel: "alice",
        before: { active: true },
        after: { active: false },
        actorUserId: "u-1",
        actorUsername: "admin",
        sessionId: "s-1",
        channel: "ui",
        tokenId: null,
        tokenName: null,
      });
    });

    it("stores an entry with no snapshots (a password reset)", async () => {
      const em = orm.em.fork();
      const recorded = entry({ action: "users.user.password-reset", before: null, after: null });
      recordGlobalAudit(em, actor, recorded);
      await em.flush();

      const stored = await orm.em.fork().findOneOrFail(GlobalAuditEvent, { subjectId: recorded.subject.id });
      expect(stored).toMatchObject({ action: "users.user.password-reset", before: null, after: null });
    });

    it("names the token of an API change, and has no session for it (AUD-007)", async () => {
      const em = orm.em.fork();
      const recorded = entry();
      recordGlobalAudit(em, apiActor, recorded);
      await em.flush();

      const stored = await orm.em.fork().findOneOrFail(GlobalAuditEvent, { subjectId: recorded.subject.id });
      expect(stored).toMatchObject({ channel: "api", sessionId: null, tokenId: "t-1", tokenName: "robot-a" });
    });

    it.each([
      ["before", { before: { passwordHash: "$argon2id$..." } }],
      ["after", { after: { newPassword: "hunter2" } }],
      ["after", { after: { clientSecret: "x" } }],
    ])("refuses a snapshot whose %s names a secret, and nothing is stored (AUD-028)", async (_side, overrides) => {
      const em = orm.em.fork();
      const recorded = entry(overrides);

      expect(() => recordGlobalAudit(em, actor, recorded)).toThrow(/must not carry secrets/);
      await em.flush();
      expect(await orm.em.fork().count(GlobalAuditEvent, { subjectId: recorded.subject.id })).toBe(0);
    });
  });

  describe("recordTenantAudit", () => {
    it("stores the entry in the scope's tenant", async () => {
      const em = tenantEm();
      const recorded = entry();
      recordTenantAudit(em, actor, recorded);
      await em.flush();

      const stored = await tenantEm().findOneOrFail(TenantAuditEvent, { subjectId: recorded.subject.id });
      expect(stored.tenant.code).toBe("test");
      expect(stored.actorUsername).toBe("admin");
    });

    it("refuses an EntityManager without a tenant scope", () => {
      expect(() => recordTenantAudit(orm.em.fork(), actor, entry())).toThrow(TenantViolationError);
    });

    it("refuses a secret like the Global audit does", () => {
      expect(() => recordTenantAudit(tenantEm(), actor, entry({ before: { secret: "x" } }))).toThrow(/secrets/);
    });
  });
});
