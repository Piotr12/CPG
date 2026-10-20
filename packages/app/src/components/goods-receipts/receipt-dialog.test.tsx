import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { receiptsLabels } from "./labels";
import { ReceiptDialog } from "./receipt-dialog";

const mocks = vi.hoisted(() => ({ postReceipt: vi.fn() }));
vi.mock("../../app/admin/[tenant]/purchase-orders/[id]/actions", () => ({ postReceipt: mocks.postReceipt }));

const LINES = [{ line: 1, label: "Line 1: 00000001 Steel sheet", outstanding: "100 kg outstanding", units: ["kg"] }];

const dialog = (canPost = true) => (
  <ReceiptDialog
    context={{ tenant: "prod", generation: 3 }}
    purchaseOrder="00000002"
    location="00000001 Main plant"
    labels={receiptsLabels(en)}
    lines={LINES}
    baseUnits={{ 1: "kg" }}
    canPost={canPost}
  />
);
const post = (quantity: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Post goods receipt" }));
  fireEvent.change(screen.getByLabelText(`Quantity received, ${LINES[0].label}`), { target: { value: quantity } });
  fireEvent.click(screen.getAllByRole("button", { name: "Post goods receipt" }).at(-1)!);
};

describe("ReceiptDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("posts against the page's order, tenant and generation, closes, and names the receipt", async () => {
    mocks.postReceipt.mockResolvedValue({ ok: true, data: { id: "00000005", warnings: [] } });
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Post goods receipt" }));
    expect(screen.getByRole("dialog", { name: "Post a goods receipt" }).textContent).toContain("Stock rises at 00000001 Main plant");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    post("30");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.postReceipt).toHaveBeenCalledWith("prod", 3, "00000002", { lines: [{ line: 1, quantity: "30", unit: "kg" }] });
    expect(screen.getByRole("status").textContent).toBe("Goods receipt 00000005 posted.Dismiss");
  });

  it("warns about an excess after posting, keeps the notice when the order can take no more, and dismisses it (BUY-015)", async () => {
    mocks.postReceipt.mockResolvedValue({ ok: true, data: { id: "00000006", warnings: [{ code: "OVER_RECEIPT", line: 1, excess: "10.000000" }] } });
    const { rerender } = render(dialog());

    post("110");
    expect(await screen.findByText("Line 1 received 10 kg more than was outstanding.")).toBeTruthy();

    // The post completed the order: the page re-renders without the button, the notice stays.
    rerender(dialog(false));
    expect(screen.queryByRole("button", { name: "Post goods receipt" })).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("clears an earlier notice when a new receipt is started", async () => {
    mocks.postReceipt.mockResolvedValue({ ok: true, data: { id: "00000007", warnings: [] } });
    render(dialog());
    post("1");
    await screen.findByRole("status");

    fireEvent.click(screen.getByRole("button", { name: "Post goods receipt" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
