import { describe, expect, it } from "vitest";
import * as db from "./index";

describe("@cpg/db", () => {
  it("exports the public API", () => {
    expect(Object.keys(db).sort()).toEqual([
      "Session",
      "Setting",
      "TENANT_CODES",
      "Tenant",
      "USER_ROLES",
      "User",
      "createOrmConfig",
      "entities",
      "getMigrationStatus",
      "initOrm",
      "migrate",
    ]);
    expect(db.entities).toEqual([db.Setting, db.User, db.Session, db.Tenant]);
  });
});
