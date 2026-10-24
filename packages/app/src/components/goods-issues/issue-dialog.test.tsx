import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { IssueDialog } from "./issue-dialog";
import { issuesLabels } from "./labels";

const mocks = vi.hoisted(() => ({ postIssue: vi.fn() }));
vi.mock("../../app/admin/[tenant]/shipments/[id]/actions", () => ({ postIssue: mocks.postIssue }));

const LINES = [{ key: 2, label: "Line 2: 00000005 Cabinet", hint: "20 each to issue", units: ["each"] }];
const dialog = (canPost = true) => (
  <IssueDialog
    context={{ tenant: "prod", generation: 3 }}
    shipment="00000002"
    customerOrder="00000007"
    location="00000001 Main plant"
    labels={issuesLabels(en)}
    lines={LINES}
    canPost={canPost}
  />
);
const post = (quantity: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Post goods issue" }));
  fireEvent.change(screen.getByLabelText(`Quantity issued, ${LINES[0].label}`), { target: { value: quantity } });
  fireEvent.click(screen.getAllByRole("button", { name: "Post goods issue" }).at(-1)!);
};

describe("IssueDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("posts against the page's shipment and order, tenant and generation, closes, and names the issue", async () => {
    mocks.postIssue.mockResolvedValue({ ok: true, data: { id: "00000009" } });
    const { rerender } = render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Post goods issue" }));
    expect(screen.getByRole("dialog", { name: "Post a goods issue" }).textContent).toContain("Stock falls at 00000001 Main plant");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    post("20");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.postIssue).toHaveBeenCalledWith("prod", 3, "00000002", "00000007", { lines: [{ line: 2, quantity: "20", unit: "each" }] });
    expect(screen.getByRole("status").textContent).toBe("Goods issue 00000009 posted.Dismiss");
    expect(screen.getByRole("status").getAttribute("data-tone")).toBe("success");

    // The issue completed the shipment: the page re-renders without the button, the notice stays.
    rerender(dialog(false));
    expect(screen.queryByRole("button", { name: "Post goods issue" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says how much stock is available when the service refuses for too little, and clears an earlier notice on a new issue", async () => {
    mocks.postIssue.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "INSUFFICIENT_STOCK",
        message: "Short.",
        params: { material: "00000005", location: "00000001", available: "10.000000", requested: "11.000000", unit: "each" },
      },
    });
    render(dialog());
    post("11");
    expect(await screen.findByText("Material 00000005 at location 00000001: available 10.000000 each; requested 11.000000 each.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    mocks.postIssue.mockResolvedValueOnce({ ok: true, data: { id: "00000010" } });
    post("10");
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "Post goods issue" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("refuses an issue against a shipment cancelled since the page loaded without calling it completed (#188)", async () => {
    mocks.postIssue.mockResolvedValue({ ok: false, error: { code: "SHIPMENT_NOT_OPEN", message: "Shipment 00000002 is cancelled, so nothing more is issued against it." } });
    render(dialog());

    post("20");

    expect(await screen.findByText("This shipment isn't Open any more, so nothing more is issued against it.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Post a goods issue" }).textContent).not.toContain("completed");
  });
});
