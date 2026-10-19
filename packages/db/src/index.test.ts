import { describe, expect, it } from "vitest";
import * as db from "./index";

describe("@cpg/db", () => {
  it("exports the public API", () => {
    expect(Object.keys(db).sort()).toEqual([
      "AUDIT_APPEND_ONLY",
      "AUDIT_CHANNELS",
      "GLOBAL_ENTITIES",
      "GlobalAuditEvent",
      "LOCALES",
      "Session",
      "Setting",
      "TENANT_CODES",
      "TENANT_FILTER",
      "THEMES",
      "Tenant",
      "TenantAuditEvent",
      "TenantViolationError",
      "USER_ROLES",
      "UniqueConstraintViolationException",
      "User",
      "UserPreference",
      "createOrmConfig",
      "currentTenant",
      "entities",
      "getMigrationStatus",
      "initOrm",
      "isTenantOwned",
      "migrate",
      "selectTenant",
      "tenantOwned",
    ]);
    expect(db.entities).toEqual([
      db.Setting,
      db.User,
      db.Session,
      db.UserPreference,
      db.Tenant,
      db.GlobalAuditEvent,
      db.TenantAuditEvent,
    ]);
    expect(db.GLOBAL_ENTITIES).toEqual(db.entities.filter((entity) => entity !== db.TenantAuditEvent));
  });
});
