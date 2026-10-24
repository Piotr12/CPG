import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { listLinks } from "../lists/list-params";
import { namedRecordsLabels } from "./labels";
import { NamedRecordsTable } from "./named-records-table";

const tenant = { code: "test", name: "Test", generation: 1 };
const records = [
  { id: "00000001", name: "Main plant, Wrocław", active: true, createdAt: new Date(), version: 1 },
  { id: "00000002", name: "Old warehouse", active: false, createdAt: new Date(), version: 2 },
];
const labels = namedRecordsLabels(en, "suppliers");
const links = (search = "") => listLinks({ path: "/admin/test/suppliers", search, sort: { sort: "id", dir: "asc" }, defaults: { sort: "id", dir: "asc" } });
const list = { search: "", sort: { sort: "id" as const, dir: "asc" as const }, links: links(), lists: en.lists };

describe("NamedRecordsTable", () => {
  it("lists every record by ID, with its name and status, inactive ones included", () => {
    render(<NamedRecordsTable tenant={tenant} records={records} labels={labels} {...list} />);

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
    const { rerender } = render(<NamedRecordsTable tenant={tenant} records={records} labels={labels} update={vi.fn()} {...list} />);
    expect(screen.getByRole("button", { name: "Actions for 00000001" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Actions for 00000002" })).toBeTruthy();

    rerender(<NamedRecordsTable tenant={tenant} records={records} labels={labels} {...list} />);
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("says the list is empty, and tells the admin how to start", () => {
    const { rerender } = render(<NamedRecordsTable tenant={tenant} records={[]} labels={labels} {...list} />);
    expect(screen.getByText("No suppliers in Test yet.")).toBeTruthy();
    // A reader (or a read-only tenant) is told whom to ask instead.
    expect(screen.getByText("Ask an administrator to add suppliers.")).toBeTruthy();
    expect(screen.queryByText(/Create the first one/)).toBeNull();

    rerender(<NamedRecordsTable tenant={tenant} records={[]} labels={labels} update={vi.fn()} {...list} />);
    expect(screen.getByText("No suppliers in Test yet. Create the first one with Create supplier.")).toBeTruthy();
  });

  it("sorts by ID, name and status through header links, marking the current sort (#217)", () => {
    render(<NamedRecordsTable tenant={tenant} records={records} labels={labels} {...list} sort={{ sort: "name", dir: "asc" }} />);

    expect(screen.getAllByRole("columnheader").map((header) => header.getAttribute("aria-sort"))).toEqual(["none", "ascending", "none"]);
    expect(screen.getByRole("link", { name: "Name" }).getAttribute("href")).toBe("/admin/test/suppliers?sort=name&dir=desc");
    expect(screen.getByRole("link", { name: "Status" }).getAttribute("href")).toBe("/admin/test/suppliers?sort=status&dir=asc");
  });

  it("marks a search's words in the ID and name, and says when nothing matches with the way back (#217)", () => {
    const { rerender } = render(<NamedRecordsTable tenant={tenant} records={records} labels={labels} {...list} search="plant 0001" links={links("plant 0001")} />);
    expect([...document.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual(["0001", "plant"]);

    rerender(<NamedRecordsTable tenant={tenant} records={[]} labels={labels} update={vi.fn()} {...list} search="brass" links={links("brass")} />);
    expect(screen.getByRole("cell").textContent).toBe("Nothing matches “brass”. Clear search");
    expect(screen.getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/admin/test/suppliers");
  });
});
