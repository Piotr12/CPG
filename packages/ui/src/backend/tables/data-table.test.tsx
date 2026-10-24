import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable, columnClasses, type DataTableColumn } from "./data-table";

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

  it("scrolls inside a labelled, keyboard-reachable region with the first column sticky", () => {
    render(<DataTable label="Pets" columns={columns} rows={pets} rowKey={(pet) => pet.id} empty="No pets" />);

    const region = screen.getByRole("region", { name: "Pets" });
    expect(region.dataset.slot).toBe("table-container");
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.classList).toContain("overflow-x-auto");
    expect(within(region).getByRole("table", { name: "Pets" })).toBeTruthy();

    const [nameHead, legsHead] = screen.getAllByRole("columnheader");
    expect([...nameHead.classList]).toEqual(expect.arrayContaining(["sticky", "left-0", "bg-background", "z-10"]));
    expect(legsHead.classList).not.toContain("sticky");
    const [nameCell, legsCell] = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect([...nameCell.classList]).toEqual(expect.arrayContaining(["sticky", "left-0", "bg-background"]));
    expect(nameCell.classList).not.toContain("z-10");
    expect(legsCell.classList).not.toContain("sticky");
    // Without rowTone, no row gets an edge.
    expect(nameCell.className).not.toMatch(/border-l/);
  });

  it.each([
    ["id", ["min-w-28", "font-mono", "whitespace-nowrap"]],
    ["text", ["min-w-32"]],
    ["longText", ["min-w-48", "whitespace-normal", "wrap-break-word"]],
    ["quantity", ["min-w-24", "text-right", "tabular-nums", "whitespace-nowrap"]],
    ["date", ["min-w-28", "whitespace-nowrap"]],
    ["status", ["min-w-32"]],
    ["actions", ["w-0", "text-right"]],
  ] as const)("sizes and aligns a %s column on its header and cells", (kind, classes) => {
    expect(columnClasses({ id: "c", header: "C", cell: () => null, kind }).split(" ")).toEqual(classes);
    render(
      <DataTable label="Pets" columns={[columns[0], { ...columns[1], kind, className: undefined }]} rows={pets} rowKey={(pet) => pet.id} empty="No pets" />,
    );
    const head = screen.getAllByRole("columnheader")[1];
    const cell = within(screen.getAllByRole("row")[1]).getAllByRole("cell")[1];
    for (const element of [head, cell]) expect([...element.classList]).toEqual(expect.arrayContaining([...classes]));
  });

  it("hides priority 2 columns below md and priority 3 below lg, header and cells alike", () => {
    render(
      <DataTable
        label="Pets"
        columns={[
          { ...columns[0], priority: 1 },
          { id: "legs", header: "Legs", cell: (pet) => pet.legs, priority: 2 },
          { id: "id", header: "ID", cell: (pet) => pet.id, priority: 3 },
        ]}
        rows={pets}
        rowKey={(pet) => pet.id}
        empty="No pets"
      />,
    );

    const heads = screen.getAllByRole("columnheader");
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    for (const element of [heads[0], cells[0]]) expect(element.className).not.toMatch(/hidden|table-cell/);
    for (const element of [heads[1], cells[1]]) expect([...element.classList]).toEqual(expect.arrayContaining(["hidden", "md:table-cell"]));
    for (const element of [heads[2], cells[2]]) expect([...element.classList]).toEqual(expect.arrayContaining(["hidden", "lg:table-cell"]));
  });

  it("keeps a caller's className last, so it can override the kind", () => {
    render(
      <DataTable label="Pets" columns={[columns[0], { ...columns[1], kind: "quantity", className: "text-left" }]} rows={pets} rowKey={(pet) => pet.id} empty="No pets" />,
    );
    const cell = within(screen.getAllByRole("row")[1]).getAllByRole("cell")[1];
    expect(cell.classList).toContain("text-left");
    expect(cell.classList).not.toContain("text-right");
  });

  it.each([2, 3] as const)("refuses a status column at priority %s, naming the column", (priority) => {
    const status: DataTableColumn<Pet> = { id: "state", header: "Status", cell: () => "Open", kind: "status", priority };
    expect(() => render(<DataTable label="Pets" columns={[columns[0], status]} rows={pets} rowKey={(pet) => pet.id} empty="No pets" />)).toThrow(
      `DataTable column "state": a status column is always priority 1, not ${priority}`,
    );
    expect(columnClasses({ ...status, priority: 1 })).toBe("min-w-32");
  });

  it("truncates a long text to one line with the full text as its title", () => {
    render(
      <DataTable
        label="Pets"
        columns={[columns[0], { id: "note", header: "Note", cell: (pet) => `${pet.name} has ${pet.legs} legs`, kind: "longText", truncate: (pet) => `${pet.name} has ${pet.legs} legs` }]}
        rows={pets}
        rowKey={(pet) => pet.id}
        empty="No pets"
      />,
    );
    const cell = screen.getByText("Dodo has 2 legs");
    expect(cell.getAttribute("title")).toBe("Dodo has 2 legs");
    expect([...cell.classList]).toEqual(expect.arrayContaining(["max-w-xs", "truncate"]));
    expect(within(screen.getAllByRole("row")[1]).getAllByRole("cell")[0].hasAttribute("title")).toBe(false);
  });

  it("marks a toned row with a 2 px edge and the tone's icon on its first cell, and keeps the others aligned", () => {
    render(
      <DataTable
        label="Pets"
        columns={columns}
        rows={[...pets, { id: "3", name: "Moa", legs: 2 }, { id: "4", name: "Auk", legs: 2 }, { id: "5", name: "Emu", legs: 2 }]}
        rowKey={(pet) => pet.id}
        rowTone={(pet) => ({ "1": "warning", "3": "success", "4": "danger", "5": "neutral" } as const)[pet.id]}
        empty="No pets"
      />,
    );

    const rows = screen.getAllByRole("row").slice(1);
    const first = (index: number) => within(rows[index]).getAllByRole("cell")[0];
    expect(rows[0].dataset.tone).toBe("warning");
    expect([...first(0).classList]).toEqual(expect.arrayContaining(["border-l-2", "border-l-warning"]));
    expect(first(0).classList).not.toContain("border-l-transparent");
    const icon = first(0).querySelector("svg")!;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect([...icon.classList]).toEqual(expect.arrayContaining(["size-3.5", "text-warning", "lucide-triangle-alert"]));
    expect(first(0).textContent).toBe("Mammoth");
    // An untoned row keeps a transparent edge, so nothing shifts, and no icon.
    expect(rows[1].hasAttribute("data-tone")).toBe(false);
    expect([...first(1).classList]).toEqual(expect.arrayContaining(["border-l-2", "border-l-transparent"]));
    expect(first(1).className).not.toMatch(/border-l-(warning|success|danger|neutral)/);
    expect(first(1).querySelector("svg")).toBeNull();
    expect(first(2).classList).toContain("border-l-success");
    expect(first(3).classList).toContain("border-l-danger");
    expect(first(4).classList).toContain("border-l-neutral-tone");
    // Only the first cell carries the tone.
    expect(within(rows[0]).getAllByRole("cell")[1].className).not.toMatch(/border-l/);
  });
});
