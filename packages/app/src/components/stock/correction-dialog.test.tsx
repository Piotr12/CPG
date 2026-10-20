import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { CorrectionDialog } from "./correction-dialog";
import { stockLabels } from "./labels";
const mocks = vi.hoisted(() => ({ postStockCorrection: vi.fn() }));
vi.mock("../../app/admin/[tenant]/stock/actions", () => mocks);
const pair = { material: "00000001", location: "00000002" };
const dialog = (messages = en) => <CorrectionDialog context={{ tenant: "test", generation: 3 }} pair={pair} units={["each", "case"]} labels={stockLabels(messages)} />;
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
afterEach(() => vi.clearAllMocks());
describe("stock correction dialog", () => {
  it("posts signed input for the selected pair, with current units and bound generation", async () => {
    mocks.postStockCorrection.mockResolvedValue({ ok: true, data: {} }); render(dialog());
    fireEvent.click(screen.getByRole("button", { name: "Post correction" }));
    expect((screen.getByLabelText("Unit") as HTMLSelectElement).value).toBe("each");
    change("Signed quantity", "-0.5"); change("Unit", "case"); change("Reason", "Physical count");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Post" })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.postStockCorrection).toHaveBeenCalledWith("test", 3, pair, { quantity: "-0.5", unit: "case", reason: "Physical count" });
  });
  it("requires a nonzero quantity and reason, and cancels without posting", async () => {
    render(dialog(pl)); fireEvent.click(screen.getByRole("button", { name: "Zaksięguj korektę" }));
    change("Ilość ze znakiem", "0");
    fireEvent.click(screen.getByRole("button", { name: "Zaksięguj" }));
    expect(screen.getByText(pl.stock.fieldErrors.quantity)).toBeTruthy(); expect(screen.getByText(pl.stock.fieldErrors.reason)).toBeTruthy();
    expect(mocks.postStockCorrection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("keeps a refused write's server context visible", async () => {
    const message = "Material 00000001 at location 00000002: available 2 each; requested 3 each.";
    mocks.postStockCorrection.mockResolvedValue({ ok: false, error: { code: "INSUFFICIENT_STOCK", message } });
    render(dialog()); fireEvent.click(screen.getByRole("button", { name: "Post correction" }));
    change("Signed quantity", "-3"); change("Reason", "Count");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Post" })));
    expect(screen.getByRole("alert").textContent).toContain(message); expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
