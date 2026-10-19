import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TenantStrip } from "./tenant-strip";

vi.mock("@cpg/core", () => ({ TENANT_CODES: ["test", "prod"], TENANT_NAMES: { test: "Test", prod: "Prod" } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/test/materials" }));

const strip = () => screen.getByRole("region", { name: "Active tenant" });

describe("TenantStrip", () => {
  it.each([
    ["test", "TEST", "Test tenant — demonstration data, safe to experiment", "bg-amber-200", "Test"],
    ["prod", "PROD", "Prod tenant — live data", "bg-neutral-900", "Prod"],
  ] as const)("shows the %s tenant in words and colour (TEN-011)", (scope, label, text, colour, current) => {
    render(<TenantStrip scope={scope} />);

    expect(strip().dataset.tenant).toBe(scope);
    expect(strip().className).toContain(colour);
    expect(within(strip()).getByText(label)).toBeTruthy();
    expect(within(strip()).getByText(text)).toBeTruthy();
    expect(within(strip()).getByRole("link", { name: current }).getAttribute("aria-current")).toBe("page");
  });

  it("shows pages outside any tenant as Global, with links to both tenants", () => {
    render(<TenantStrip scope="global" />);

    expect(within(strip()).getByText("GLOBAL")).toBeTruthy();
    expect(within(strip()).getByText("Global — no tenant selected")).toBeTruthy();
    const links = within(strip()).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("aria-current")])).toEqual([
      ["Test", null],
      ["Prod", null],
    ]);
  });
});
