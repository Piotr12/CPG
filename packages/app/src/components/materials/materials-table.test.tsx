import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { listLinks } from "../lists/list-params";
import { materialsLabels } from "./labels";
import { MaterialsTable } from "./materials-table";

const material = (id: string, overrides: object = {}) => ({
  id,
  type: "raw" as const,
  description: `Material ${id}`,
  baseUnit: "kg",
  active: true,
  createdAt: new Date(),
  version: 1,
  ...overrides,
});

const links = (search = "") => listLinks({ path: "/admin/prod/materials", search, sort: { sort: "id", dir: "asc" }, defaults: { sort: "id", dir: "asc" } });
const list = { search: "", sort: { sort: "id" as const, dir: "asc" as const }, links: links(), lists: en.lists };

describe("MaterialsTable", () => {
  it("lists ID, description, type, base unit and status, each ID opening the material", () => {
    render(
      <MaterialsTable
        tenant={{ code: "prod", name: "Prod" }}
        editable={false}
        materials={[material("00000001"), material("00000002", { type: "finished", active: false, description: "Old cabinet" })]}
        labels={materialsLabels(en)}
        {...list}
      />,
    );

    expect(screen.getByRole("table", { name: "Materials" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "00000002" }).getAttribute("href")).toBe("/admin/prod/materials/00000002");
    expect(screen.getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      "00000001Material 00000001RawkgActive",
      "00000002Old cabinetFinishedkgInactive",
    ]);
    expect(screen.getByText("Old cabinet").className).toContain("text-muted-foreground");
    const [first, second] = screen.getAllByRole("row").slice(1);
    expect(within(first).getByText("Active").dataset.tone).toBe("neutral");
    const inactive = within(second).getByText("Inactive");
    expect([inactive.dataset.slot, inactive.dataset.tone]).toEqual(["status-badge", "neutral"]);
    expect(inactive.className).toContain("border-dashed");
    // The type is a category, not a state: a plain tag.
    expect(within(second).getByText("Finished").dataset.slot).toBe("badge");
    const cells = within(first).getAllByRole("cell");
    expect(cells[0].className).toMatch(/\bfont-mono\b.*\bsticky left-0\b/);
    // Type and base unit give way below md; the ID, description and status always show.
    expect(cells.map((cell) => cell.className.includes("hidden md:table-cell"))).toEqual([false, false, true, true, false]);
  });

  it("says when the tenant has none, and tells the admin how to start", () => {
    const prod = { code: "prod", name: "Prod" };
    const { rerender } = render(<MaterialsTable tenant={prod} materials={[]} labels={materialsLabels(en)} editable={false} {...list} />);
    expect(screen.getByText("No materials in Prod yet.")).toBeTruthy();
    expect(screen.getByText("Ask an administrator to add materials.")).toBeTruthy();

    rerender(<MaterialsTable tenant={prod} materials={[]} labels={materialsLabels(en)} editable {...list} />);
    expect(screen.getByText("No materials in Prod yet. Create the first one with Create material.")).toBeTruthy();
  });

  it("sorts by every column through header links, marking the current sort (#217)", () => {
    render(
      <MaterialsTable
        tenant={{ code: "prod", name: "Prod" }}
        editable={false}
        materials={[material("00000001")]}
        labels={materialsLabels(en)}
        {...list}
        sort={{ sort: "description", dir: "desc" }}
      />,
    );

    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((header) => header.getAttribute("aria-sort"))).toEqual(["none", "descending", "none", "none", "none"]);
    expect(screen.getByRole("link", { name: "Description" }).getAttribute("href")).toBe("/admin/prod/materials?sort=description&dir=asc");
    expect(screen.getByRole("link", { name: "Base unit" }).getAttribute("href")).toBe("/admin/prod/materials?sort=baseUnit&dir=asc");
  });

  it("marks a search's words in the ID and description, and says when nothing matches with the way back", () => {
    const { rerender } = render(
      <MaterialsTable
        tenant={{ code: "prod", name: "Prod" }}
        editable
        materials={[material("00000001", { description: "Steel sheet" })]}
        labels={materialsLabels(en)}
        {...list}
        search="steel 0001"
        links={links("steel 0001")}
      />,
    );
    expect([...document.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual(["0001", "Steel"]);

    rerender(<MaterialsTable tenant={{ code: "prod", name: "Prod" }} editable materials={[]} labels={materialsLabels(en)} {...list} search="brass" links={links("brass")} />);
    expect(screen.getByRole("cell").textContent).toBe("Nothing matches “brass”. Clear search");
    expect(screen.getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/admin/prod/materials");
  });
});
