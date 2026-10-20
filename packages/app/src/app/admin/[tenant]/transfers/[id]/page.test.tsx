import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../../tests/setup/server-components";
import { en } from "../../../../../i18n/messages/en";
import { pl } from "../../../../../i18n/messages/pl";
import TransferPage from "./page";

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
    locations: vi.fn(),
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
vi.mock("../../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("./actions", () => ({ dispatchTransfer: vi.fn(), receiveTransfer: vi.fn(), writeOffTransfer: vi.fn(), setTransferDates: vi.fn() }));

const location = (id: string, name: string) => ({ id, name, active: true, createdAt: new Date(), version: 1 });
const posting = (id: string, kind: string, legs: unknown[], reason: string) => ({
  id, kind, businessDate: "2027-03-02", occurredAt: new Date(), quantity: "50.000000", enteredQuantity: "50", enteredUnit: "kg", numerator: "1", denominator: "1",
  reason, actorUsername: "alice", channel: "ui", legs,
});
const TRANSFER = {
  id: "00000001", material: "00000001", source: "00000001", destination: "00000002", quantity: "100.000000", enteredQuantity: "100", enteredUnit: "kg",
  numerator: "1", denominator: "1", plannedDispatch: "2027-03-01", plannedArrival: "2027-03-03", dispatched: "60.000000", received: "50.000000",
  writtenOff: "0.000000", inTransit: "10.000000", undispatched: "40.000000", status: "open", createdAt: new Date(), updatedAt: new Date(), version: 3,
  postings: [
    posting("r1", "receipt", [
      { place: "transit", location: null, quantity: "-50.000000", before: "60.000000", after: "10.000000" },
      { place: "destination", location: "00000002", quantity: "50.000000", before: "0.000000", after: "50.000000" },
    ], "Transfer 00000001 receipt at 00000002 from 00000001"),
    posting("d1", "dispatch", [
      { place: "source", location: "00000001", quantity: "-60.000000", before: "100.000000", after: "40.000000" },
      { place: "transit", location: null, quantity: "60.000000", before: "0.000000", after: "60.000000" },
    ], "Transfer 00000001 dispatch from 00000001 to 00000002"),
  ],
};
const scope = (readOnly = false) => ({
  cradle: {
    tenant: { code: "test", name: "Test", generation: 1, readOnly },
    transferService: { get: mocks.get },
    locationService: { list: mocks.locations },
    materialService: { list: mocks.materials, listUnits: mocks.units },
  },
});
const page = (id = "00000001") => TransferPage({ params: Promise.resolve({ tenant: "test", id }), searchParams: Promise.resolve({}) });

describe("TransferPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue(scope());
    mocks.get.mockResolvedValue(TRANSFER);
    mocks.locations.mockResolvedValue([location("00000001", "Main plant"), location("00000002", "Warehouse")]);
    mocks.materials.mockResolvedValue([{ id: "00000001", type: "raw", description: "Steel sheet", baseUnit: "kg", active: true, createdAt: new Date(), version: 1 }]);
    mocks.units.mockResolvedValue({ "00000001": ["kg", "t"] });
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("shows the transfer's route, dates and quantities, with transit apart (INV-009, TRF-023)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.get).toHaveBeenCalledWith("00000001");
    expect(screen.getByRole("heading", { name: "Transfer 00000001 — 00000001 Steel sheet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "All transfers" }).getAttribute("href")).toBe("/admin/test/transfers");
    const term = (label: string) => screen.getAllByText(label).find((node) => node.tagName === "DT")!.nextElementSibling!.textContent;
    expect(term("From")).toBe("00000001 Main plant");
    expect(term("To")).toBe("00000002 Warehouse");
    expect(term("Planned dispatch")).toBe("2027-03-01");
    expect(term("Planned arrival")).toBe("2027-03-03");
    expect(term("Planned quantity")).toBe("100 kg");
    expect(term("Still to dispatch")).toBe("40 kg");
    expect(term("Written off")).toBe("0 kg");
    expect(document.querySelector("[data-transfer-in-transit]")!.textContent).toBe("10 kg");
  });

  it("shows each posting's legs in the order the goods move, with the transfer as their source (TRF-024)", async () => {
    render(await resolveServerComponents(page()));

    const table = within(screen.getByRole("table", { name: "Ledger" }));
    const rows = table.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").slice(0, 5).map((cell) => cell.textContent));
    expect(rows).toEqual([
      ["2027-03-02", "Receipt", "In transit", "-50 kg", "10 kg"],
      ["", "", "00000002 Warehouse (to)", "+50 kg", "50 kg"],
      ["2027-03-02", "Dispatch", "00000001 Main plant (from)", "-60 kg", "40 kg"],
      ["", "", "In transit", "+60 kg", "60 kg"],
    ]);
    expect(table.getByText("Transfer 00000001 receipt at 00000002 from 00000001")).toBeTruthy();
    expect(table.getAllByText("alice · UI · Entered as 50 kg")).toHaveLength(2);
  });

  it("offers Dispatch, Receive, Write off and Change dates while each can do something, with its limit (TRF-004…013)", async () => {
    render(await resolveServerComponents(page()));

    expect(screen.getByRole("button", { name: "Dispatch" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Receive" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Write off" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change dates" })).toBeTruthy();
  });

  it("hides what can't move anything: nothing to dispatch, nothing in transit", async () => {
    mocks.get.mockResolvedValue({ ...TRANSFER, undispatched: "0.000000", inTransit: "0.000000", postings: [] });

    render(await resolveServerComponents(page()));

    expect(screen.queryByRole("button", { name: "Dispatch" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Receive" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Write off" })).toBeNull();
    expect(screen.getByRole("button", { name: "Change dates" })).toBeTruthy();
    expect(screen.getByText(en.transfers.ledger.empty)).toBeTruthy();
  });

  it("gives no write controls on a Completed transfer or a read-only tenant, in Polish too (R05)", async () => {
    mocks.get.mockResolvedValue({ ...TRANSFER, status: "completed" });
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });
    const { unmount } = render(await resolveServerComponents(page()));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Zrealizowane")).toBeTruthy();
    unmount();

    mocks.get.mockResolvedValue(TRANSFER);
    mocks.tenantScope.mockResolvedValue(scope(true));
    render(await resolveServerComponents(page()));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("heading", { name: "Przesunięcie 00000001 — 00000001 Steel sheet" })).toBeTruthy();
  });

  it("renders not-found for a transfer or tenant this tenant doesn't have (TEN-014)", async () => {
    mocks.get.mockRejectedValueOnce(new mocks.AppError("TRANSFER_NOT_FOUND"));
    await expect(resolveServerComponents(page("00000009"))).rejects.toThrow("404");
    mocks.tenantScope.mockRejectedValue(new mocks.AppError("TENANT_NOT_FOUND"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
  });
});
