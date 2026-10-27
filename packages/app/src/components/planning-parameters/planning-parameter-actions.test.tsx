import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { planningParametersLabels } from "./labels";
import { PlanningParameterActions } from "./planning-parameter-actions";

const mocks = vi.hoisted(() => ({ changePlanningParameters: vi.fn(), removePlanningParameters: vi.fn() }));
vi.mock("../../app/admin/[tenant]/planning-parameters/actions", () => mocks);

beforeAll(() => {
  // Radix positions menus with ResizeObserver, which jsdom doesn't have.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const context = { tenant: "test", generation: 2 };
const labels = planningParametersLabels(en);
const row = {
  material: "00000004",
  location: "00000001",
  procurement: "make",
  leadTimeDays: 2,
  minimumQuantity: "50.000000",
  lotMultiple: "10.500000",
  version: 3,
  materialDescription: "Painted side panel",
  materialActive: true,
  baseUnit: "each",
  locationName: "Main plant",
  locationActive: true,
} as const;

function open(item: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: "Actions for 00000004 at 00000001" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
}

/** A field's tooltip as a screen reader gets it: its info button's description (UX-014, #290). */
const tip = (name: string) => {
  const button = screen.getByRole("button", { name });
  return document.getElementById(button.getAttribute("aria-describedby")!)!.textContent;
};
describe("PlanningParameterActions", () => {
  afterEach(() => vi.clearAllMocks());

  it("changes the values from a form prefilled with the shown ones, at the loaded version", async () => {
    mocks.changePlanningParameters.mockResolvedValue({ ok: true, data: {} });
    render(<PlanningParameterActions row={row} context={context} labels={labels} />);

    open("Change");
    expect(screen.getByRole("dialog", { name: "Change parameters of 00000004 at 00000001" }).textContent).toContain("Quantities are in each.");
    expect((screen.getByLabelText("Make / Buy") as HTMLSelectElement).value).toBe("make");
    expect((screen.getByLabelText("Lead time (days)") as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("Minimum lot") as HTMLInputElement).value).toBe("50");
    expect((screen.getByLabelText("Lot multiple") as HTMLInputElement).value).toBe("10.5");
    expect(tip("About Minimum lot")).toContain("In each, the material's base unit, to six decimals.");
    expect(tip("About Lot multiple")).toContain("0.000001 means no rounding.");
    fireEvent.change(screen.getByLabelText("Lead time (days)"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.changePlanningParameters).toHaveBeenCalledWith("test", 2, "00000004", "00000001", 3, {
      procurement: "make",
      leadTimeDays: "3",
      minimumQuantity: "50",
      lotMultiple: "10.5",
    });
  });

  it("removes after a destructive confirmation that says what MRP will report", async () => {
    mocks.removePlanningParameters.mockResolvedValue({ ok: true, data: {} });
    render(<PlanningParameterActions row={row} context={context} labels={labels} />);

    open("Remove");
    const dialog = screen.getByRole("alertdialog", { name: "Remove the parameters of 00000004 at 00000001?" });
    expect(dialog.textContent).toContain("missing planning parameters");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove" })));

    expect(mocks.removePlanningParameters).toHaveBeenCalledWith("test", 2, "00000004", "00000001", 3);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("closes the change form on Cancel without writing", async () => {
    render(<PlanningParameterActions row={row} context={context} labels={labels} />);

    open("Change");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.changePlanningParameters).not.toHaveBeenCalled();
  });
});
