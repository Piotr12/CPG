import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable, type DataTableColumn } from "./data-table";

interface Pet {
  id: string;
  name: string;
  legs: number;
}

const columns: DataTableColumn<Pet>[] = [
  { id: "name", header: "Name", cell: (pet) => pet.name },
  { id: "legs", header: "Legs", cell: (pet) => pet.legs, className: "text-right" },
];
const pets: Pet[] = [
  { id: "1", name: "Mammoth", legs: 4 },
  { id: "2", name: "Dodo", legs: 2 },
];

describe("DataTable", () => {
  it("renders a header and one row per item, in order", () => {
    render(<DataTable label="Pets" columns={columns} rows={pets} rowKey={(pet) => pet.id} empty="No pets" />);

    const table = screen.getByRole("table", { name: "Pets" });
    const rows = within(table).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual(["NameLegs", "Mammoth4", "Dodo2"]);
    expect(within(rows[1]).getAllByRole("cell")[1].classList).toContain("text-right");
  });

  it("renders supplied pagination alongside the bounded table", () => {
    render(<DataTable label="Pets" columns={columns} rows={pets} rowKey={(pet) => pet.id} empty="No pets" pagination={<nav aria-label="Pet pages"><a href="?page=2">Next</a></nav>} />);
    expect(screen.getByRole("navigation", { name: "Pet pages" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe("?page=2");
  });

  it("adds an actions column when asked", () => {
    render(
      <DataTable
        label="Pets"
        columns={columns}
        rows={pets}
        rowKey={(pet) => pet.id}
        rowActions={(pet) => (pet.legs > 2 ? <button>Feed {pet.name}</button> : null)}
        empty="No pets"
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Feed Mammoth" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Feed Dodo" })).toBeNull();
  });

  it.each([
    ["without", undefined, 2],
    ["with", () => null, 3],
  ])("shows the empty state across the table %s actions", (_case, rowActions, span) => {
    render(
      <DataTable label="Pets" columns={columns} rows={[]} rowKey={(pet) => pet.id} rowActions={rowActions} empty="No pets" />,
    );

    const cell = screen.getByText("No pets").closest("td")!;
    expect(cell.colSpan).toBe(span);
  });

  it("names the actions column in the reader's language", () => {
    render(
      <DataTable
        label="Pets"
        actionsLabel="Akcje"
        columns={columns}
        rows={pets}
        rowKey={(pet) => pet.id}
        rowActions={() => null}
        empty="No pets"
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Akcje" })).toBeTruthy();
  });
});
