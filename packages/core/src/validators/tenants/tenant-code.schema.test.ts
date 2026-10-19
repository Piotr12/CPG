import { TENANT_CODES as DB_TENANT_CODES } from "@cpg/db";
import { describe, expect, it } from "vitest";
import { TENANT_CODES, tenantCodeSchema } from "./tenant-code.schema";

describe("tenantCodeSchema", () => {
  it("lists the same tenants as the database", () => {
    expect(TENANT_CODES).toEqual(DB_TENANT_CODES);
  });

  it("accepts exactly test and prod", () => {
    expect(tenantCodeSchema.parse("test")).toBe("test");
    expect(tenantCodeSchema.parse("prod")).toBe("prod");
    for (const code of ["TEST", "Prod", "staging", "", " test"]) {
      expect(tenantCodeSchema.safeParse(code).success).toBe(false);
    }
  });
});
