import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { AddSafetyStockTargetDialog } from "./add-safety-stock-target-dialog";
import { safetyStockLabels } from "./labels";

const mocks = vi.hoisted(() => ({ addSafetyStockTarget: vi.fn() }));
vi.mock("../../app/admin/[tenant]/safety-stock/actions", () => mocks);

const labels = safetyStockLabels(en);
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
/** Chooses `code` in a picker (the material's by default): types it, then clicks its row. */
const choose = (code: string, label = "Material") => {
  fireEvent.change(screen.getByRole("combobox", { name: label }), { target: { value: code } });
  fireEvent.mouseDown(within(screen.getByRole("listbox", { name: label })).getByRole("option", { name: new RegExp(`^${code}`) }));
};
const dialog = () => (
  <AddSafetyStockTargetDialog
    context={{ tenant: "test", generation: 2 }}
    labels={labels}
    materials={[{ value: "00000005", code: "00000005", name: "Cabinet, red", detail: "each" }]}
    locations={[
      { value: "00000001", code: "00000001", name: "Main plant" },
      { value: "00000002", code: "00000002", name: "North warehouse" },
    ]}
    locale="en"
  />
);

/** A field's tooltip as a screen reader gets it: its info button's description (UX-014, #290). */
const tip = (name: string) => {
  const button = screen.getByRole("button", { name });
  return document.getElementById(button.getAttribute("aria-describedby")!)!.textContent;
};
describe("AddSafetyStockTargetDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("adds a target from a picked date in the bound tenant and generation (DEM-015)", async () => {
    mocks.addSafetyStockTarget.mockResolvedValue({ ok: true, data: {} });
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Add target" }));
    expect(tip("About Target")).toBe(en.safetyStock.form.quantityTipAny);
    choose("00000005");
    // Once the material is chosen, the target's tooltip names its base unit (UX-014, #290).
    expect(tip("About Target")).toBe(
      "In each, the material's base unit, to six decimals. The target applies from its date until the next target. 0 ends the buffer from this date.",
    );
    choose("00000002", "Location");
    expect((screen.getByRole("combobox", { name: "Material" }) as HTMLInputElement).value).toBe("00000005 — Cabinet, red");
    expect((screen.getByRole("combobox", { name: "Location" }) as HTMLInputElement).value).toBe("00000002 — North warehouse");
    expect((screen.getByLabelText("Effective from") as HTMLInputElement).type).toBe("date");
    fill("Effective from", "2027-01-01");
    fill("Target", "20");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.addSafetyStockTarget).toHaveBeenCalledWith("test", 2, {
      material: "00000005",
      location: "00000002",
      effectiveFrom: "2027-01-01",
      quantity: "20",
    });
  });

  it("shows a second target on the same date as refused, in the screen's words (DEM-017)", async () => {
    mocks.addSafetyStockTarget.mockResolvedValue({ ok: false, error: { code: "SAFETY_STOCK_TARGET_EXISTS", message: "x" } });
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Add target" }));
    choose("00000005");
    choose("00000001", "Location");
    fill("Effective from", "2027-01-01");
    fill("Target", "20");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));

    expect(screen.getByText("This material already has a target at that location on that date.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("picks the location in an autocomplete whose list is named after its label, refusing typed text that is no location (#222)", async () => {
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Add target" }));
    const location = screen.getByRole("combobox", { name: "Location" });
    expect(location.getAttribute("placeholder")).toBe(en.lists.locationPicker.placeholder);
    choose("00000005");
    fireEvent.change(location, { target: { value: "quarry" } });
    expect(screen.getByRole("listbox", { name: "Location" }).textContent).toContain("No location matches “quarry”.");
    fireEvent.blur(location);
    expect(screen.getByText(en.lists.locationPicker.refused)).toBeTruthy();
    fill("Effective from", "2027-01-01");
    fill("Target", "20");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));

    expect(mocks.addSafetyStockTarget).not.toHaveBeenCalled();
    expect(screen.getByText(en.safetyStock.fieldErrors.location)).toBeTruthy();
  });
});
