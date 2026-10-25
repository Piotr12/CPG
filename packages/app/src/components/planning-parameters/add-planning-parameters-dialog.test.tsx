import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { AddPlanningParametersDialog } from "./add-planning-parameters-dialog";
import { planningParametersLabels } from "./labels";

const mocks = vi.hoisted(() => ({ addPlanningParameters: vi.fn() }));
vi.mock("../../app/admin/[tenant]/planning-parameters/actions", () => ({ addPlanningParameters: mocks.addPlanningParameters }));

const labels = planningParametersLabels(en);
const materials = [{ value: "00000001", code: "00000001", name: "Bolt M8", detail: "each" }];
const locations = [
  { value: "00000001", code: "00000001", name: "Main plant" },
  { value: "00000002", code: "00000002", name: "North warehouse" },
];
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
/** Chooses `code` in a picker (the material's by default): types it, then clicks its row. */
const choose = (code: string, label = "Material") => {
  fireEvent.change(screen.getByRole("combobox", { name: label }), { target: { value: code } });
  fireEvent.mouseDown(within(screen.getByRole("listbox", { name: label })).getByRole("option", { name: new RegExp(`^${code}`) }));
};

describe("AddPlanningParametersDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("adds the chosen material and location's values in the bound tenant and generation (MAT-016)", async () => {
    mocks.addPlanningParameters.mockResolvedValue({ ok: true, data: {} });
    render(<AddPlanningParametersDialog context={{ tenant: "prod", generation: 1 }} labels={labels} materials={materials} locations={locations} locale="en" />);

    fireEvent.click(screen.getByRole("button", { name: "Add parameters" }));
    // Six fields with hints are taller than a laptop window: the dialog scrolls instead of hiding its buttons.
    expect(screen.getByRole("dialog", { name: "Add planning parameters" }).className).toContain("overflow-y-auto");
    expect(screen.getByRole("combobox", { name: "Material" }).getAttribute("placeholder")).toBe("Type an ID or a name");
    expect(screen.getByRole("combobox", { name: "Location" }).getAttribute("placeholder")).toBe(en.lists.locationPicker.placeholder);
    choose("00000001");
    choose("00000002", "Location");
    expect((screen.getByRole("combobox", { name: "Location" }) as HTMLInputElement).value).toBe("00000002 — North warehouse");
    fill("Make / Buy", "buy");
    fill("Lead time (days)", "7");
    fill("Minimum lot", "1000");
    fill("Lot multiple", "100");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.addPlanningParameters).toHaveBeenCalledWith("prod", 1, {
      material: "00000001",
      location: "00000002",
      procurement: "buy",
      leadTimeDays: "7",
      minimumQuantity: "1000",
      lotMultiple: "100",
    });
  });

  it("shows the raw-material refusal next to Make/Buy (MAT-014), and closes on Cancel", async () => {
    mocks.addPlanningParameters.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "x", fieldErrors: { procurement: ["A raw material is always bought: choose Buy."] } },
    });
    render(<AddPlanningParametersDialog context={{ tenant: "prod", generation: 1 }} labels={labels} materials={materials} locations={locations} locale="en" />);

    fireEvent.click(screen.getByRole("button", { name: "Add parameters" }));
    choose("00000001");
    choose("00000001", "Location");
    fill("Make / Buy", "make");
    fill("Lead time (days)", "7");
    fill("Minimum lot", "0");
    fill("Lot multiple", "1");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));

    expect(screen.getByText("A raw material is always bought: choose Buy.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("refuses typed text that is no location, never sending it (#222)", async () => {
    render(<AddPlanningParametersDialog context={{ tenant: "prod", generation: 1 }} labels={labels} materials={materials} locations={locations} locale="en" />);

    fireEvent.click(screen.getByRole("button", { name: "Add parameters" }));
    choose("00000001");
    const location = screen.getByRole("combobox", { name: "Location" });
    fireEvent.change(location, { target: { value: "quarry" } });
    expect(screen.getByRole("listbox", { name: "Location" }).textContent).toContain("No location matches “quarry”.");
    fireEvent.blur(location);
    expect(screen.getByText(en.lists.locationPicker.refused)).toBeTruthy();
    fill("Make / Buy", "buy");
    fill("Lead time (days)", "7");
    fill("Minimum lot", "0");
    fill("Lot multiple", "1");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));

    expect(mocks.addPlanningParameters).not.toHaveBeenCalled();
    expect(screen.getByText(en.planningParameters.fieldErrors.location)).toBeTruthy();
  });
});
