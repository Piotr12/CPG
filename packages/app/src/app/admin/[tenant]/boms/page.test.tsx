import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import BomsPage from "./page";

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
    boms: vi.fn(),
    materials: vi.fn(),
    units: vi.fn(),
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
vi.mock("./actions", () => ({ createBom: vi.fn() }));

const material = (id: string, type: string, description: string, baseUnit: string, active = true) => ({
  id,
  type,
  description,
  baseUnit,
  active,
  createdAt: new Date(),
  version: 1,
});
const MATERIALS = [
  material("00000002", "raw", "Bolt M8", "each"),
  material("00000004", "intermediate", "Painted side panel", "each"),
  material("00000005", "finished", "Cabinet, red", "each", false),
];
const line = (materialId: string, quantity: string) => ({
  material: materialId,
  quantity,
  enteredQuantity: "1",
  enteredUnit: "each",
  numerator: "1",
  denominator: "1",
});
const bom = (id: string, priority: number, validThrough: string | null, active = true) => ({
  id,
  output: "00000005",
  active,
  revision: 2,
  priority,
  validFrom: "2026-01-01",
  validThrough,
  components: [line("00000004", "4.000000"), line("00000002", "24.000000")],
  createdAt: new Date(),
  version: 1,
});
const tenant = (readOnly = false) => ({ code: "test", name: "Test", generation: 1, readOnly });
const page = () => BomsPage({ params: Promise.resolve({ tenant: "test" }), searchParams: Promise.resolve({}) });
const scope = (readOnly = false) => ({
  cradle: {
    tenant: tenant(readOnly),
    bomService: { list: mocks.boms },
    materialService: { list: mocks.materials, listUnits: mocks.units },
  },
});

describe("BomsPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "admin", role: "admin" });
    mocks.tenantScope.mockResolvedValue(scope());
    mocks.boms.mockResolvedValue([bom("00000002", 1, null), bom("00000003", 2, "2026-12-31", false)]);
    mocks.materials.mockResolvedValue(MATERIALS);
    mocks.units.mockResolvedValue({ "00000002": ["each", "case"], "00000004": ["each"], "00000005": ["each"] });
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("lists the tenant's BOMs with their outputs, current revisions and components, with the admin's Create BOM (BOM-008)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("BOMs — Test");
    const rows = within(screen.getByRole("table", { name: "BOMs" })).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["00000002", "00000005Cabinet, redInactive", "1", "rev 2", "2026-01-01", "—", "4 each 00000004 Painted side panel, 24 each 00000002 Bolt M8", "Active"],
      ["00000003", "00000005Cabinet, redInactive", "2", "rev 2", "2026-01-01", "2026-12-31", "4 each 00000004 Painted side panel, 24 each 00000002 Bolt M8", "Inactive"],
    ]);
    expect(screen.getByRole("link", { name: "00000002" }).getAttribute("href")).toBe("/admin/test/boms/00000002");
    expect(screen.getAllByRole("link", { name: "00000005" })[0].getAttribute("href")).toBe("/admin/test/materials/00000005");
    expect(screen.getByRole("button", { name: "Create BOM" })).toBeTruthy();
  });

  it("shows a normal user the list without Create BOM, in Polish, and the empty state (TEN-004)", async () => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });
    mocks.boms.mockResolvedValue([]);

    render(await resolveServerComponents(page()));

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("BOM-y — Test");
    expect(screen.getByText("Brak BOM-ów w Test.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("gives the admin no Create BOM while the tenant is read-only, and says how to start only when it can (R05)", async () => {
    mocks.tenantScope.mockResolvedValue(scope(true));
    mocks.boms.mockResolvedValue([]);

    render(await resolveServerComponents(page()));

    expect(screen.getByText("No BOMs in Test yet.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders not-found for an unknown tenant", async () => {
    mocks.tenantScope.mockRejectedValue(new mocks.AppError("TENANT_NOT_FOUND"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
  });
});
