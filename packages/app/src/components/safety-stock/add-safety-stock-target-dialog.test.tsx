import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { AddSafetyStockTargetDialog } from "./add-safety-stock-target-dialog";
import { safetyStockLabels } from "./labels";

const mocks = vi.hoisted(() => ({ addSafetyStockTarget: vi.fn() }));
vi.mock("../../app/admin/[tenant]/safety-stock/actions", () => mocks);

const labels = safetyStockLabels(en);
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
/** Chooses `code` in the material picker: types it, then clicks its row. */
const choose = (code: string) => {
  fireEvent.change(screen.getByRole("combobox", { name: "Material" }), { target: { value: code } });
  fireEvent.mouseDown(within(screen.getByRole("listbox")).getByRole("option", { name: new RegExp(`^${code}`) }));
};
const dialog = () => (
  <AddSafetyStockTargetDialog
    context={{ tenant: "test", generation: 2 }}
    labels={labels}
    materials={[{ value: "00000005", code: "00000005", name: "Cabinet, red", detail: "each" }]}
    locations={[{ value: "00000001", label: "00000001 — Main plant" }]}
    locale="en"
  />
);

describe("AddSafetyStockTargetDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("adds a target from a picked date in the bound tenant and generation (DEM-015)", async () => {
    mocks.addSafetyStockTarget.mockResolvedValue({ ok: true, data: {} });
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Add target" }));
    choose("00000005");
    fill("Location", "00000001");
    expect((screen.getByRole("combobox", { name: "Material" }) as HTMLInputElement).value).toBe("00000005 — Cabinet, red");
    expect((screen.getByLabelText("Effective from") as HTMLInputElement).type).toBe("date");
    fill("Effective from", "2027-01-01");
    fill("Target", "20");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.addSafetyStockTarget).toHaveBeenCalledWith("test", 2, {
      material: "00000005",
      location: "00000001",
      effectiveFrom: "2027-01-01",
      quantity: "20",
    });
  });

  it("shows a second target on the same date as refused, in the screen's words (DEM-017)", async () => {
    mocks.addSafetyStockTarget.mockResolvedValue({ ok: false, error: { code: "SAFETY_STOCK_TARGET_EXISTS", message: "x" } });
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Add target" }));
    choose("00000005");
    fill("Location", "00000001");
    fill("Effective from", "2027-01-01");
    fill("Target", "20");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));

    expect(screen.getByText("This material already has a target at that location on that date.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
