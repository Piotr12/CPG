import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { namedRecordsLabels } from "./labels";
import { NamedRecordsTable } from "./named-records-table";

const tenant = { code: "test", name: "Test", generation: 1 };
const records = [
  { id: "00000001", name: "Main plant, Wrocław", active: true, createdAt: new Date(), version: 1 },
  { id: "00000002", name: "Old warehouse", active: false, createdAt: new Date(), version: 2 },
];
const labels = namedRecordsLabels(en, "suppliers");

describe("NamedRecordsTable", () => {
  it("lists every record by ID, with its name and status, inactive ones included", () => {
    render(<NamedRecordsTable tenant={tenant} records={records} labels={labels} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["00000001", "Main plant, Wrocław", "Active"],
      ["00000002", "Old warehouse", "Inactive"],
    ]);
    // Both states are quiet; Inactive is dashed, never the danger tone.
    expect(within(rows[0]).getByText("Active").dataset.tone).toBe("neutral");
    const inactive = within(rows[1]).getByText("Inactive");
    expect([inactive.dataset.slot, inactive.dataset.tone]).toEqual(["status-badge", "neutral"]);
    expect(inactive.className).toContain("border-dashed");
    // The ID column is first, monospaced and sticky; the table scrolls inside its own region.
    expect(within(rows[0]).getAllByRole("cell")[0].className).toMatch(/\bfont-mono\b.*\bsticky left-0\b/);
    expect(screen.getByRole("region", { name: "Suppliers" })).toBeTruthy();
  });

  it("gives the admin a menu on every row, and a normal user none (TEN-004)", () => {
    const { rerender } = render(<NamedRecordsTable tenant={tenant} records={records} labels={labels} update={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Actions for 00000001" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Actions for 00000002" })).toBeTruthy();

    rerender(<NamedRecordsTable tenant={tenant} records={records} labels={labels} />);
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("says the list is empty, and tells the admin how to start", () => {
    const { rerender } = render(<NamedRecordsTable tenant={tenant} records={[]} labels={labels} />);
    expect(screen.getByText("No suppliers in Test yet.")).toBeTruthy();
    // A reader (or a read-only tenant) is told whom to ask instead.
    expect(screen.getByText("Ask an administrator to add suppliers.")).toBeTruthy();
    expect(screen.queryByText(/Create the first one/)).toBeNull();

    rerender(<NamedRecordsTable tenant={tenant} records={[]} labels={labels} update={vi.fn()} />);
    expect(screen.getByText("No suppliers in Test yet. Create the first one with Create supplier.")).toBeTruthy();
  });
});
