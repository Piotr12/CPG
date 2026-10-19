import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import CustomersPage from "./page";

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
    list: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    }),
  };
});
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@cpg/core", () => ({ AppError: mocks.AppError, tenantScope: mocks.tenantScope }));
vi.mock("../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("./actions", () => ({ createCustomer: vi.fn(), updateCustomer: vi.fn() }));

beforeAll(() => {
  // Radix positions menus with ResizeObserver, which jsdom doesn't have.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const records = [
  { id: "00000001", name: "First", active: true, createdAt: new Date(), version: 1 },
  { id: "00000002", name: "Second", active: false, createdAt: new Date(), version: 2 },
];
const page = (tenant: string) => CustomersPage({ params: Promise.resolve({ tenant }), searchParams: Promise.resolve({}) });

describe("CustomersPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "admin", role: "admin" });
    mocks.tenantScope.mockResolvedValue({
      cradle: { tenant: { code: "test", name: "Test", generation: 2 }, customerService: { list: mocks.list } },
    });
    mocks.list.mockResolvedValue(records);
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("lists the tenant's customers, read through its own scope, with Create and row menus for the admin", async () => {
    render(await resolveServerComponents(page("test")));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(screen.getByRole("heading", { name: "Customers — Test" })).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
    expect(screen.getByText("Inactive")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create customer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Actions for 00000002" })).toBeTruthy();
  });

  it("shows a normal user the list without any control (TEN-004), in Polish when chosen", async () => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });

    render(await resolveServerComponents(page("test")));

    expect(screen.getByRole("heading", { name: "Klienci — Test" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reads nothing for a visitor the gate refuses", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));

    await expect(resolveServerComponents(page("test"))).rejects.toThrow("NEXT_REDIRECT /login");
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });

  it("renders not-found for a tenant missing from the database", async () => {
    mocks.tenantScope.mockRejectedValue(new mocks.AppError("TENANT_NOT_FOUND"));

    await expect(resolveServerComponents(page("test"))).rejects.toThrow("404");
  });
});
