import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import TenantLayout, { generateMetadata, generateStaticParams } from "./layout";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
}));
vi.mock("@cpg/core", () => ({
  TENANT_CODES: ["test", "prod"],
  TENANT_NAMES: { test: "Test", prod: "Prod" },
  tenantCodeSchema: z.enum(["test", "prod"]),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("../../../components/tenants/tenant-strip", () => ({
  TenantStrip: ({ scope }: { scope: string }) => <div data-testid="strip" data-tenant={scope} />,
}));

const params = (tenant: string) => Promise.resolve({ tenant });

describe("TenantLayout", () => {
  afterEach(() => vi.clearAllMocks());

  it("prerenders both tenants", () => {
    expect(generateStaticParams()).toEqual([{ tenant: "test" }, { tenant: "prod" }]);
  });

  it("puts the tenant's strip above the page", async () => {
    render(await TenantLayout({ children: <p>page</p>, params: params("prod") }));

    expect(screen.getByTestId("strip").dataset.tenant).toBe("prod");
    expect(screen.getByText("page")).toBeTruthy();
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
  });
});
