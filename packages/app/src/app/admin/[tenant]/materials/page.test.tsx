import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import MaterialsPage from "./page";

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
vi.mock("../../../../components/materials/create-material-dialog", () => ({
  CreateMaterialDialog: ({ context }: { context: { tenant: string; generation: number } }) => (
    <button>create in {`${context.tenant} generation ${context.generation}`}</button>
  ),
}));

const bolt = { id: "00000001", type: "raw", description: "Bolt M8", baseUnit: "each", active: true, createdAt: new Date(), version: 1 };
const page = (tenant: string, searchParams: Record<string, string> = {}) =>
  MaterialsPage({ params: Promise.resolve({ tenant }), searchParams: Promise.resolve(searchParams) });

describe("MaterialsPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "admin", role: "admin" });
    mocks.tenantScope.mockResolvedValue({
      cradle: { tenant: { code: "test", name: "Test", generation: 2, readOnly: false }, materialService: { list: mocks.list } },
    });
    mocks.list.mockResolvedValue([bolt]);
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("lists the tenant's materials, read through its own scope, with Create for the admin bound to its generation", async () => {
    render(await resolveServerComponents(page("test")));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(screen.getByRole("heading", { name: "Materials — Test" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "00000001" }).getAttribute("href")).toBe("/admin/test/materials/00000001");
    expect(screen.getByRole("button", { name: "create in test generation 2" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Import from spreadsheet" }).getAttribute("href")).toBe("/admin/test/import");
    // Both actions sit in the page header beside the title, the intro under it.
    const header = screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]");
    expect(header?.querySelectorAll("a, button")).toHaveLength(2);
    expect(header?.textContent).toContain(en.materials.intro);
  });

  it("shows a normal user the list without Create (TEN-004), in Polish when chosen", async () => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });

    render(await resolveServerComponents(page("test")));

    expect(screen.getByRole("heading", { name: "Materiały — Test" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getByText("Surowiec")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^create in/ })).toBeNull();
  });

  it("offers the admin no Create while the tenant is read-only (R05)", async () => {
    mocks.tenantScope.mockResolvedValue({
      cradle: { tenant: { code: "test", name: "Test", generation: 2, readOnly: true }, materialService: { list: mocks.list } },
    });
    mocks.list.mockResolvedValue([]);

    render(await resolveServerComponents(page("test")));

    expect(screen.queryByRole("button", { name: /^create in/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Import from spreadsheet" })).toBeNull();
    expect(screen.getByText("No materials in Test yet.")).toBeTruthy();
  });

  it("lists everything by ID with a search box and sortable headers when the address asks for nothing (#217)", async () => {
    render(await resolveServerComponents(page("test")));

    expect(mocks.list).toHaveBeenCalledWith({ q: "", sort: "id", dir: "asc" });
    expect(screen.getByRole("searchbox", { name: "Search materials" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Material ID" }).getAttribute("aria-sort")).toBe("ascending");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("searches and sorts the whole list on the server, saying how many match (#217)", async () => {
    render(await resolveServerComponents(page("test", { q: " bolt ", sort: "description", dir: "desc" })));

    expect(mocks.list).toHaveBeenCalledWith({ q: "bolt", sort: "description", dir: "desc" });
    expect(screen.getByRole("status").textContent).toBe("1 result for “bolt” · Clear search");
    expect(screen.getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/admin/test/materials?sort=description&dir=desc");
    expect(screen.getByRole("link", { name: "Description" }).getAttribute("href")).toBe("/admin/test/materials?q=bolt&sort=description&dir=asc");
    expect(screen.getByText("Bolt").tagName).toBe("MARK");
  });

  it("refuses a search past the limits in the form, listing everything, and ignores an unknown sort (#217)", async () => {
    render(await resolveServerComponents(page("test", { q: "a b c d e f", sort: "uuid" })));

    expect(mocks.list).toHaveBeenCalledWith({ q: "", sort: "id", dir: "asc" });
    expect(screen.getByRole("searchbox").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Search with at most 5 words and 100 characters.")).toBeTruthy();
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
