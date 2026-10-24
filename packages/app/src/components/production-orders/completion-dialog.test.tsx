import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { completionPreview, completionView, production } from "../../../../../tests/setup/production-orders";
import { en } from "../../i18n/messages/en";
import { CompletionDialog } from "./completion-dialog";
import { productionLabels } from "./labels";

const mocks = vi.hoisted(() => ({ post: vi.fn(), fetch: vi.fn() }));
vi.mock("../../app/admin/[tenant]/production-orders/actions", () => ({ postProductionCompletion: mocks.post }));
const t = productionLabels(en).completion;
const props = {
  context: { tenant: "test", generation: 7 },
  labels: productionLabels(en),
  order: production,
  outputUnits: ["each", "case"],
  locationLabel: "00000001 Warehouse",
  inputs: [{ value: "00000008", label: "00000008 — Milk (kg)", units: ["kg"] }],
  canPost: true,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const open = () => fireEvent.click(screen.getByRole("button", { name: t.post }));
async function toConsumption(quantity = "4", unit = "each") {
  fireEvent.change(screen.getByLabelText(t.output), { target: { value: quantity } });
  fireEvent.change(screen.getByLabelText(t.unit), { target: { value: unit } });
  fireEvent.click(screen.getByRole("button", { name: t.continue }));
  await waitFor(() => expect(screen.getByRole("button", { name: t.submit })).toBeTruthy());
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (...args: unknown[]) => Response.json(await mocks.fetch(...args))));
  mocks.fetch.mockResolvedValue({ ok: true, data: completionPreview });
  mocks.post.mockResolvedValue({ ok: true, data: { completion: completionView, order: production } });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("previews the output, then posts what was used with the order and the dialog's submission token", async () => {
  render(<CompletionDialog {...props} />);
  open();
  expect(screen.getByText(t.description)).toBeTruthy();
  expect([...(screen.getByLabelText(t.unit) as HTMLSelectElement).options].map(({ value }) => value)).toEqual(["each", "case"]);
  await toConsumption("4", "case");
  expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/tenants/test/production-orders/00000001/completions/preview?quantity=4&unit=case"), expect.anything());
  expect(screen.getByText("Output 4 case at 00000001 Warehouse · BOM 00000002 / revision 3 (pinned)")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: t.submit }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Completion 00000002 posted."));
  expect(screen.getByRole("status").getAttribute("data-tone")).toBe("success");
  expect(screen.queryByRole("dialog")).toBeNull();
  const [tenant, generation, order, submission, values] = mocks.post.mock.calls[0];
  expect([tenant, generation, order]).toEqual(["test", 7, "00000001"]);
  expect(submission).toMatch(UUID);
  expect(values).toEqual({ quantity: "4", unit: "case", components: [{ material: "00000006", quantity: "2", unit: "kg" }, { material: "00000007", quantity: "8", unit: "each" }] });
});

it("keeps one submission token while open, so a retry posts once, and a fresh one each time it opens (spec Q7)", async () => {
  mocks.post.mockResolvedValueOnce({ ok: false, error: { code: "NETWORK_ERROR", message: "offline" } });
  render(<CompletionDialog {...props} />);
  open();
  await toConsumption();
  fireEvent.click(screen.getByRole("button", { name: t.submit }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(en.productionOrders.errors.NETWORK_ERROR));
  fireEvent.click(screen.getByRole("button", { name: t.submit }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
  expect(mocks.post.mock.calls[1][3]).toBe(mocks.post.mock.calls[0][3]);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  open();
  expect(screen.queryByRole("status")).toBeNull();
  await toConsumption();
  fireEvent.click(screen.getByRole("button", { name: t.submit }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(3));
  expect(mocks.post.mock.calls[2][3]).not.toBe(mocks.post.mock.calls[0][3]);
});

it("refuses a malformed output before asking, shows a preview refusal, and goes back with the output kept", async () => {
  render(<CompletionDialog {...props} />);
  open();
  fireEvent.change(screen.getByLabelText(t.output), { target: { value: "-1" } });
  fireEvent.click(screen.getByRole("button", { name: t.continue }));
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(screen.getByText(t.fieldErrors.quantity)).toBeTruthy();
  mocks.fetch.mockResolvedValueOnce({ ok: false, error: { code: "PRODUCTION_ORDER_LOCKED", message: "locked" } });
  fireEvent.change(screen.getByLabelText(t.output), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: t.continue }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(en.productionOrders.errors.PRODUCTION_ORDER_LOCKED));
  await toConsumption("6");
  fireEvent.click(screen.getByRole("button", { name: t.back }));
  expect((screen.getByLabelText(t.output) as HTMLInputElement).value).toBe("6");
  fireEvent.click(screen.getByRole("button", { name: t.cancel }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  open();
  await toConsumption();
  fireEvent.click(screen.getByRole("button", { name: t.cancel }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.post).not.toHaveBeenCalled();
});

it("hides the button once the order takes no more completions, keeping the notice of the last post", async () => {
  const { rerender } = render(<CompletionDialog {...props} />);
  open();
  await toConsumption();
  fireEvent.click(screen.getByRole("button", { name: t.submit }));
  await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
  rerender(<CompletionDialog {...props} canPost={false} />);
  expect(screen.queryByRole("button", { name: t.post })).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Completion 00000002 posted.");
});

it("closes from the dialog's own close button without posting", async () => {
  render(<CompletionDialog {...props} />);
  open();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.post).not.toHaveBeenCalled();
});
