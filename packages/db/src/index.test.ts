import { describe, expect, it } from "vitest";
import * as db from "./index";

describe("@cpg/db", () => {
  it("exports the public API", () => {
    expect(Object.keys(db).sort()).toEqual([
      "GLOBAL_ENTITIES",
      "LOCALES",
      "Session",
      "Setting",
      "TENANT_CODES",
      "TENANT_FILTER",
      "THEMES",
      "Tenant",
      "TenantViolationError",
      "USER_ROLES",
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
    expect(db.entities).toEqual([db.Setting, db.User, db.Session, db.UserPreference, db.Tenant]);
    expect(db.GLOBAL_ENTITIES).toEqual(db.entities);
  });
});
