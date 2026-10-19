import { describe, expect, it } from "vitest";
import * as db from "./index";

describe("@cpg/db", () => {
  it("exports the public API", () => {
    expect(Object.keys(db).sort()).toEqual([
      "GLOBAL_ENTITIES",
      "Session",
      "Setting",
      "TENANT_CODES",
      "TENANT_FILTER",
      "Tenant",
      "TenantViolationError",
      "USER_ROLES",
      "User",
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
    expect(db.entities).toEqual([db.Setting, db.User, db.Session, db.Tenant]);
    expect(db.GLOBAL_ENTITIES).toEqual(db.entities);
  });
});
