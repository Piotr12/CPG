import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LedgerMovementView, StockView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { StockScreen } from "./stock-screen";

vi.mock("./correction-dialog", () => ({ CorrectionDialog: () => <button>Post correction</button> }));
vi.mock("./reversal-controls", () => ({ ReversalControls: () => null }));

const material = { id: "00000001", type: "raw" as const, description: "Bolts", baseUnit: "each", active: true, createdAt: new Date(), version: 1 };
const location = { id: "00000001", name: "Warehouse", active: true, createdAt: new Date(), version: 1 };
const pair = { material: "00000001", location: "00000001" };
const movement = {
  ...pair, id: "m1", postingId: "p1", position: 0, type: "goods-issue", businessDate: "2027-01-01", occurredAt: new Date(), quantity: "-2.000000", baseUnit: "each",
  enteredQuantity: "2.000000", enteredUnit: "each", numerator: "1", denominator: "1", balanceBefore: "2.000000", balanceAfter: "0.000000", reason: "Shipped",
  actorUserId: null, actorUsername: "admin", channel: "ui" as const, source: { id: null, document: null }, reverses: null, reversedBy: null, canReverse: false,
} as unknown as LedgerMovementView;
const view: StockView = {
  ...pair, quantity: "12.500000", baseUnit: "each", materialDescription: "Bolts", locationName: "Warehouse", materialActive: true, locationActive: true,
  inTransitFrom: "0.000000", inTransitTo: "0.000000", transitTransfers: [], page: 1, movementCount: 1, movements: [movement],
};
const TENANT = { code: "test", name: "Test", generation: 1, readOnly: false };
const renderScreen = (stock: StockView | null, readOnly = false) =>
  render(<StockScreen tenant={{ ...TENANT, readOnly }} view={stock} materials={[material]} locations={[location]} units={["each"]} locale="en" messages={en} />);

describe("StockScreen", () => {
  it("heads the page with the one h1, the report link and the stock import, then the balance in tabular figures", () => {
    renderScreen(view);

    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual(["Stock — Test"]);
    const header = screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]") as HTMLElement;
    expect(within(header).getByRole("link", { name: en.stock.report }).getAttribute("href")).toBe("/admin/test/reports/stock");
    expect(within(header).getByRole("link", { name: en.stockImport.link })).toBeTruthy();
    const balance = document.querySelector("[data-stock-balance]") as HTMLElement;
    expect(balance.textContent).toBe("12.5 each");
    expect(balance.className).toContain("tabular-nums");
    expect(balance.className).not.toContain("font-mono");
  });

  it("lists movements with the date first, signed quantities right-aligned and an absent source as none", () => {
    renderScreen(view);

    const cells = within(screen.getByRole("table", { name: en.stock.ledger })).getAllByRole("cell");
    expect(cells[0].className).toMatch(/\bwhitespace-nowrap\b.*\bsticky left-0\b/);
    expect(cells[2].textContent).toBe("-2 each");
    expect(cells[2].className).toMatch(/\btext-right tabular-nums\b/);
    expect(within(cells[3]).getByText("—").getAttribute("aria-label")).toBe("none");
  });

  it("shows every figure in the reader's locale: balance, transit, signed movement, entered quantity, factor and balance after (#304)", () => {
    const received = {
      ...movement, id: "m2", type: "goods-receipt", quantity: "12345.500000", enteredQuantity: "10288.750000", enteredUnit: "box",
      numerator: "1.2", denominator: "1000.5", balanceAfter: "23456.250000",
    } as LedgerMovementView;
    const issued = { ...movement, quantity: "-15.500000" } as LedgerMovementView;
    const big = { ...view, quantity: "12345.500000", inTransitFrom: "1234.5", inTransitTo: "98765.25", movements: [received, issued] };
    const figures = () => ({
      balance: document.querySelector("[data-stock-balance]")!.textContent,
      from: document.querySelector("[data-stock-transit-from]")!.textContent,
      to: document.querySelector("[data-stock-transit-to]")!.textContent,
      movements: screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[2].textContent),
      details: [...document.querySelectorAll("details p")].slice(1, 3).map((p) => p.textContent),
    });
    const props = { tenant: TENANT, view: big, materials: [material], locations: [location], units: ["each"] };

    const { unmount } = render(<StockScreen {...props} locale="en" messages={en} />);
    expect(figures()).toEqual({
      balance: "12,345.5 each", from: "1,234.5 each", to: "98,765.25 each", movements: ["+12,345.5 each", "-15.5 each"],
      details: [`${en.stock.entered}: 10,288.75 box · ${en.stock.factor}: 1.2/1,000.5`, `${en.stock.after}: 23,456.25 each`],
    });
    unmount();

    render(<StockScreen {...props} locale="pl" messages={pl} />);
    expect(figures()).toEqual({
      balance: "12\u00a0345,5 each", from: "1234,5 each", to: "98\u00a0765,25 each", movements: ["+12\u00a0345,5 each", "-15,5 each"],
      details: [`${pl.stock.entered}: 10\u00a0288,75 box · ${pl.stock.factor}: 1,2/1000,5`, `${pl.stock.after}: 23\u00a0456,25 each`],
    });
  });

  it("offers a read-only tenant no stock import, and says what to create when there are no masters", () => {
    renderScreen(null, true);

    expect(screen.queryByRole("link", { name: en.stockImport.link })).toBeNull();
    expect(screen.getByText(en.stock.noMasters)).toBeTruthy();
  });
});
