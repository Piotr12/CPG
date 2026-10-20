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
const movement = { ...pair, id: "m1", postingId: "p1", position: 0, type: "correction", businessDate: "2027-01-01", occurredAt: new Date(), quantity: "2.000000", baseUnit: "each", enteredQuantity: "2.000000", enteredUnit: "case", numerator: "12", denominator: "1", balanceBefore: "0.000000", balanceAfter: "2.000000", reason: "Opening balance", actorUserId: null, actorUsername: "Demo seed", channel: "seed" as const };
const view: StockView = { ...pair, quantity: "0.000000", baseUnit: "each", materialDescription: "Bolts", locationName: "Warehouse", materialActive: true, locationActive: true, movements: [] };
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
    expect(mocks.tenantScope).toHaveBeenCalledWith("test"); expect(mocks.get).toHaveBeenCalledWith(pair);
    expect(screen.getByRole("heading", { name: "Stock — Test" })).toBeTruthy(); expect(screen.getByText("0 each")).toBeTruthy();
    expect(screen.getByText(en.stock.empty)).toBeTruthy(); expect(screen.getByRole("button", { name: "Post correction" })).toBeTruthy();
    expect(screen.getByLabelText("Material").getAttribute("name")).toBe("material");
  });
  it("reads selected query references, renders signed history and source/actor/factor details", async () => {
    mocks.get.mockResolvedValue({ ...view, quantity: "23.500000", movements: [movement, { ...movement, id: "m2", quantity: "-0.500000", channel: "api", actorUsername: "alice", type: "receipt" }] });
    render(await resolveServerComponents(page(pair)));
    expect(mocks.get).toHaveBeenCalledWith(pair);
    const table = within(screen.getByRole("table", { name: en.stock.ledger }));
    expect(table.getByText("+2 each")).toBeTruthy(); expect(table.getByText("-0.5 each")).toBeTruthy();
    expect(table.getByText("Demo seed · Installation")).toBeTruthy(); expect(table.getByText("alice · API")).toBeTruthy();
    expect(table.getByText(/Source: Correction · p1/)).toBeTruthy(); expect(table.getByText(/Source: receipt · p1/)).toBeTruthy(); expect(table.getAllByText(/Factor: 12\/1/)).toHaveLength(2);
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
    mocks.get.mockRejectedValueOnce(new AppError("MATERIAL_NOT_FOUND", "missing"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
    mocks.tenantScope.mockRejectedValue(new AppError("TENANT_NOT_FOUND", "missing"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
  });
});
