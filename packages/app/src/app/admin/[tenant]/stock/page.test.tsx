import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, type StockView } from "@cpg/core";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import StockPage from "./page";
const mocks = vi.hoisted(() => ({ connection: vi.fn(), requireUser: vi.fn(), tenantScope: vi.fn(), getMessages: vi.fn(), get: vi.fn(), materials: vi.fn(), locations: vi.fn(), material: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope }));
vi.mock("../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("./actions", () => ({ postStockCorrection: vi.fn() }));
const tenant = { code: "test", name: "Test", generation: 1, readOnly: false };
const material = { id: "00000001", type: "raw", description: "Bolts", baseUnit: "each", active: true, createdAt: new Date(), version: 1 };
const location = { id: "00000001", name: "Warehouse", active: true, createdAt: new Date(), version: 1 };
const pair = { material: "00000001", location: "00000001" };
const movement = { ...pair, id: "m1", postingId: "p1", position: 0, type: "correction", businessDate: "2027-01-01", occurredAt: new Date(), quantity: "2.000000", baseUnit: "each", enteredQuantity: "2.000000", enteredUnit: "case", numerator: "12", denominator: "1", balanceBefore: "0.000000", balanceAfter: "2.000000", reason: "Opening balance", actorUserId: null, actorUsername: "Demo seed", channel: "seed" as const, source: { id: null, document: null } };
const view: StockView = { ...pair, quantity: "0.000000", baseUnit: "each", materialDescription: "Bolts", locationName: "Warehouse", materialActive: true, locationActive: true, inTransitFrom: "0.000000", inTransitTo: "0.000000", transitTransfers: [], page: 1, movementCount: 0, movements: [] };
const scope = (readOnly = false) => ({ cradle: { tenant: { ...tenant, readOnly }, stockService: { get: mocks.get }, materialService: { list: mocks.materials, get: mocks.material }, locationService: { list: mocks.locations } } });
const page = (search: Record<string, string | string[]> = {}) => StockPage({ params: Promise.resolve({ tenant: "test" }), searchParams: Promise.resolve(search) });
beforeEach(() => {
  mocks.requireUser.mockResolvedValue({ role: "user" }); mocks.tenantScope.mockResolvedValue(scope()); mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  mocks.materials.mockResolvedValue([material]); mocks.locations.mockResolvedValue([location]); mocks.material.mockResolvedValue({ ...material, conversions: [{ unit: "case" }] }); mocks.get.mockResolvedValue(view);
});
afterEach(() => vi.clearAllMocks());
describe("StockPage", () => {
  it("opens the default pair, displays zero and an empty ledger, and offers both roles a correction", async () => {
    render(await resolveServerComponents(page()));
    expect(mocks.tenantScope).toHaveBeenCalledWith("test"); expect(mocks.get).toHaveBeenCalledWith({ ...pair, page: 1 });
    expect(screen.getByRole("heading", { name: "Stock — Test" })).toBeTruthy(); expect(document.querySelector("[data-stock-balance]")!.textContent).toBe("0 each");
    expect(screen.getByText(en.stock.empty)).toBeTruthy(); expect(screen.getByRole("button", { name: "Post correction" })).toBeTruthy();
    expect(screen.getByLabelText("Material").getAttribute("name")).toBe("material");
    expect(screen.getByRole("link", { name: en.stock.report }).getAttribute("href")).toBe("/admin/test/reports/stock");
    expect(screen.queryByRole("navigation", { name: en.stock.pagination })).toBeNull();
  });
  it("reads selected query references, renders signed history with its type, source document, actor and factor (INV-012)", async () => {
    mocks.get.mockResolvedValue({ ...view, quantity: "23.500000", movementCount: 4, movements: [
      movement,
      { ...movement, id: "m2", quantity: "-0.500000", channel: "api", actorUsername: "alice", type: "receipt" },
      { ...movement, id: "m3", postingId: "g1", type: "goods-receipt", quantity: "3.000000", actorUsername: "bob", channel: "ui", source: { id: "00000004", document: { type: "purchase-order", id: "00000002" } } },
      { ...movement, id: "m4", postingId: "i1", type: "goods-issue", quantity: "-1.000000", actorUsername: "carol", channel: "ui", source: { id: "00000005", document: { type: "shipment", id: "00000003" } } },
    ] });
    render(await resolveServerComponents(page(pair)));
    expect(mocks.get).toHaveBeenCalledWith({ ...pair, page: 1 });
    const table = within(screen.getByRole("table", { name: en.stock.ledger }));
    expect(table.getByText("+2 each")).toBeTruthy(); expect(table.getByText("-0.5 each")).toBeTruthy();
    expect(table.getByText("Demo seed · Installation")).toBeTruthy(); expect(table.getByText("alice · API")).toBeTruthy();
    expect(table.getByText("Correction")).toBeTruthy(); expect(table.getByText("receipt")).toBeTruthy();
    // Only a correction is its own source; a movement whose document isn't known shows none.
    expect(table.getAllByText(en.stock.ownSource)).toHaveLength(1); expect(table.getByText("—")).toBeTruthy();
    expect(table.getByText(/Posting: g1/)).toBeTruthy(); expect(table.getAllByText(/Factor: 12\/1/)).toHaveLength(4);
    // A receipt links to its purchase order and an issue to its shipment, each naming its own ID.
    expect(table.getByText("Goods receipt")).toBeTruthy();
    expect(table.getByRole("link", { name: "Purchase order 00000002" }).getAttribute("href")).toBe("/admin/test/purchase-orders/00000002");
    expect(table.getByText("Goods receipt 00000004")).toBeTruthy();
    expect(table.getByRole("link", { name: "Shipment 00000003" }).getAttribute("href")).toBe("/admin/test/shipments/00000003");
    expect(table.getByText("Goods issue 00000005")).toBeTruthy();
  });
  it("pages the ledger, keeping the pair in the links, and shows the last page for one past the end", async () => {
    mocks.get.mockImplementation(async ({ page }: { page: number }) => ({ ...view, page, movementCount: 250, movements: [movement] }));
    render(await resolveServerComponents(page({ ...pair, page: "9" })));
    expect(mocks.get).toHaveBeenNthCalledWith(1, { ...pair, page: 9 });
    expect(mocks.get).toHaveBeenNthCalledWith(2, { ...pair, page: 3 });
    const pages = within(screen.getByRole("navigation", { name: en.stock.pagination }));
    expect(pages.getByText("Page 3 of 3")).toBeTruthy();
    expect(pages.getByRole("link", { name: "Previous" }).getAttribute("href")).toBe("/admin/test/stock?material=00000001&location=00000001&page=2");
    expect(pages.queryByRole("link", { name: "Next" })).toBeNull();
  });
  it("shows what is in transit from and to the location apart from its physical balance, and names transfer movements (UX-017, TRF-024)", async () => {
    mocks.get.mockResolvedValue({
      ...view, quantity: "40.000000", inTransitFrom: "60.000000", inTransitTo: "12.500000", transitTransfers: ["00000003", "00000007"],
      movements: [
        { ...movement, id: "m4", postingId: "d1", type: "transfer-dispatch", quantity: "-60.000000", source: { id: "00000003", document: { type: "transfer", id: "00000003" } } },
        { ...movement, id: "m5", postingId: "r1", type: "transfer-receipt", source: { id: "00000007", document: { type: "transfer", id: "00000007" } } },
      ],
    });
    render(await resolveServerComponents(page()));
    expect(document.querySelector("[data-stock-balance]")!.textContent).toBe("40 each");
    expect(document.querySelector("[data-stock-transit-from]")!.textContent).toBe("60 each");
    expect(document.querySelector("[data-stock-transit-to]")!.textContent).toBe("12.5 each");
    expect(screen.getByText(en.stock.inTransitFrom)).toBeTruthy();
    expect(screen.getByRole("link", { name: en.stock.transfers }).getAttribute("href")).toBe("/admin/test/transfers");
    // Each transfer holding the transit is one click away.
    expect(screen.getByRole("link", { name: "00000007" }).getAttribute("href")).toBe("/admin/test/transfers/00000007");
    expect(screen.getByRole("link", { name: "00000003" })).toBeTruthy();
    const table = within(screen.getByRole("table", { name: en.stock.ledger }));
    expect(table.getByText("Transfer dispatch")).toBeTruthy();
    expect(table.getByText("Transfer receipt")).toBeTruthy();
    expect(table.getByRole("link", { name: "Transfer 00000003" }).getAttribute("href")).toBe("/admin/test/transfers/00000003");
  });
  it.each(["tenant", "material", "location"])("keeps history but hides posting for read-only/inactive %s", async (kind) => {
    mocks.tenantScope.mockResolvedValue(scope(kind === "tenant"));
    mocks.get.mockResolvedValue({ ...view, materialActive: kind !== "material", locationActive: kind !== "location", movements: [movement] });
    mocks.materials.mockResolvedValue([{ ...material, active: false }]); mocks.locations.mockResolvedValue([{ ...location, active: false }]);
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });
    render(await resolveServerComponents(page()));
    expect(screen.queryByRole("button", { name: pl.stock.form.open })).toBeNull();
    expect(screen.getByText(pl.stock.unavailable)).toBeTruthy(); expect(screen.getByText("Demo seed · Instalacja")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Zapas — Test" })).toBeTruthy(); expect(screen.getAllByText(/Nieaktywny/)).toHaveLength(2);
  });
  it.each(["material", "location"])("explains missing %s masters", async (kind) => {
    if (kind === "material") mocks.materials.mockResolvedValue([]); else mocks.locations.mockResolvedValue([]);
    render(await resolveServerComponents(page())); expect(screen.getByText(en.stock.noMasters)).toBeTruthy(); expect(mocks.get).not.toHaveBeenCalled();
  });
  it("renders not found for invalid query references, missing masters or tenant", async () => {
    await expect(resolveServerComponents(page({ material: ["00000001", "00000002"] }))).rejects.toThrow("404");
    await expect(resolveServerComponents(page({ page: "0" }))).rejects.toThrow("404");
    mocks.get.mockRejectedValueOnce(new AppError("MATERIAL_NOT_FOUND", "missing"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
    mocks.tenantScope.mockRejectedValue(new AppError("TENANT_NOT_FOUND", "missing"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
  });
});
