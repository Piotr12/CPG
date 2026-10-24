import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { NamedRecordView, TransferPostingView, TransferReversalView } from "@cpg/core";
import { afterEach, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { transfersLabels } from "./labels";
import { LedgerTable } from "./ledger-table";

const mocks = vi.hoisted(() => ({ reverseTransferPosting: vi.fn() }));
vi.mock("../../app/admin/[tenant]/transfers/[id]/actions", () => mocks);

const locations = new Map<string, NamedRecordView>([
  ["00000001", { id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 }],
  ["00000002", { id: "00000002", name: "Warehouse", active: true, createdAt: new Date(), version: 1 }],
]);
const posting = (id: string, kind: TransferPostingView["kind"], legs: TransferPostingView["legs"], at: string, changes: Partial<TransferPostingView> = {}): TransferPostingView => ({
  id, kind, businessDate: at.slice(0, 10), occurredAt: new Date(at), quantity: "50.000000", enteredQuantity: "50", enteredUnit: "kg", numerator: "1", denominator: "1",
  reason: `${kind} reason`, actorUsername: "alice", channel: "ui", legs, reversedBy: null, canReverse: true, ...changes,
});
const dispatch = posting("d1", "dispatch", [
  { place: "source", location: "00000001", quantity: "-60.000000", before: "100.000000", after: "40.000000" },
  { place: "transit", location: null, quantity: "60.000000", before: "0.000000", after: "60.000000" },
], "2027-03-01T09:00:00Z", { canReverse: false });
const receipt = posting("r1", "receipt", [
  { place: "transit", location: null, quantity: "-50.000000", before: "60.000000", after: "10.000000" },
  { place: "destination", location: "00000002", quantity: "50.000000", before: "0.000000", after: "50.000000" },
], "2027-03-02T10:00:00Z");
const loss = posting("w1", "write-off", [{ place: "transit", location: null, quantity: "-5.000000", before: "10.000000", after: "5.000000" }], "2027-03-02T11:00:00Z");
const reversal: TransferReversalView = {
  id: "x1", original: "r1", kind: "receipt", businessDate: "2027-03-03", occurredAt: new Date("2027-03-03T08:00:00Z"), quantity: "50.000000",
  reason: "Wrong transfer", actorUsername: "bob", channel: "api",
  legs: [
    { place: "destination", location: "00000002", quantity: "-50.000000", before: "50.000000", after: "0.000000" },
    { place: "transit", location: null, quantity: "50.000000", before: "10.000000", after: "60.000000" },
  ],
};
const reversible = { context: { tenant: "test", generation: 4 }, transfer: "00000001", path: "/admin/test/transfers/00000001" };
const ledger = (props: Partial<Parameters<typeof LedgerTable>[0]> = {}) =>
  <LedgerTable postings={[loss, receipt, dispatch]} reversals={[]} locations={locations} baseUnit="kg" labels={transfersLabels(en)} reversible={reversible} {...props} />;
const t = en.transfers.reversal;
const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
afterEach(() => vi.clearAllMocks());

it("merges each reversal into the ledger by time, linked to the posting it reverses", () => {
  render(ledger({ postings: [loss, { ...receipt, reversedBy: "x1", canReverse: false }, dispatch], reversals: [reversal] }));
  expect(rows().map((row) => within(row).getAllByRole("cell").slice(0, 5).map((cell) => cell.textContent))).toEqual([
    ["2027-03-03", "Receipt reversal", "00000002 Warehouse (to)", "-50 kg", "0 kg"],
    ["", "", "In transit", "+50 kg", "60 kg"],
    ["2027-03-02", "Write-off", "In transit", "-5 kg", "5 kg"],
    ["2027-03-02", "Receipt", "In transit", "-50 kg", "10 kg"],
    ["", "", "00000002 Warehouse (to)", "+50 kg", "50 kg"],
    ["2027-03-01", "Dispatch", "00000001 Main plant (from)", "-60 kg", "40 kg"],
    ["", "", "In transit", "+60 kg", "60 kg"],
  ]);
  expect(within(rows()[0]).getByText("bob · API · Reverses the posting of 2027-03-02")).toBeTruthy();
  expect(within(rows()[3]).getByText(en.transfers.ledger.reversed).closest("[data-slot=status-badge]")?.getAttribute("data-tone")).toBe("neutral");
  expect(within(rows()[3]).getByText(en.transfers.ledger.reversed).closest("[data-slot=status-badge]")?.querySelector("svg.lucide-undo-2")).toBeTruthy();
  expect(within(rows()[5]).getByText(en.transfers.ledger.blocked)).toBeTruthy();
  expect(within(rows()[2]).getByRole("button", { name: "Reverse the write-off of 2027-03-02" }).textContent).toBe(t.open);
  expect(screen.getAllByRole("button")).toHaveLength(1);
});

it("confirms each change running the other way, the reopening and today's date, then reverses with only a reason", async () => {
  mocks.reverseTransferPosting.mockResolvedValue({ ok: true, data: {} });
  render(ledger());
  fireEvent.click(within(rows()[1]).getByRole("button", { name: "Reverse the receipt of 2027-03-02" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByRole("heading", { name: t.titles.receipt })).toBeTruthy();
  expect(dialog.getByText("Receipt · 2027-03-02")).toBeTruthy();
  expect(dialog.getByText(`${new Date().toISOString().slice(0, 10)} (UTC)`)).toBeTruthy();
  expect(dialog.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["00000002 Warehouse (to)-50 kg", "In transit+50 kg"]);
  expect(dialog.getByText(t.effect)).toBeTruthy();
  expect(dialog.getAllByRole("textbox")).toHaveLength(1);
  fireEvent.change(dialog.getByLabelText(t.reason), { target: { value: "Wrong transfer" } });
  await act(async () => fireEvent.click(dialog.getByRole("button", { name: t.submit })));
  expect(mocks.reverseTransferPosting).toHaveBeenCalledWith("test", 4, "00000001", "r1", { reason: "Wrong transfer" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("offers the existing reversal on a stale duplicate and explains other refusals, keeping the reason", async () => {
  render(ledger());
  fireEvent.click(within(rows()[0]).getByRole("button", { name: "Reverse the write-off of 2027-03-02" }));
  expect(within(screen.getByRole("dialog")).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["In transit+5 kg"]);
  fireEvent.change(screen.getByLabelText(t.reason), { target: { value: "Found" } });
  mocks.reverseTransferPosting.mockResolvedValue({ ok: false, error: { code: "TRANSFER_POSTING_ALREADY_REVERSED", message: "Already" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: t.submit })));
  expect(screen.getByRole("link", { name: t.showExisting }).getAttribute("href")).toBe(reversible.path);
  mocks.reverseTransferPosting.mockResolvedValue({ ok: false, error: { code: "TRANSFER_MASTER_INACTIVE", message: "Inactive", params: { transfer: "00000001" } } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: t.submit })));
  expect(screen.getByRole("alert").textContent).toContain("Transfer 00000001 uses an inactive material or location");
  expect(screen.queryByRole("link", { name: t.showExisting })).toBeNull();
  expect(screen.getByLabelText(t.reason)).toHaveProperty("value", "Found");
});

it("translates the reason refusal in Polish, passes other field messages through, and shows no actions when read-only", async () => {
  const { unmount } = render(ledger({ labels: transfersLabels(pl) }));
  fireEvent.click(within(rows()[0]).getByRole("button", { name: "Odwróć odpis z 2027-03-02" }));
  fireEvent.click(screen.getByRole("button", { name: pl.transfers.reversal.submit }));
  expect(screen.getByText(pl.transfers.reversal.reasonError)).toBeTruthy();
  mocks.reverseTransferPosting.mockResolvedValue({ ok: false, error: { code: "VALIDATION_FAILED", message: "Invalid", fieldErrors: { reason: ["Server says no"] } } });
  fireEvent.change(screen.getByLabelText(pl.transfers.reversal.reason), { target: { value: "Odnaleziono" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: pl.transfers.reversal.submit })));
  expect(screen.getByText("Server says no")).toBeTruthy();
  unmount();
  render(ledger({ reversible: undefined, postings: [loss, { ...receipt, reversedBy: "x1", canReverse: false }, dispatch], reversals: [reversal] }));
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByText(en.transfers.ledger.blocked)).toBeNull();
  expect(screen.getByText(en.transfers.ledger.reversed)).toBeTruthy();
});
