import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { forecastsLabels } from "./labels";
import { ForecastActions } from "./forecast-actions";

const mocks = vi.hoisted(() => ({ changeForecast: vi.fn(), removeForecast: vi.fn() }));
vi.mock("../../app/admin/[tenant]/forecasts/actions", () => mocks);

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const context = { tenant: "prod", generation: 1 };
const labels = forecastsLabels(en);
const KEY = { material: "00000005", location: "00000001", date: "2027-01-01" };
const row = {
  ...KEY,
  quantity: "20.000000",
  version: 2,
  materialDescription: "Cabinet, red",
  materialActive: true,
  baseUnit: "each",
  locationName: "Main plant",
  locationActive: true,
} as const;

function open(item: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: "Actions for 00000005 at 00000001 on 2027-01-01" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
}

describe("ForecastActions", () => {
  afterEach(() => vi.clearAllMocks());

  it("changes the quantity from a form prefilled with the shown one and the base unit, at the loaded version", async () => {
    mocks.changeForecast.mockResolvedValue({ ok: true, data: {} });
    render(<ForecastActions row={row} context={context} labels={labels} />);

    open("Change forecast");
    expect(screen.getByRole("dialog", { name: "Change the forecast of 00000005 at 00000001 on 2027-01-01" }).textContent).toContain(
      "Stored in each.",
    );
    expect((screen.getByLabelText("Quantity") as HTMLInputElement).value).toBe("20");
    expect((screen.getByLabelText("Unit") as HTMLInputElement).value).toBe("each");
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "case" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.changeForecast).toHaveBeenCalledWith("prod", 1, KEY, 2, { quantity: "2", unit: "case" });
  });

  it("removes after a confirmation that says the audit keeps the quantity", async () => {
    mocks.removeForecast.mockResolvedValue({ ok: true, data: KEY });
    render(<ForecastActions row={row} context={context} labels={labels} />);

    open("Remove");
    expect(screen.getByRole("alertdialog").textContent).toContain("stays in the audit with the quantity it held");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove" })));

    expect(mocks.removeForecast).toHaveBeenCalledWith("prod", 1, KEY, 2);
  });

  it("closes the change form on Cancel without writing", async () => {
    render(<ForecastActions row={row} context={context} labels={labels} />);
    open("Change forecast");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.changeForecast).not.toHaveBeenCalled();
  });
});
