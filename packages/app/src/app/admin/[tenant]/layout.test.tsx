import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import TenantLayout, { generateMetadata, generateStaticParams } from "./layout";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
  tenantHeader: vi.fn(),
}));
vi.mock("@cpg/core", () => ({
  TENANT_CODES: ["test", "prod"],
  TENANT_NAMES: { test: "Test", prod: "Prod" },
  tenantCodeSchema: z.enum(["test", "prod"]),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("../../../components/tenants/read-only-banner", () => ({
  ReadOnlyBanner: ({ tenant }: { tenant: string }) => <div data-testid="read-only-banner" data-tenant={tenant} />,
}));
vi.mock("../../../components/tenants/tenant-header", () => ({
  TenantHeader: ({ scope }: { scope: string }) => {
    mocks.tenantHeader(scope);
    return <div data-testid="tenant-header" data-tenant={scope} />;
  },
}));

const params = (tenant: string) => Promise.resolve({ tenant });

describe("TenantLayout", () => {
  afterEach(() => vi.clearAllMocks());

  it("prerenders both tenants", () => {
    expect(generateStaticParams()).toEqual([{ tenant: "test" }, { tenant: "prod" }]);
  });

  it("puts the tenant's header row, then its read-only banner slot, above the page", async () => {
    render(await TenantLayout({ children: <p>page</p>, params: params("prod") }));

    const header = screen.getByTestId("tenant-header");
    const banner = screen.getByTestId("read-only-banner");
    expect(header.dataset.tenant).toBe("prod");
    expect(banner.dataset.tenant).toBe("prod");
    expect(header.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(banner.compareDocumentPosition(screen.getByText("page")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("prefixes every page title with the tenant", async () => {
    await expect(generateMetadata({ children: null, params: params("test") })).resolves.toEqual({
      title: { template: "Test · %s", default: "Test · Admin · Caveman Planning Good" },
    });
  });

  it.each(["staging", "TEST"])("answers %s with a 404", async (tenant) => {
    await expect(TenantLayout({ children: null, params: params(tenant) })).rejects.toThrow("404");
    await expect(generateMetadata({ children: null, params: params(tenant) })).rejects.toThrow("404");
    expect(mocks.notFound).toHaveBeenCalled();
    // The 404 comes before the header row: no row for a tenant that doesn't exist.
    expect(mocks.tenantHeader).not.toHaveBeenCalled();
  });
});
