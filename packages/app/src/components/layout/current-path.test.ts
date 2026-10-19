import { describe, expect, it } from "vitest";
import { isCurrentPath, tenantFromPath } from "./current-path";

describe("isCurrentPath", () => {
  it("matches the entry's own screen, exact or not", () => {
    expect(isCurrentPath("/admin/users", "/admin/users", "prefix")).toBe(true);
    expect(isCurrentPath("/admin", "/admin", "exact")).toBe(true);
  });

  it("matches pages under a prefix entry, so a record page belongs to its list", () => {
    expect(isCurrentPath("/admin/test/materials", "/admin/test/materials/00000005", "prefix")).toBe(true);
  });

  it("keeps exact entries to themselves, so Overview and Tenants don't match every page below them", () => {
    expect(isCurrentPath("/admin", "/admin/tokens", "exact")).toBe(false);
    expect(isCurrentPath("/admin/test", "/admin/test/audit", "exact")).toBe(false);
  });

  it("doesn't match a path that only shares a prefix", () => {
    expect(isCurrentPath("/admin/test", "/admin/testing", "prefix")).toBe(false);
    expect(isCurrentPath("/help", "/admin", "prefix")).toBe(false);
  });
});

describe("tenantFromPath", () => {
  it.each([
    ["/admin/test", "test"],
    ["/admin/prod/materials/00000005", "prod"],
    ["/admin", null],
    ["/admin/users", null],
    ["/admin/TEST", null],
    ["/admin/staging/materials", null],
    ["/test", null],
    ["/", null],
  ] as const)("%s belongs to %s", (pathname, tenant) => {
    expect(tenantFromPath(pathname)).toBe(tenant);
  });
});
