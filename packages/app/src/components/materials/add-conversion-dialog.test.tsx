import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { AddConversionDialog } from "./add-conversion-dialog";
import { unitChoices } from "../units/unit-choices";
import { materialsLabels } from "./labels";

const mocks = vi.hoisted(() => ({ addConversion: vi.fn() }));
vi.mock("../../app/admin/[tenant]/materials/actions", () => ({ addConversion: mocks.addConversion }));

const context = { tenant: "prod", generation: 1 };
const bolt = { id: "00000002", type: "raw" as const, description: "Bolt", baseUnit: "each", active: true, createdAt: new Date(), version: 1 };
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });


/** A field's tooltip as a screen reader gets it: its info button's description (UX-014, #290). */
const tip = (name: string) => {
  const button = screen.getByRole("button", { name });
  return document.getElementById(button.getAttribute("aria-describedby")!)!.textContent;
};
describe("AddConversionDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("adds 1 case = 12 each to the material, the alternate quantity starting at 1 (MAT-019)", async () => {
    mocks.addConversion.mockResolvedValue({ ok: true, data: {} });
    render(<AddConversionDialog material={bolt} converted={["box"]} units={unitChoices("en", en.units)} context={context} labels={materialsLabels(en)} />);

    fireEvent.click(screen.getByRole("button", { name: "Add conversion" }));
    expect(screen.getByText("Alternate quantity × unit = base quantity × each.")).toBeTruthy();
    expect(screen.getByText("How many each that many alternate units are. Up to six decimals.")).toBeTruthy();
    expect((screen.getByLabelText("Alternate quantity") as HTMLInputElement).value).toBe("1");
    // The base unit and the units already converted stay listed, unselectable, saying why (#217).
    const unit = screen.getByLabelText("Unit") as HTMLSelectElement;
    const disabled = [...unit.options].filter((option) => option.disabled).map((option) => option.textContent);
    expect(disabled).toEqual(["Choose a unit", "each (base unit)", "box (already converted)"]);
    expect(screen.getByText("The unit people enter, such as case or t.")).toBeTruthy();
    // Both quantity fields explain the factor in the material's base unit (UX-014, R03, D08, #290).
    expect(tip("About Alternate quantity")).toBe(
      "A conversion reads “Alternate quantity alternate units = Base quantity base units”, for example 1 bag = 25 each. Enter the exact factor, greater than 0. Changing it later never revalues earlier postings. SU is a reporting unit only.",
    );
    expect(tip("About Base quantity")).toBe(
      "How many each the alternate quantity is, up to six decimals: “Alternate quantity alternate units = Base quantity each”. The factor must be exact and greater than 0. Changing it later never revalues earlier postings. SU is a reporting unit only.",
    );
    change("Unit", "case");
    change("Base quantity", "12");
    fireEvent.click(screen.getAllByRole("button", { name: "Add conversion" }).at(-1)!);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.addConversion).toHaveBeenCalledWith("prod", 1, "00000002", { unit: "case", denominator: "1", numerator: "12" });
  });

  it("offers SU in its own Statistical group, and says how its factor is entered once it is chosen (#239)", async () => {
    mocks.addConversion.mockResolvedValue({ ok: true, data: {} });
    render(<AddConversionDialog material={bolt} converted={[]} units={unitChoices("en", en.units)} context={context} labels={materialsLabels(en)} />);

    fireEvent.click(screen.getByRole("button", { name: "Add conversion" }));
    const unit = screen.getByLabelText("Unit") as HTMLSelectElement;
    expect(unit.querySelector('optgroup[label="Statistical"]')!.textContent).toBe("SU — statistical unit");
    const hint = "For SU, enter Alternate quantity 1.5 and Base quantity 1 when 1 each = 1.5 SU.";
    expect(screen.queryByText(hint, { exact: false })).toBeNull();
    change("Unit", "SU");
    expect(screen.getByText(`How many each that many alternate units are. Up to six decimals. ${hint}`)).toBeTruthy();
    expect(screen.getByText("For reports only: SU adds up different products, and nothing is entered in it.")).toBeTruthy();
    expect(screen.queryByText("The unit people enter, such as case or t.")).toBeNull();
    change("Alternate quantity", "1.5");
    change("Base quantity", "1");
    fireEvent.click(screen.getAllByRole("button", { name: "Add conversion" }).at(-1)!);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.addConversion).toHaveBeenCalledWith("prod", 1, "00000002", { unit: "SU", denominator: "1.5", numerator: "1" });
  });

  it("refuses a zero alternate quantity before sending (MAT-022), and closes on cancel", () => {
    render(<AddConversionDialog material={bolt} converted={["box"]} units={unitChoices("en", en.units)} context={context} labels={materialsLabels(en)} />);

    fireEvent.click(screen.getByRole("button", { name: "Add conversion" }));
    change("Unit", "case");
    change("Alternate quantity", "0");
    change("Base quantity", "12");
    fireEvent.click(screen.getAllByRole("button", { name: "Add conversion" }).at(-1)!);

    expect(screen.getByText(/^Enter a number greater than 0/)).toBeTruthy();
    expect(mocks.addConversion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
