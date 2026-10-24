import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isGroup, TENANT_TREE } from "../../../components/layout/nav-tree";
import { en } from "../../../i18n/messages/en";
import { BackLink } from "./back-link";

const mocks = vi.hoisted(() => ({ pathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: mocks.pathname }));

const lists = TENANT_TREE.flatMap((node) => (isGroup(node) ? node.children : [node]))
  .filter((leaf) => "section" in leaf && leaf.section)
  .map((leaf) => ({ ...leaf, label: en.nav[leaf.id] }));
const labels = { backTo: en.notFound.backTo, backToOverview: en.notFound.backToOverview, goToTenants: en.notFound.goToTenants };
const link = (pathname: string) => {
  cleanup();
  mocks.pathname.mockReturnValue(pathname);
  render(<BackLink lists={lists} tenants={{ test: "Test", prod: "Prod" }} labels={labels} />);
  const anchor = screen.getByRole("link");
  return [anchor.textContent, anchor.getAttribute("href")];
};

describe("BackLink", () => {
  afterEach(() => vi.clearAllMocks());

  it.each([
    ["/admin/test/materials/99999999", "Back to Materials", "/admin/test/materials"],
    ["/admin/prod/production-orders/00000999", "Back to Production orders", "/admin/prod/production-orders"],
    ["/admin/test/reports/stock", "Back to Stock report", "/admin/test/reports/stock"],
    ["/admin/test/boms/00000001", "Back to BOMs", "/admin/test/boms"],
  ])("leads from %s to its list", (pathname, text, href) => {
    expect(link(pathname)).toEqual([text, href]);
  });

  it("leads to the tenant's Overview when the address belongs to no list", () => {
    expect(link("/admin/prod/unknown")).toEqual(["Back to Overview — Prod", "/admin/prod"]);
    // A list's name only prefixes the address; it isn't the list.
    expect(link("/admin/test/materials-old")).toEqual(["Back to Overview — Test", "/admin/test"]);
  });

  it("leads to Tenants outside any tenant", () => {
    expect(link("/admin/TEST/materials")).toEqual(["Go to Tenants", "/admin"]);
  });

  it("is an outline button", () => {
    link("/admin/test/materials/1");
    expect(screen.getByRole("link").getAttribute("data-variant")).toBe("outline");
  });
});
