import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { ForecastsScreen } from "./forecasts-screen";

vi.mock("../../app/admin/[tenant]/forecasts/actions", () => ({ addForecast: vi.fn(), changeForecast: vi.fn(), removeForecast: vi.fn() }));

const material = { id: "00000005", type: "finished", description: "Cabinet", baseUnit: "each", active: true, createdAt: new Date(), version: 1 } as const;
const location = { id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 };
const props = { tenant: { code: "test", name: "Test", generation: 2, readOnly: false }, forecasts: [{ material: material.id, location: location.id, date: "2027-01-04", quantity: "12.000000", version: 1 }],
  materials: [material], locations: [location], filter: {}, page: 1, pages: 1, locale: "en" as const, messages: en, admin: true };
const header = () => screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]") as HTMLElement;

describe("ForecastsScreen", () => {
  it("heads the page with its intro and the admin's Add forecast, and shows each day as a date and a right-aligned quantity", () => {
    render(<ForecastsScreen {...props} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Forecasts — Test");
    expect(within(header()).getByText(en.forecasts.intro)).toBeTruthy();
    expect(within(header()).getByRole("button", { name: en.forecasts.add.open })).toBeTruthy();
    const cells = within(screen.getByRole("table", { name: en.forecasts.link })).getAllByRole("cell");
    expect(cells[2].textContent).toBe("2027-01-04"); expect(cells[2].className).not.toContain("font-mono");
    expect(cells[3].textContent).toBe("12 each"); expect(cells[3].className).toContain("text-right tabular-nums");
  });

  it("gives a normal user no header action", () => {
    render(<ForecastsScreen {...props} admin={false} />);
    expect(within(header()).queryByRole("button")).toBeNull();
  });
});
