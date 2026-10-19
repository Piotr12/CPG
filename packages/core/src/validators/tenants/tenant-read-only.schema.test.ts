import { describe, expect, it } from "vitest";
import { tenantReadOnlyBodySchema, tenantReadOnlySchema } from "./tenant-read-only.schema";

describe("tenantReadOnlyBodySchema", () => {
  it("accepts the flag to set, either way", () => {
    expect(tenantReadOnlyBodySchema.parse({ readOnly: true })).toEqual({ readOnly: true });
    expect(tenantReadOnlyBodySchema.parse({ readOnly: false })).toEqual({ readOnly: false });
  });

  it("refuses a missing or non-boolean flag, and any other field", () => {
    for (const body of [{}, { readOnly: "true" }, { readOnly: 1 }, null, { readOnly: true, generation: 2 }]) {
      expect(tenantReadOnlyBodySchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("tenantReadOnlySchema", () => {
  it("takes a tenant code and the flag", () => {
    expect(tenantReadOnlySchema.parse({ tenant: "prod", readOnly: true })).toEqual({ tenant: "prod", readOnly: true });
  });

  it("refuses an unknown tenant", () => {
    expect(tenantReadOnlySchema.safeParse({ tenant: "TEST", readOnly: true }).success).toBe(false);
  });
});
