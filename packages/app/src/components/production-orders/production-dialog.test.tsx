import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { production, productionOptions, materials, locations } from "../../../../../tests/setup/production-orders";
import { en } from "../../i18n/messages/en";
import { productionLabels } from "./labels";
import { ProductionDialog } from "./production-dialog";
const mocks = vi.hoisted(() => ({ create: vi.fn(), preview: vi.fn(), update: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../../app/admin/[tenant]/production-orders/actions", () => ({ createProductionOrder: mocks.create, updateProductionOrder: mocks.update }));
const props = { context: { tenant: "test", generation: 7 }, labels: productionLabels(en), materials, locations };
const open = (edit = false) => fireEvent.click(screen.getByRole("button", { name: edit ? en.productionOrders.edit : en.productionOrders.create }));
async function preview() {
  fireEvent.change(screen.getByLabelText(en.productionOrders.output), { target: { value: "00000005" } });
  fireEvent.change(screen.getByLabelText(en.productionOrders.location), { target: { value: "00000001" } });
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
  render(<ProductionDialog {...props} />); open(); await preview();
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
  expect((screen.getByLabelText(en.productionOrders.output) as HTMLSelectElement).value).toBe(production.output);
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
  expect(screen.queryByLabelText(en.productionOrders.output)).toBeNull();
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
