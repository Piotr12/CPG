import { describe, expect, it } from "vitest";
import { switchTenantPath } from "./switch-tenant-path";

describe("switchTenantPath", () => {
  it.each([
    ["/admin/test", "prod", "/admin/prod"],
    ["/admin/prod/materials", "test", "/admin/test/materials"],
    // A record ID is tenant-local: the same ID in the other tenant is another record (TEN-012).
    ["/admin/test/materials/00000005", "prod", "/admin/prod/materials"],
    ["/admin", "test", "/admin/test"],
    ["/admin/users", "prod", "/admin/prod"],
    ["/help", "prod", "/admin/prod"],
  ] as const)("%s → %s gives %s", (pathname, target, expected) => {
    expect(switchTenantPath(pathname, target)).toBe(expected);
  });
});
