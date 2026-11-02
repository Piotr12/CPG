import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { IssueView, ReceiptView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { stockLabels } from "./labels";
import { ReceiptsTable } from "../goods-receipts/receipts-table";
import { receiptsLabels } from "../goods-receipts/labels";
import { IssuesTable } from "../goods-issues/issues-table";
import { issuesLabels } from "../goods-issues/labels";
vi.mock("../../app/admin/[tenant]/stock/actions", () => ({ reverseStockMovement: vi.fn() }));
const tenant = { code: "test", name: "Test", generation: 1, readOnly: false };
const material = { id: "00000001", type: "raw" as const, description: "Bolts", baseUnit: "each", active: false, version: 1, createdAt: new Date() };
const line = { line: 1, material: material.id, quantity: "5.000000", enteredQuantity: "5", enteredUnit: "each", numerator: "1", denominator: "1", movementId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", reversedBy: null };
const document = { id: "00000001", location: "00000001", businessDate: "2026-10-21", createdAt: new Date() };
it("offers full reversals on unreversed receipt/issue lines even when their material is inactive and shows reversal links", () => {
  const receipt: ReceiptView = { ...document, purchaseOrder: "00000001", lines: [line, { ...line, line: 2, quantity: "12345.500000", reversedBy: "inverse-id" }] };
  const issue: IssueView = { ...document, shipment: "00000001", customerOrder: "00000001", lines: [{ ...line, quantity: "1234.500000", orderLine: "order-line" }] };
  render(<><ReceiptsTable tenant={tenant} materials={new Map([[material.id, material]])} receipts={[receipt]} locale="en" labels={receiptsLabels(en)} reversalLabels={stockLabels(en)} />
    <IssuesTable tenant={tenant} materials={new Map([[material.id, material]])} issues={[issue]} locale="en" labels={issuesLabels(en)} reversalLabels={stockLabels(en)} /></>);
  expect(within(screen.getByRole("table", { name: en.goodsReceipts.heading })).getByRole("button", { name: "Reverse" })).toBeTruthy();
  expect(within(screen.getByRole("table", { name: en.goodsIssues.heading })).getByRole("button", { name: "Reverse" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "View reversal" }).getAttribute("href")).toContain("movement=inverse-id");
  const reversed = screen.getByText("Reversed");
  expect([reversed.dataset.slot, reversed.dataset.tone]).toEqual(["status-badge", "neutral"]);
  expect(reversed.querySelector("svg.lucide-undo-2")).toBeTruthy();
});
it("summarizes each line's quantity in the reader's locale (#304)", () => {
  const receipt: ReceiptView = { ...document, purchaseOrder: "00000001", lines: [{ ...line, quantity: "12345.500000" }] };
  const issue: IssueView = { ...document, shipment: "00000001", customerOrder: "00000001", lines: [{ ...line, quantity: "1234.500000", orderLine: "order-line" }] };
  const materials = new Map([[material.id, material]]);
  render(<><ReceiptsTable tenant={tenant} materials={materials} receipts={[receipt]} locale="pl" labels={receiptsLabels(pl)} reversalLabels={stockLabels(pl)} />
    <IssuesTable tenant={tenant} materials={materials} issues={[issue]} locale="en" labels={issuesLabels(en)} reversalLabels={stockLabels(en)} /></>);
  expect(within(screen.getByRole("table", { name: pl.goodsReceipts.heading })).getByText(/12 345,5 each/)).toBeTruthy();
  expect(within(screen.getByRole("table", { name: en.goodsIssues.heading })).getByText(/1,234\.5 each/)).toBeTruthy();
});
