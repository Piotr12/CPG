import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../tests/setup/server-components";
import TenantHomePage from "./page";

const mocks = vi.hoisted(() => {
  class AppError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    AppError,
    connection: vi.fn(),
    requireAdmin: vi.fn(),
    tenantScope: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    }),
  };
});
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@cpg/core", () => ({ AppError: mocks.AppError, tenantScope: mocks.tenantScope }));
vi.mock("../../../auth/require-admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("../actions", () => ({ signOut: vi.fn() }));

const page = (tenant: string) => TenantHomePage({ params: Promise.resolve({ tenant }), searchParams: Promise.resolve({}) });

describe("TenantHomePage", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockResolvedValue({ username: "admin", role: "admin" });
    mocks.tenantScope.mockResolvedValue({ cradle: { tenant: { code: "prod", name: "Prod", generation: 1 } } });
  });
  afterEach(() => vi.clearAllMocks());

  it("shows the tenant, read through its own scope, to the signed-in admin", async () => {
    render(await resolveServerComponents(page("prod")));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(screen.getByRole("heading", { name: "Cave control" })).toBeTruthy();
    expect(screen.getByText("Prod")).toBeTruthy();
    expect(screen.getByText("Dataset generation 1")).toBeTruthy();
    expect(screen.getByText("No business records yet")).toBeTruthy();
    expect(screen.getByText("admin").tagName).toBe("STRONG");
  });

  it("opens no tenant for a visitor the gate refuses", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT /login"));

    await expect(resolveServerComponents(page("prod"))).rejects.toThrow("NEXT_REDIRECT /login");
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });

  it("renders not-found when the tenant is missing from the database", async () => {
    mocks.tenantScope.mockRejectedValue(new mocks.AppError("TENANT_NOT_FOUND"));

    await expect(resolveServerComponents(page("prod"))).rejects.toThrow("404");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("lets any other failure through", async () => {
    mocks.tenantScope.mockRejectedValue(new mocks.AppError("SOMETHING_ELSE"));

    await expect(resolveServerComponents(page("prod"))).rejects.toThrow("SOMETHING_ELSE");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
