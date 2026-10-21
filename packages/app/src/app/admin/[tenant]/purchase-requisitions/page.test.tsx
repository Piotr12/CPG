import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import PurchaseRequisitionsPage from "./page";

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
    requisitions: vi.fn(),
    materials: vi.fn(),
    locations: vi.fn(),
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
vi.mock("./actions", () => ({ cancelRequisition: vi.fn(), closeEarlyRequisition: vi.fn(), createRequisition: vi.fn() }));

const material = (id: string, description: string, baseUnit: string, active = true) => ({
  id,
  type: "raw",
  description,
  baseUnit,
  active,
  createdAt: new Date(),
  version: 1,
});
const MATERIALS = [material("00000001", "Steel sheet", "kg"), material("00000002", "Old rivet", "each", false)];
const LOCATIONS = [
  { id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 },
  { id: "00000002", name: "Old quarry", active: false, createdAt: new Date(), version: 1 },
];
const requisition = (id: string, materialId: string, quantity: string, converted: string, status: string) => ({
  id,
  material: materialId,
  location: "00000001",
  quantity,
  enteredQuantity: "1",
  enteredUnit: "kg",
  numerator: "1",
  denominator: "1",
  requiredDate: "2027-03-01",
  converted,
  abandoned: "0.000000",
  outstanding: "40.000000",
  status,
  createdAt: new Date(),
  version: 1,
});
const tenant = (readOnly = false) => ({ code: "test", name: "Test", generation: 1, readOnly });
const page = () => PurchaseRequisitionsPage({ params: Promise.resolve({ tenant: "test" }), searchParams: Promise.resolve({}) });
const scope = (readOnly = false) => ({
  cradle: {
    tenant: tenant(readOnly),
    purchaseRequisitionService: { list: mocks.requisitions },
    materialService: { list: mocks.materials, listUnits: mocks.units },
    locationService: { list: mocks.locations },
  },
});

describe("PurchaseRequisitionsPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue(scope());
    mocks.requisitions.mockResolvedValue([
      requisition("00000001", "00000001", "100.000000", "60.000000", "open"),
      requisition("00000002", "00000002", "5.000000", "5.000000", "completed"),
    ]);
    mocks.materials.mockResolvedValue(MATERIALS);
    mocks.locations.mockResolvedValue(LOCATIONS);
    mocks.units.mockResolvedValue({ "00000001": ["kg", "t"], "00000002": ["each"] });
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("lists the tenant's requisitions with their converted and outstanding quantities, and offers any user Create requisition (LFC-001)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Purchase requisitions — Test");
    const rows = within(screen.getByRole("table", { name: "Purchase requisitions" })).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["00000001", "00000001Steel sheet", "00000001Main plant", "100 kg", "60 kg", "40 kg", "2027-03-01", "Open", "0 kg", "Close Early"],
      ["00000002", "00000002Old rivetInactive", "00000001Main plant", "5 each", "5 each", "40 each", "2027-03-01", "Completed", "0 each", ""],
    ]);
    expect(screen.getAllByRole("link", { name: "00000001" })[0].getAttribute("href")).toBe("/admin/test/materials/00000001");
    expect(screen.getByRole("button", { name: "Create requisition" })).toBeTruthy();
  });

  it("shows the list in Polish, and the empty state with how to start", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });
    mocks.requisitions.mockResolvedValue([]);

    render(await resolveServerComponents(page()));

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Zapotrzebowania zakupu — Test");
    expect(screen.getByText(/Brak zapotrzebowań zakupu w Test\. Utwórz pierwsze/)).toBeTruthy();
  });

  it("gives no Create requisition while the tenant is read-only, and says how to start only when it can (R05)", async () => {
    mocks.tenantScope.mockResolvedValue(scope(true));
    mocks.requisitions.mockResolvedValue([]);

    render(await resolveServerComponents(page()));

    expect(screen.getByText("No purchase requisitions in Test yet.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders not-found for an unknown tenant", async () => {
    mocks.tenantScope.mockRejectedValue(new mocks.AppError("TENANT_NOT_FOUND"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
  });
});
