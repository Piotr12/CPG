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
    change("Unit", "case");
    change("Base quantity", "12");
    fireEvent.click(screen.getAllByRole("button", { name: "Add conversion" }).at(-1)!);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.addConversion).toHaveBeenCalledWith("prod", 1, "00000002", { unit: "case", denominator: "1", numerator: "12" });
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
