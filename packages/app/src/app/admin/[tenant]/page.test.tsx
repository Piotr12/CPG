import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../tests/setup/server-components";
import { en } from "../../../i18n/messages/en";
import { pl } from "../../../i18n/messages/pl";
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
    getMessages: vi.fn(),
    requireUser: vi.fn(),
    tenantScope: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    }),
  };
});
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@cpg/core", () => ({ AppError: mocks.AppError, tenantScope: mocks.tenantScope }));
vi.mock("../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));

function as(locale: "en" | "pl") {
  mocks.getMessages.mockResolvedValue({ locale, messages: locale === "en" ? en : pl });
}

const page = (tenant: string) => TenantHomePage({ params: Promise.resolve({ tenant }), searchParams: Promise.resolve({}) });

describe("TenantHomePage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "admin", role: "admin" });
    mocks.tenantScope.mockResolvedValue({ cradle: { tenant: { code: "prod", name: "Prod", generation: 1 } } });
    as("en");
  });
  afterEach(() => vi.clearAllMocks());

  it("shows the tenant, read through its own scope, to the signed-in admin", async () => {
    render(await resolveServerComponents(page("prod")));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(screen.getByRole("heading", { name: "Overview — Prod" })).toBeTruthy();
    expect(screen.getByText("Prod")).toBeTruthy();
    expect(screen.getByText("Dataset generation 1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Materials" }).getAttribute("href")).toBe("/admin/prod/materials");
    expect(screen.getByRole("link", { name: "Locations" }).getAttribute("href")).toBe("/admin/prod/locations");
    expect(screen.getByRole("link", { name: "Customers" }).getAttribute("href")).toBe("/admin/prod/customers");
    expect(screen.getByRole("link", { name: "Suppliers" }).getAttribute("href")).toBe("/admin/prod/suppliers");
    expect(screen.getByRole("link", { name: "Planning parameters" }).getAttribute("href")).toBe("/admin/prod/planning-parameters");
    expect(screen.getByRole("link", { name: "Safety stock" }).getAttribute("href")).toBe("/admin/prod/safety-stock");
    expect(screen.getByRole("link", { name: "Forecasts" }).getAttribute("href")).toBe("/admin/prod/forecasts");
    expect(screen.getByRole("link", { name: "BOMs" }).getAttribute("href")).toBe("/admin/prod/boms");
    expect(screen.getByRole("link", { name: "Audit — Prod" }).getAttribute("href")).toBe("/admin/prod/audit");
  });

  it("opens a tenant to a normal user too (TEN-010)", async () => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });

    render(await resolveServerComponents(page("prod")));

    expect(screen.getByRole("heading", { name: "Overview — Prod" })).toBeTruthy();
    // The account and its controls are in the menu, not on the page.
    expect(screen.queryByText("alice")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("speaks Polish to a Polish account", async () => {
    as("pl");

    render(await resolveServerComponents(page("prod")));

    expect(screen.getByRole("heading", { name: "Przegląd — Prod" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getByText("Generacja zbioru danych: 1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Materiały" })).toBeTruthy();
  });

  it("opens no tenant for a visitor the gate refuses", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));

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
