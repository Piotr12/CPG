import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    count: vi.fn(),
    materials: vi.fn(),
    locations: vi.fn(),
    units: vi.fn(),
    setRequisitionRequiredDate: vi.fn(),
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
vi.mock("./actions", () => ({
  cancelRequisition: vi.fn(),
  closeEarlyRequisition: vi.fn(),
  createRequisition: vi.fn(),
  setRequisitionRequiredDate: mocks.setRequisitionRequiredDate,
}));

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
const page = (search: Record<string, string> = {}) =>
  PurchaseRequisitionsPage({ params: Promise.resolve({ tenant: "test" }), searchParams: Promise.resolve(search) });
const scope = (readOnly = false) => ({
  cradle: {
    tenant: tenant(readOnly),
    purchaseRequisitionService: { list: mocks.requisitions, count: mocks.count },
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
    mocks.count.mockResolvedValue(2);
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
      ["00000001", "00000001Steel sheet", "00000001Main plant", "100 kg", "60 kg", "40 kg", "2027-03-01", "Open", "0 kg", "Change dateClose Early"],
      ["00000002", "00000002Old rivetInactive", "00000001Main plant", "5 each", "5 each", "40 each", "2027-03-01", "Completed", "0 each", ""],
    ]);
    expect(screen.getAllByRole("link", { name: "00000001" })[0].getAttribute("href")).toBe("/admin/test/materials/00000001");
    expect(screen.getByRole("button", { name: "Create requisition" })).toBeTruthy();
  });

  it("changes an Open row's required date at the version the page loaded, and offers no Change date on a Completed row", async () => {
    mocks.setRequisitionRequiredDate.mockResolvedValue({ ok: false, error: { code: "VERSION_CONFLICT", message: "Changed." } });
    render(await resolveServerComponents(page()));
    const rows = within(screen.getByRole("table", { name: "Purchase requisitions" })).getAllByRole("row").slice(1);
    expect(within(rows[1]).queryByRole("button")).toBeNull();

    fireEvent.click(within(rows[0]).getByRole("button", { name: "Change date — Purchase requisitions 00000001" }));
    expect(screen.getByRole("dialog", { name: "Change required date — Purchase requisitions 00000001" })).toBeTruthy();
    expect((screen.getByLabelText("Required by") as HTMLInputElement).value).toBe("2027-03-01");
    fireEvent.change(screen.getByLabelText("Required by"), { target: { value: "2027-04-01" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));

    expect(mocks.setRequisitionRequiredDate).toHaveBeenCalledWith("test", 1, "00000001", 1, { requiredDate: "2027-04-01" });
    expect(screen.getByRole("alert").textContent).toBe(en.errors.VERSION_CONFLICT);
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

    const { unmount } = render(await resolveServerComponents(page()));

    expect(screen.getByText("No purchase requisitions in Test yet.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    unmount();

    // An Open row offers neither Change date nor its lifecycle action either.
    mocks.requisitions.mockResolvedValue([requisition("00000001", "00000001", "100.000000", "0.000000", "open")]);
    render(await resolveServerComponents(page()));
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("pages by 100: links to the neighbouring pages, reads the asked page, and shows no links for a single page", async () => {
    const { unmount } = render(await resolveServerComponents(page()));
    expect(mocks.requisitions).toHaveBeenLastCalledWith(1);
    expect(screen.queryByRole("navigation", { name: "Purchase requisition pages" })).toBeNull();
    unmount();

    mocks.count.mockResolvedValue(250);
    render(await resolveServerComponents(page({ page: "2" })));

    expect(mocks.requisitions).toHaveBeenLastCalledWith(2);
    const nav = screen.getByRole("navigation", { name: "Purchase requisition pages" });
    expect(nav.textContent).toContain("Page 2 of 3");
    expect(within(nav).getByRole("link", { name: "Previous" }).getAttribute("href")).toBe("/admin/test/purchase-requisitions?page=1");
    expect(within(nav).getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/admin/test/purchase-requisitions?page=3");
  });

  it("shows the last page for a page past it, and the first page of an empty tenant", async () => {
    mocks.count.mockResolvedValue(250);
    render(await resolveServerComponents(page({ page: "9" })));
    expect(mocks.requisitions).toHaveBeenLastCalledWith(3);
    expect(screen.getByRole("navigation", { name: "Purchase requisition pages" }).textContent).toContain("Page 3 of 3");
    cleanup();

    mocks.count.mockResolvedValue(0);
    mocks.requisitions.mockResolvedValue([]);
    render(await resolveServerComponents(page({ page: "4" })));
    expect(mocks.requisitions).toHaveBeenLastCalledWith(1);
  });

  it("renders not-found for an invalid page", async () => {
    for (const bad of ["0", "x", "1.5"]) await expect(resolveServerComponents(page({ page: bad }))).rejects.toThrow("404");
    expect(mocks.requisitions).not.toHaveBeenCalled();
  });

  it("renders not-found for an unknown tenant", async () => {
    mocks.tenantScope.mockRejectedValue(new mocks.AppError("TENANT_NOT_FOUND"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
  });
});
