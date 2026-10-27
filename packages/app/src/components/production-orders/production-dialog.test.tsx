import { fireEvent, render, screen, waitFor, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { production, productionOptions, materials, locations } from "../../../../../tests/setup/production-orders";
import { fill } from "../../i18n/fill";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { productionLabels } from "./labels";
import { plannedQuantityTip, ProductionDialog } from "./production-dialog";
const mocks = vi.hoisted(() => ({ create: vi.fn(), preview: vi.fn(), update: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../../app/admin/[tenant]/production-orders/actions", () => ({ createProductionOrder: mocks.create, updateProductionOrder: mocks.update }));
const props = { context: { tenant: "test", generation: 7 }, labels: productionLabels(en), materials, locations };
const open = (edit = false) => fireEvent.click(screen.getByRole("button", { name: edit ? en.productionOrders.edit : en.productionOrders.create }));
async function preview() {
  fireEvent.change(screen.getByRole("combobox", { name: en.productionOrders.output }), { target: { value: "cabinet" } });
  fireEvent.mouseDown(screen.getByRole("option", { name: /^00000005/ }));
  fireEvent.change(screen.getByRole("combobox", { name: en.productionOrders.location }), { target: { value: "warehouse" } });
  fireEvent.mouseDown(screen.getByRole("option", { name: /^00000001/ }));
  fireEvent.change(screen.getByLabelText(en.productionOrders.quantity), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText(en.productionOrders.unit), { target: { value: "case" } });
  fireEvent.change(screen.getByLabelText(en.productionOrders.finish), { target: { value: production.plannedFinish } });
  fireEvent.click(screen.getByRole("button", { name: en.productionOrders.preview }));
  await waitFor(() => expect(mocks.preview).toHaveBeenCalled());
}
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (...args: unknown[]) => Response.json(await mocks.preview(...args))));
  mocks.preview.mockResolvedValue({ ok: true, data: productionOptions }); mocks.create.mockResolvedValue({ ok: true, data: production }); mocks.update.mockResolvedValue({ ok: true, data: production });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("preselects the suggested recipe, shows shortages and keeps a manual lower-priority choice on creation", async () => {
  render(<ProductionDialog {...props} />); open();
  expect(screen.queryByText(/captured lead time/)).toBeNull();
  await preview();
  await waitFor(() => expect(screen.getByLabelText(en.productionOrders.recipe)).toBeTruthy());
  expect((screen.getByLabelText(en.productionOrders.recipe) as HTMLSelectElement).value).toBe(production.bom);
  expect(screen.getAllByText("18 kg")).toHaveLength(2);
  expect(mocks.preview).toHaveBeenCalledWith(expect.stringContaining("/api/tenants/test/production-orders/options?output=00000005&location=00000001&quantity=2&unit=case&plannedFinish=2027-01-04"), { credentials: "same-origin", cache: "no-store" });
  fireEvent.change(screen.getByLabelText(en.productionOrders.recipe), { target: { value: "00000003" } });
  fireEvent.click(screen.getByRole("button", { name: en.productionOrders.create }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledWith("test", 7, expect.objectContaining({ bom: "00000003", revision: 1 })));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.push).toHaveBeenCalledWith("/admin/test/production-orders/00000001");
});
it("supports back, preview refusal, invalid input and cancellation without writing", async () => {
  render(<ProductionDialog {...props} />); open();
  fireEvent.click(screen.getByRole("button", { name: en.productionOrders.preview }));
  expect(mocks.preview).not.toHaveBeenCalled();
  mocks.preview.mockResolvedValueOnce({ ok: false, error: { code: "PRODUCTION_NO_USABLE_BOM", message: "none" } });
  await preview(); await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(en.productionOrders.errors.PRODUCTION_NO_USABLE_BOM));
  await preview(); await waitFor(() => expect(screen.getByLabelText(en.productionOrders.recipe)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: en.productionOrders.back }));
  expect(screen.queryByLabelText(en.productionOrders.recipe)).toBeNull();
  expect((screen.getByRole("combobox", { name: en.productionOrders.output }) as HTMLInputElement).value).toBe(`${production.output} — Cabinet`);
  expect((screen.getByLabelText(en.productionOrders.quantity) as HTMLInputElement).value).toBe("2");
  expect((screen.getByLabelText(en.productionOrders.finish) as HTMLInputElement).value).toBe(production.plannedFinish);
  fireEvent.click(screen.getByRole("button", { name: en.productionOrders.cancel }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); expect(mocks.create).not.toHaveBeenCalled();
});
it("keeps a changed-recipe refusal visible and lets the user preview again", async () => {
  mocks.create.mockResolvedValueOnce({ ok: false, error: { code: "PRODUCTION_BOM_CHANGED", message: "changed" } });
  render(<ProductionDialog {...props} />); open(); await preview();
  await waitFor(() => expect(screen.getByLabelText(en.productionOrders.recipe)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: en.productionOrders.create }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(en.productionOrders.errors.PRODUCTION_BOM_CHANGED));
  expect(screen.getByRole("dialog")).toBeTruthy(); expect(mocks.push).not.toHaveBeenCalled();
});
it("holds the opening edit version through a conflict refresh; reopening captures the latest version", async () => {
  mocks.update.mockResolvedValue({ ok: false, error: { code: "VERSION_CONFLICT", message: "stale" } });
  const view = render(<ProductionDialog {...props} order={production} />); open(true);
  expect((screen.getByLabelText(en.productionOrders.unit) as HTMLInputElement).value).toBe("case");
  expect(screen.queryByRole("combobox", { name: en.productionOrders.output })).toBeNull();
  expect(screen.getByLabelText(en.productionOrders.finish).getAttribute("aria-describedby")).toBeTruthy();
  expect(screen.getByText("The planned start is recalculated from the captured lead time of 5 calendar days.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText(en.productionOrders.quantity), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: en.productionOrders.save }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("test", 7, production.id, 1, expect.objectContaining({ quantity: "3" })));
  view.rerender(<ProductionDialog {...props} order={{ ...production, version: 2, enteredQuantity: "4" }} />);
  fireEvent.click(screen.getByRole("button", { name: en.productionOrders.save }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2)); expect(mocks.update.mock.calls[1][3]).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: en.productionOrders.cancel }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); open(true);
  expect((screen.getByLabelText(en.productionOrders.quantity) as HTMLInputElement).value).toBe("4");
  mocks.update.mockResolvedValueOnce({ ok: true, data: { ...production, version: 3 } });
  fireEvent.click(screen.getByRole("button", { name: en.productionOrders.save }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); expect(mocks.update.mock.calls[2][3]).toBe(2);
  cleanup();
});

it("closes through the standard dialog close control without creating an order", async () => {
  render(<ProductionDialog {...props} />); open();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.create).not.toHaveBeenCalled();
});
it("offers only active Make outputs in an autocomplete that refuses free text (#217)", () => {
  render(<ProductionDialog {...props} materials={[...materials, { ...materials[0], id: "00000006", description: "Steel", type: "raw" }]} />); open();
  const output = screen.getByRole("combobox", { name: en.productionOrders.output });
  expect(output.getAttribute("placeholder")).toBe(en.lists.materialPicker.placeholder);
  fireEvent.focus(output);
  expect(within(screen.getByRole("listbox")).getAllByRole("option").map((option) => option.textContent)).toEqual(["00000005—Cabineteach"]);
  fireEvent.change(output, { target: { value: "steel" } }); fireEvent.blur(output);
  expect(screen.getByText(en.lists.materialPicker.refused)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: en.productionOrders.preview }));
  expect(mocks.preview).not.toHaveBeenCalled();
});
it("offers only active locations in an autocomplete named after its label that refuses free text (LFC-019, #222)", () => {
  render(<ProductionDialog {...props} />); open();
  const location = screen.getByRole("combobox", { name: en.productionOrders.location });
  expect(location.getAttribute("placeholder")).toBe(en.lists.locationPicker.placeholder);
  fireEvent.focus(location);
  expect(within(screen.getByRole("listbox", { name: en.productionOrders.location })).getAllByRole("option").map((option) => option.textContent)).toEqual(["00000001—Warehouse"]);
  fireEvent.change(location, { target: { value: "00000002" } });
  expect(screen.getByRole("listbox", { name: en.productionOrders.location }).textContent).toBe("No location matches “00000002”.");
  fireEvent.blur(location);
  expect(screen.getByText(en.lists.locationPicker.refused)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: en.productionOrders.preview }));
  expect(mocks.preview).not.toHaveBeenCalled();
});
it("hints on the free-text unit field that SU can't be entered (#243)", () => {
  render(<ProductionDialog {...props} />); open();
  expect(screen.getByText("Enter the output's base unit (shown beside its name) or one of its physical alternate units (not SU).")).toBeTruthy();
});
/** A field's tooltip, as a screen reader gets it: the info button's description. */
const tip = (field: string) => {
  const button = screen.getByRole("button", { name: `About ${field}` });
  return document.getElementById(button.getAttribute("aria-describedby")!)!.textContent;
};
it("explains Planned quantity beside its label: generally until an output is chosen, then in the output's units (UX-014, #290)", () => {
  render(<ProductionDialog {...props} units={{ "00000005": ["each", "bag", "box", "case", "pallet"] }} />); open();
  expect(tip(en.productionOrders.quantity)).toBe(en.productionOrders.quantityTipAny);

  fireEvent.change(screen.getByRole("combobox", { name: en.productionOrders.output }), { target: { value: "cabinet" } });
  fireEvent.mouseDown(screen.getByRole("option", { name: /^00000005/ }));

  const text = tip(en.productionOrders.quantity);
  expect(text).toContain("greater than 0 in each or in a physical alternate unit this output converts, such as bag, box, case (not SU)");
  expect(text).not.toContain("pallet");
  expect(text).toContain("rounded half up to six decimals, and keeps the unit and factor you entered with the order");
});
it("opens Edit with the cursor in Planned quantity, not on its info button, and the tooltip closed (#290 review)", async () => {
  render(<ProductionDialog {...props} order={production} />); open(true);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(en.productionOrders.quantity)));
  expect(document.querySelector("[data-slot=popover-content]")).toBeNull();
});
it("says the output takes its base unit only when it converts no other physical unit", () => {
  render(<ProductionDialog {...props} units={{ "00000005": ["each"] }} order={production} />); open(true);
  expect(tip(en.productionOrders.quantity)).toBe(fill(en.productionOrders.quantityTipBaseOnly, { baseUnit: "each" }));
});
it("names the edited order's output units, and its base unit alone when the units are not known", () => {
  const view = render(<ProductionDialog {...props} units={{ "00000005": ["each", "case"] }} order={production} />); open(true);
  expect(tip(en.productionOrders.quantity)).toBe(fill(en.productionOrders.quantityTip, { baseUnit: "each", units: "case" }));
  fireEvent.click(screen.getByRole("button", { name: en.productionOrders.cancel }));
  view.unmount();

  render(<ProductionDialog {...props} order={production} />); open(true);
  expect(tip(en.productionOrders.quantity)).toBe(fill(en.productionOrders.quantityTipBaseOnly, { baseUnit: "each" }));
});
it("words the tooltip for an output in kg that converts 1 bag = 25 kg (UX-014)", () => {
  const cement = { ...materials[0], id: "00000010", description: "Cement mix", baseUnit: "kg", type: "finished" as const };
  const text = plannedQuantityTip(productionLabels(en), [cement], { "00000010": ["kg", "bag"] }, "00000010");
  expect(text).toBe(
    "Enter a target greater than 0 in kg or in a physical alternate unit this output converts, such as bag (not SU). CPG converts it once, at the exact factor in force when you save, into kg, rounded half up to six decimals, and keeps the unit and factor you entered with the order. Changing the quantity or unit later converts it again.",
  );
  expect(plannedQuantityTip(productionLabels(pl), [cement], { "00000010": ["kg", "bag"] }, "00000010")).toContain("np. bag (nie SU)");
  expect(plannedQuantityTip(productionLabels(en), [cement], {}, "00000099")).toBe(en.productionOrders.quantityTipAny);
});
