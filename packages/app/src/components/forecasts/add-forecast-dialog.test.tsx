import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { AddForecastDialog } from "./add-forecast-dialog";
import { forecastsLabels } from "./labels";

const mocks = vi.hoisted(() => ({ addForecast: vi.fn() }));
vi.mock("../../app/admin/[tenant]/forecasts/actions", () => mocks);

const labels = forecastsLabels(en);
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const dialog = () => (
  <AddForecastDialog
    context={{ tenant: "test", generation: 2 }}
    labels={labels}
    materials={[{ value: "00000005", label: "00000005 — Cabinet, red (each)" }]}
    locations={[{ value: "00000001", label: "00000001 — Main plant" }]}
  />
);

describe("AddForecastDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("adds a forecast for a picked day in the bound tenant and generation, with no customer field", async () => {
    mocks.addForecast.mockResolvedValue({ ok: true, data: {} });
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Add forecast" }));
    fill("Material", "00000005");
    fill("Location", "00000001");
    expect((screen.getByLabelText("Day") as HTMLInputElement).type).toBe("date");
    expect(screen.queryByLabelText(/customer/i)).toBeNull();
    fill("Day", "2027-01-01");
    fill("Quantity", "2");
    fill("Unit", "case");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.addForecast).toHaveBeenCalledWith("test", 2, {
      material: "00000005",
      location: "00000001",
      date: "2027-01-01",
      quantity: "2",
      unit: "case",
    });
  });

  it("shows a second forecast on the same day as refused, in the screen's words", async () => {
    mocks.addForecast.mockResolvedValue({ ok: false, error: { code: "FORECAST_EXISTS", message: "x" } });
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Add forecast" }));
    fill("Material", "00000005");
    fill("Location", "00000001");
    fill("Day", "2027-01-01");
    fill("Quantity", "20");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));

    expect(screen.getByText("This material already has a forecast at that location on that day.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
