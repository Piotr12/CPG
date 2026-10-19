import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { switchTenantPath, TenantSwitcher } from "./tenant-switcher";
import { tenantHome } from "./tenant-switch-links";

const mocks = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: mocks.usePathname }));

const TENANTS = [
  { code: "test" as const, name: "Test" },
  { code: "prod" as const, name: "Prod" },
];

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

  it("names each tenant's home", () => {
    expect(tenantHome("prod")).toBe("/admin/prod");
  });
});

describe("TenantSwitcher", () => {
  afterEach(() => vi.clearAllMocks());

  it("links both tenants from the current section and marks the current one", () => {
    mocks.usePathname.mockReturnValue("/admin/test/materials/00000005");

    render(<TenantSwitcher tenants={TENANTS} current="test" />);

    const test = screen.getByRole("link", { name: "Test" });
    const prod = screen.getByRole("link", { name: "Prod" });
    expect(test.getAttribute("href")).toBe("/admin/test/materials");
    expect(test.getAttribute("aria-current")).toBe("page");
    expect(prod.getAttribute("href")).toBe("/admin/prod/materials");
    expect(prod.getAttribute("aria-current")).toBeNull();
  });
});
