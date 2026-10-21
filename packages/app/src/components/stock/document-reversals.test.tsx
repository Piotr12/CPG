import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { IssueView, ReceiptView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
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
  const receipt: ReceiptView = { ...document, purchaseOrder: "00000001", lines: [line, { ...line, line: 2, reversedBy: "inverse-id" }] };
  const issue: IssueView = { ...document, shipment: "00000001", customerOrder: "00000001", lines: [{ ...line, orderLine: "order-line" }] };
  render(<><ReceiptsTable tenant={tenant} materials={new Map([[material.id, material]])} receipts={[receipt]} labels={receiptsLabels(en)} reversalLabels={stockLabels(en)} />
    <IssuesTable tenant={tenant} materials={new Map([[material.id, material]])} issues={[issue]} labels={issuesLabels(en)} reversalLabels={stockLabels(en)} /></>);
  expect(within(screen.getByRole("table", { name: en.goodsReceipts.heading })).getByRole("button", { name: "Reverse" })).toBeTruthy();
  expect(within(screen.getByRole("table", { name: en.goodsIssues.heading })).getByRole("button", { name: "Reverse" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "View reversal" }).getAttribute("href")).toContain("movement=inverse-id");
});
