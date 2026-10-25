import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { AddForecastDialog } from "./add-forecast-dialog";
import { forecastsLabels } from "./labels";

const mocks = vi.hoisted(() => ({ addForecast: vi.fn() }));
vi.mock("../../app/admin/[tenant]/forecasts/actions", () => mocks);

const labels = forecastsLabels(en);
/** A field by its label: a combobox by role, since its list carries the same name (#222). */
const field = (label: string) => screen.queryByRole("combobox", { name: label }) ?? screen.getByLabelText(label);
const fill = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
/** Types into a picker (material or location) and picks the option that matches. */
const choose = (label: string, typed: string, option: RegExp) => {
  fill(label, typed);
  fireEvent.mouseDown(screen.getByRole("option", { name: option }));
};
const dialog = () => (
  <AddForecastDialog
    context={{ tenant: "test", generation: 2 }}
    labels={labels}
    materials={[
      { value: "00000005", code: "00000005", name: "Cabinet, red", detail: "each" },
      { value: "00000006", code: "00000006", name: "Desk", detail: "each" },
    ]}
    locations={[
      { value: "00000001", code: "00000001", name: "Main plant" },
      { value: "00000002", code: "00000002", name: "North warehouse" },
    ]}
  />
);

describe("AddForecastDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("adds a forecast for a picked day in the bound tenant and generation, with no customer field", async () => {
    mocks.addForecast.mockResolvedValue({ ok: true, data: {} });
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Add forecast" }));
    expect(screen.getByRole("combobox", { name: "Material" }).getAttribute("placeholder")).toBe(en.lists.materialPicker.placeholder);
    choose("Material", "cabinet", /Cabinet, red/);
    expect((screen.getByRole("combobox", { name: "Material" }) as HTMLInputElement).value).toBe("00000005 — Cabinet, red");
    choose("Location", "main", /Main plant/);
    expect((screen.getByRole("combobox", { name: "Location" }) as HTMLInputElement).value).toBe("00000001 — Main plant");
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
    choose("Material", "desk", /Desk/);
    choose("Material", "00000005", /Cabinet, red/);
    choose("Location", "00000002", /North warehouse/);
    fill("Day", "2027-01-01");
    fill("Quantity", "20");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));

    expect(screen.getByText("This material already has a forecast at that location on that day.")).toBeTruthy();
    expect(mocks.addForecast).toHaveBeenCalledWith("test", 2, expect.objectContaining({ material: "00000005", location: "00000002" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("refuses typed text that is no material, never sending it (#217)", async () => {
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Add forecast" }));
    const material = screen.getByRole("combobox", { name: "Material" });
    fill("Material", "chair");
    expect(screen.getByRole("listbox").textContent).toContain("No material matches “chair”.");
    fireEvent.blur(material);
    expect(screen.getByText(en.lists.materialPicker.refused)).toBeTruthy();
    choose("Location", "00000001", /Main plant/);
    fill("Day", "2027-01-01");
    fill("Quantity", "20");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));

    expect(mocks.addForecast).not.toHaveBeenCalled();
    expect(screen.getByText(en.forecasts.fieldErrors.material)).toBeTruthy();
  });

  it("picks the location in an autocomplete whose list is named after its label, refusing typed text that is no location (#222)", async () => {
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Add forecast" }));
    const location = screen.getByRole("combobox", { name: "Location" });
    expect(location.getAttribute("placeholder")).toBe(en.lists.locationPicker.placeholder);
    fireEvent.focus(location);
    expect(within(screen.getByRole("listbox", { name: "Location" })).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "00000001—Main plant",
      "00000002—North warehouse",
    ]);
    choose("Material", "cabinet", /Cabinet, red/);
    fill("Location", "quarry");
    expect(screen.getByRole("listbox", { name: "Location" }).textContent).toContain("No location matches “quarry”.");
    fireEvent.blur(location);
    expect(screen.getByText(en.lists.locationPicker.refused)).toBeTruthy();
    fill("Day", "2027-01-01");
    fill("Quantity", "20");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));

    expect(mocks.addForecast).not.toHaveBeenCalled();
    expect(screen.getByText(en.forecasts.fieldErrors.location)).toBeTruthy();
  });
});
