import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../../tests/setup/server-components";
import { en } from "../../../../../i18n/messages/en";
import MaterialPage from "./page";

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
    get: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    }),
  };
});
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@cpg/core", () => ({ AppError: mocks.AppError, tenantScope: mocks.tenantScope }));
vi.mock("../../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("../../../../../components/materials/material-controls", () => ({
  MaterialControls: ({ material }: { material: { id: string; version: number } }) => (
    <button>controls {`${material.id} v${material.version}`}</button>
  ),
}));
vi.mock("../../../../../components/materials/add-conversion-dialog", () => ({
  AddConversionDialog: () => <button>add conversion</button>,
}));
vi.mock("../../../../../components/materials/conversion-actions", () => ({
  ConversionActions: ({ conversion }: { conversion: { unit: string } }) => <button>menu {conversion.unit}</button>,
}));

const bolt = {
  id: "00000002",
  type: "raw",
  description: "Bolt M8",
  baseUnit: "each",
  active: false,
  createdAt: new Date("2026-10-19T19:00:00Z"),
  version: 4,
  conversions: [{ unit: "case", numerator: "12", denominator: "1", inverse: "0.083333", version: 1 }],
};
const page = (id: string) => MaterialPage({ params: Promise.resolve({ tenant: "prod", id }), searchParams: Promise.resolve({}) });

describe("MaterialPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "admin", role: "admin" });
    mocks.tenantScope.mockResolvedValue({
      cradle: { tenant: { code: "prod", name: "Prod", generation: 1, readOnly: false }, materialService: { get: mocks.get } },
    });
    mocks.get.mockResolvedValue(bolt);
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("shows the material, its details and conversions, read in the path's tenant, with the admin's controls", async () => {
    render(await resolveServerComponents(page("00000002")));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(mocks.get).toHaveBeenCalledWith("00000002");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("00000002 — Bolt M8");
    expect(screen.getByRole("link", { name: "All materials" }).getAttribute("href")).toBe("/admin/prod/materials");
    expect(screen.getAllByRole("definition").map((value) => value.textContent)).toEqual(["Raw", "each", "Inactive", "2026-10-19"]);
    // Inactive is a quiet, switched-off state: a neutral StatusBadge with a dashed edge, inside the page header's block.
    const status = screen.getByText("Inactive").closest("[data-slot=status-badge]");
    expect(status?.getAttribute("data-tone")).toBe("neutral");
    expect(status?.className).toContain("border-dashed");
    expect(screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]")?.textContent).toContain("controls 00000002 v4");
    expect(screen.getByText(/^Quantities entered in another unit are converted into each once/)).toBeTruthy();
    expect(screen.getByText("1 case = 12 each")).toBeTruthy();
    expect(screen.getByRole("button", { name: "controls 00000002 v4" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "add conversion" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "menu case" })).toBeTruthy();
  });

  it("shows a normal user the same material without any control (TEN-004)", async () => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.get.mockResolvedValue({ ...bolt, active: true });

    render(await resolveServerComponents(page("00000002")));

    expect(screen.getByText("Active").closest("[data-slot=status-badge]")?.className).not.toContain("border-dashed");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the admin no control while the tenant is read-only (R05)", async () => {
    mocks.tenantScope.mockResolvedValue({
      cradle: { tenant: { code: "prod", name: "Prod", generation: 1, readOnly: true }, materialService: { get: mocks.get } },
    });

    render(await resolveServerComponents(page("00000002")));

    expect(screen.getByText("1 case = 12 each")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the loading frame while the material streams in", () => {
    const { container } = render(page("00000002").props.children.props.fallback);

    expect(container.querySelector('[aria-busy="true"] [data-slot="skeleton"]')).toBeTruthy();
    expect(container.textContent).toBe("");
  });

  it("renders not-found for an ID this tenant doesn't have (TEN-014), and lets other failures through", async () => {
    mocks.get.mockRejectedValueOnce(new mocks.AppError("MATERIAL_NOT_FOUND"));
    await expect(resolveServerComponents(page("00000099"))).rejects.toThrow("404");

    mocks.get.mockRejectedValueOnce(new mocks.AppError("SOMETHING_ELSE"));
    await expect(resolveServerComponents(page("00000002"))).rejects.toThrow("SOMETHING_ELSE");
  });
});
