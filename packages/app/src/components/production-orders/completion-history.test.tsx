import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { completionMaterials, completionView, wasteView } from "../../../../../tests/setup/production-orders";
import { en } from "../../i18n/messages/en";
import { CompletionHistory, shownVariance } from "./completion-history";
import { productionLabels } from "./labels";

const labels = productionLabels(en);
const t = labels.completion;
const props = { materials: completionMaterials, labels, path: "/admin/test/production-orders/00000001" };

it("signs variances and shows none as 0", () => {
  expect([shownVariance("-2.000000"), shownVariance("3.500000"), shownVariance("0.000000")]).toEqual(["-2", "+3.5", "0"]);
});

it("lists each completion's output or waste and every material's expected, actual and variance (PRD-013, PRD-015, PRD-018)", () => {
  render(<CompletionHistory {...props} completions={[completionView, wasteView]} page={1} />);
  const table = within(screen.getByRole("table", { name: t.history }));
  const rows = table.getAllByRole("row").slice(1);
  expect(within(rows[0]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
    "00000002",
    "2026-10-21",
    "40 each",
    `00000006 Cocoa — expected 20, actual 18 kg, variance -200000007 Wrapper — expected 80, actual 80 each, variance 000000008 Milk — expected 0, actual 2 kg, variance +2${t.extra}`,
  ]);
  expect(within(rows[1]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
    "00000001",
    "2026-10-20",
    `${t.waste}0 each`,
    "00000006 Cocoa — expected 0, actual 10 kg, variance +10",
  ]);
  expect(screen.queryByRole("navigation")).toBeNull();
});

it("pages newest first: older while a page is full, newer after the first", () => {
  const full = Array.from({ length: 20 }, (_, index) => ({ ...completionView, id: String(40 - index).padStart(8, "0") }));
  const { rerender } = render(<CompletionHistory {...props} completions={full} page={1} />);
  expect(screen.queryByRole("link", { name: t.previous })).toBeNull();
  expect(screen.getByRole("link", { name: t.next }).getAttribute("href")).toBe("/admin/test/production-orders/00000001?completions=2");
  rerender(<CompletionHistory {...props} completions={[wasteView]} page={2} />);
  expect(screen.getByRole("link", { name: t.previous }).getAttribute("href")).toBe("/admin/test/production-orders/00000001?completions=1");
  expect(screen.queryByRole("link", { name: t.next })).toBeNull();
  expect(screen.getByText("Page 2")).toBeTruthy();
});

it("says when nothing was posted yet", () => {
  render(<CompletionHistory {...props} completions={[]} page={1} />);
  expect(screen.getByText(t.historyEmpty)).toBeTruthy();
});
