import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TransferPostingKind } from "@cpg/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { transfersLabels } from "./labels";
import { PostingDialog } from "./posting-dialog";

const mocks = vi.hoisted(() => ({ dispatchTransfer: vi.fn(), receiveTransfer: vi.fn(), writeOffTransfer: vi.fn(), setTransferDates: vi.fn() }));
vi.mock("../../app/admin/[tenant]/transfers/[id]/actions", () => mocks);

const dialog = (kind: TransferPostingKind, messages = en) => (
  <PostingDialog
    context={{ tenant: "test", generation: 3 }}
    transfer="00000004"
    kind={kind}
    title={`Title of ${kind}`}
    description={`Description of ${kind}`}
    units={["kg", "t"]}
    labels={transfersLabels(messages)}
  />
);
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
afterEach(() => vi.clearAllMocks());

describe("PostingDialog", () => {
  it.each([
    ["dispatch", "Dispatch", mocks.dispatchTransfer],
    ["receipt", "Receive", mocks.receiveTransfer],
  ] as const)("posts a %s on the page's transfer, in its tenant and generation, with the chosen unit", async (kind, button, action) => {
    action.mockResolvedValue({ ok: true, data: {} });
    render(dialog(kind));

    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(screen.getByRole("dialog", { name: `Title of ${kind}` })).toBeTruthy();
    expect(screen.getByText(`Description of ${kind}`)).toBeTruthy();
    expect((screen.getByLabelText("Unit") as HTMLSelectElement).value).toBe("kg");
    expect(screen.queryByLabelText("Reason")).toBeNull();
    change("Quantity", "0.06");
    change("Unit", "t");
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: button }).at(-1)!));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(action).toHaveBeenCalledWith("test", 3, "00000004", { quantity: "0.06", unit: "t" });
  });

  it("writes off with a required reason (TRF-013)", async () => {
    mocks.writeOffTransfer.mockResolvedValue({ ok: true, data: {} });
    render(dialog("write-off"));

    fireEvent.click(screen.getByRole("button", { name: "Write off" }));
    change("Quantity", "10");
    fireEvent.click(screen.getAllByRole("button", { name: "Write off" }).at(-1)!);
    expect(screen.getByText(en.transfers.fieldErrors.reason)).toBeTruthy();
    expect(mocks.writeOffTransfer).not.toHaveBeenCalled();

    change("Reason", "Pallet lost");
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Write off" }).at(-1)!));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.writeOffTransfer).toHaveBeenCalledWith("test", 3, "00000004", { quantity: "10", unit: "kg", reason: "Pallet lost" });
  });

  it("keeps a refusal and its context visible, translated, and cancels without posting", async () => {
    mocks.receiveTransfer.mockResolvedValue({
      ok: false,
      error: { code: "TRANSFER_OVER_RECEIPT", message: "Too much.", params: { transfer: "00000004", available: "10.000000", requested: "11.000000", unit: "kg" } },
    });
    render(dialog("receipt", pl));

    fireEvent.click(screen.getByRole("button", { name: "Przyjmij" }));
    change("Ilość", "11");
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Przyjmij" }).at(-1)!));

    expect(screen.getByRole("alert").textContent).toBe("W przesunięciu 00000004 w tranzycie jest tylko 10.000000 kg.");
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("names an invalid quantity under its field before sending", () => {
    render(dialog("dispatch"));

    fireEvent.click(screen.getByRole("button", { name: "Dispatch" }));
    change("Quantity", "0");
    fireEvent.click(screen.getAllByRole("button", { name: "Dispatch" }).at(-1)!);

    expect(screen.getByText(en.transfers.fieldErrors.quantity)).toBeTruthy();
    expect(mocks.dispatchTransfer).not.toHaveBeenCalled();
  });
});
