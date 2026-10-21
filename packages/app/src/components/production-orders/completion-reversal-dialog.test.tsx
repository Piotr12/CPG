import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { completionMaterials, completionView, wasteView } from "../../../../../tests/setup/production-orders";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { CompletionHistory } from "./completion-history";
import { productionLabels } from "./labels";

const mocks = vi.hoisted(() => ({ reverseProductionCompletion: vi.fn() }));
vi.mock("../../app/admin/[tenant]/production-orders/actions", () => mocks);
const path = "/admin/test/production-orders/00000001";
const reversible = { context: { tenant: "test", generation: 3 }, order: { id: "00000001", output: "00000006", location: "00000001 Main plant", produced: "40.000000" } };
const history = (messages = en, completions = [completionView, wasteView]) =>
  <CompletionHistory completions={completions} page={2} materials={completionMaterials} labels={productionLabels(messages)} path={path} reversible={reversible} />;
const t = en.productionOrders.completion.reversal;
const openFirst = () => fireEvent.click(screen.getAllByRole("button", { name: t.open })[0]);
const reason = (value = "Entered twice") => fireEvent.change(screen.getByLabelText(t.reason), { target: { value } });
const submit = () => act(async () => fireEvent.click(screen.getByRole("button", { name: t.submit })));
afterEach(() => vi.clearAllMocks());

it("confirms every inverse leg, the order effect and today's date, then reverses with only a reason", async () => {
  mocks.reverseProductionCompletion.mockResolvedValue({ ok: true, data: {} });
  render(history()); openFirst();
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByRole("heading", { name: "Reverse completion 00000002?" })).toBeTruthy();
  expect(dialog.getByText("2026-10-21 · 40 each produced")).toBeTruthy();
  expect(dialog.getByText(`${new Date().toISOString().slice(0, 10)} (UTC)`)).toBeTruthy();
  expect(dialog.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["00000006 Cocoa-40 each", "00000006 Cocoa+18 kg", "00000007 Wrapper+80 each", "00000008 Milk+2 kg"]);
  expect(dialog.getByText("Produced 40 each drops by 40 each. A Completed order below its target becomes Open again; a Closed Early order stays closed.")).toBeTruthy();
  expect(dialog.getAllByRole("textbox")).toHaveLength(1);
  reason(); await submit();
  expect(mocks.reverseProductionCompletion).toHaveBeenCalledWith("test", 3, "00000001", "00000002", { reason: "Entered twice" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("lists only the inputs a waste completion used back, never an output", () => {
  render(history(en, [{ ...completionView, lines: [{ ...completionView.lines[0], actual: "0.000000" }, completionView.lines[1]] }, wasteView]));
  fireEvent.click(screen.getAllByRole("button", { name: t.open })[1]);
  expect(within(screen.getByRole("dialog")).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["00000006 Cocoa+10 kg"]);
  fireEvent.click(screen.getByRole("button", { name: t.cancel }));
  fireEvent.click(screen.getAllByRole("button", { name: t.open })[0]);
  expect(within(screen.getByRole("dialog")).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["00000006 Cocoa-40 each", "00000007 Wrapper+80 each"]);
});

it("offers the existing reversal on a stale duplicate and keeps the reason and explanation on other refusals", async () => {
  mocks.reverseProductionCompletion.mockResolvedValue({ ok: false, error: { code: "PRODUCTION_COMPLETION_ALREADY_REVERSED", message: "Already" } });
  render(history()); openFirst(); reason(); await submit();
  expect(screen.getByRole("alert").textContent).toBe(en.productionOrders.errors.PRODUCTION_COMPLETION_ALREADY_REVERSED);
  expect(screen.getByRole("link", { name: t.showExisting }).getAttribute("href")).toBe(`${path}?completions=2`);
  mocks.reverseProductionCompletion.mockResolvedValue({ ok: false, error: { code: "INSUFFICIENT_STOCK", message: "Short", params: { material: "00000006", location: "00000001", available: "9", requested: "10", unit: "each" } } });
  await submit();
  expect(screen.getByRole("alert").textContent).toContain("available 9 each");
  expect(screen.queryByRole("link", { name: t.showExisting })).toBeNull();
  expect(screen.getByLabelText(t.reason)).toHaveProperty("value", "Entered twice");
});

it("translates the reason refusal in Polish and passes other field messages through", async () => {
  render(history(pl)); fireEvent.click(screen.getAllByRole("button", { name: pl.productionOrders.completion.reversal.open })[0]);
  fireEvent.click(screen.getByRole("button", { name: pl.productionOrders.completion.reversal.submit }));
  expect(screen.getByText(pl.productionOrders.completion.reversal.reasonError)).toBeTruthy();
  expect(mocks.reverseProductionCompletion).not.toHaveBeenCalled();
  mocks.reverseProductionCompletion.mockResolvedValue({ ok: false, error: { code: "VALIDATION_FAILED", message: "Invalid", fieldErrors: { reason: ["Server says no"] } } });
  fireEvent.change(screen.getByLabelText(pl.productionOrders.completion.reversal.reason), { target: { value: "Dwa razy" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: pl.productionOrders.completion.reversal.submit })));
  expect(screen.getByText("Server says no")).toBeTruthy();
});

it("marks a reversed completion with who, when and why, and offers no second reversal", () => {
  const reversal = { id: "posting", businessDate: "2026-10-22", occurredAt: new Date(), reason: "Wrong order", actorUsername: "bob", channel: "api" as const };
  render(history(en, [{ ...completionView, reversal }, wasteView]));
  const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
  expect(within(rows[0]).getByText(t.reversed)).toBeTruthy();
  expect(within(rows[0]).getByText("2026-10-22 by bob: Wrong order")).toBeTruthy();
  expect(within(rows[0]).queryByRole("button")).toBeNull();
  expect(within(rows[1]).getByRole("button", { name: t.open })).toBeTruthy();
});
