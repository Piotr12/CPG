import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fill } from "../../i18n/fill";
import { en } from "../../i18n/messages/en";
import { safetyStockLabels } from "./labels";
import { SafetyStockTargetActions } from "./safety-stock-target-actions";

const mocks = vi.hoisted(() => ({ changeSafetyStockTarget: vi.fn(), removeSafetyStockTarget: vi.fn() }));
vi.mock("../../app/admin/[tenant]/safety-stock/actions", () => mocks);

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const context = { tenant: "prod", generation: 1 };
const labels = safetyStockLabels(en);
const KEY = { material: "00000005", location: "00000001", effectiveFrom: "2027-01-01" };
const row = {
  ...KEY,
  quantity: "20.000000",
  version: 2,
  status: "scheduled",
  materialDescription: "Cabinet, red",
  materialActive: true,
  baseUnit: "each",
  locationName: "Main plant",
  locationActive: true,
} as const;

function open(item: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: "Actions for 00000005 at 00000001 from 2027-01-01" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
}

/** A field's tooltip as a screen reader gets it: its info button's description (UX-014, #290). */
const tip = (name: string) => {
  const button = screen.getByRole("button", { name });
  return document.getElementById(button.getAttribute("aria-describedby")!)!.textContent;
};
describe("SafetyStockTargetActions", () => {
  afterEach(() => vi.clearAllMocks());

  it("changes the quantity from a form prefilled with the shown one, at the loaded version", async () => {
    mocks.changeSafetyStockTarget.mockResolvedValue({ ok: true, data: {} });
    render(<SafetyStockTargetActions row={row} context={context} labels={labels} />);

    open("Change target");
    expect(screen.getByRole("dialog", { name: "Change the target of 00000005 at 00000001 from 2027-01-01" }).textContent).toContain(
      "The quantity is in each.",
    );
    expect((screen.getByLabelText("Target") as HTMLInputElement).value).toBe("20");
    expect(tip("About Target")).toBe(fill(en.safetyStock.form.quantityTip, { baseUnit: "each" }));
    fireEvent.change(screen.getByLabelText("Target"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.changeSafetyStockTarget).toHaveBeenCalledWith("prod", 1, KEY, 2, { quantity: "40" });
  });

  it("removes after a confirmation that says which target applies again", async () => {
    mocks.removeSafetyStockTarget.mockResolvedValue({ ok: true, data: KEY });
    render(<SafetyStockTargetActions row={row} context={context} labels={labels} />);

    open("Remove");
    expect(screen.getByRole("alertdialog").textContent).toContain("the target before it applies again");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove" })));

    expect(mocks.removeSafetyStockTarget).toHaveBeenCalledWith("prod", 1, KEY, 2);
  });

  it("closes the change form on Cancel without writing", async () => {
    render(<SafetyStockTargetActions row={row} context={context} labels={labels} />);
    open("Change target");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.changeSafetyStockTarget).not.toHaveBeenCalled();
  });
});
