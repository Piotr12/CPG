import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, type StatisticalFactorView } from "@cpg/core";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import StatisticalUnitsPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), requireUser: vi.fn(), tenantScope: vi.fn(), getMessages: vi.fn(), statisticalFactors: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope }));
vi.mock("../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));

const tenant = { code: "test", name: "Test", generation: 1, readOnly: true };
const cabinet: StatisticalFactorView = {
  id: "00000021", description: "Workshop cabinet, 4 shelves", active: true, baseUnit: "each", perBaseUnit: "1.5",
  otherUnits: [{ unit: "pallet", statisticalUnits: "15" }],
};
const letterbox: StatisticalFactorView = { id: "00000023", description: "Letterbox, galvanised", active: false, baseUnit: "each", perBaseUnit: null, otherUnits: [] };
const page = () => StatisticalUnitsPage({ params: Promise.resolve({ tenant: "test" }), searchParams: Promise.resolve({}) });
const rows = () => within(screen.getByRole("table", { name: en.statisticalUnits.label })).getAllByRole("row").slice(1);
const cells = (row: HTMLElement) => within(row).getAllByRole("cell").map((cell) => cell.textContent);

beforeEach(() => {
  mocks.requireUser.mockResolvedValue({ role: "user" });
  mocks.tenantScope.mockResolvedValue({ cradle: { tenant, materialService: { statisticalFactors: mocks.statisticalFactors } } });
  mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  mocks.statisticalFactors.mockResolvedValue([cabinet, letterbox]);
});
afterEach(() => vi.clearAllMocks());

describe("StatisticalUnitsPage", () => {
  it("shows a normal user of a read-only tenant every finished product's SU factor, a missing one as Not set (#239)", async () => {
    render(await resolveServerComponents(page()));

    expect(metadata.title).toBe("Statistical units");
    expect(mocks.connection).toHaveBeenCalled();
    expect(mocks.requireUser).toHaveBeenCalled();
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(screen.getByRole("heading", { name: "Statistical units — Test" })).toBeTruthy();
    expect(screen.getByText(en.statisticalUnits.intro)).toBeTruthy();
    expect(document.querySelector("[data-factor-count]")!.textContent).toBe("Finished products with an SU factor: 1 of 2.");
    expect(cells(rows()[0])).toEqual(["00000021 — Workshop cabinet, 4 shelves", "1 each = 1.5 SU", "1 pallet = 15 SU", "Change"]);
    expect(cells(rows()[1])).toEqual(["00000023 — Letterbox, galvanised (Inactive)", "Not set", "", "Change"]);
    expect(rows()[1].querySelector("[data-factor-missing] svg")).toBeTruthy();
    expect(within(rows()[1]).getByRole("link", { name: "Change the SU factor of 00000023 Letterbox, galvanised" }).getAttribute("href")).toBe(
      "/admin/test/materials/00000023",
    );
  });

  it("speaks Polish, and says when there are no finished products", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });
    mocks.statisticalFactors.mockResolvedValue([]);
    render(await resolveServerComponents(page()));

    expect(screen.getByRole("heading", { name: "Jednostki statystyczne — Test" }).closest("[lang]")!.getAttribute("lang")).toBe("pl");
    expect(document.querySelector("[data-factor-count]")!.textContent).toBe("Wyroby gotowe ze współczynnikiem SU: 0 z 0.");
    expect(screen.getByText("W środowisku Test nie ma jeszcze wyrobów gotowych.")).toBeTruthy();
  });

  it("renders not found for a missing tenant", async () => {
    mocks.tenantScope.mockRejectedValue(new AppError("TENANT_NOT_FOUND", "missing"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
  });
});
