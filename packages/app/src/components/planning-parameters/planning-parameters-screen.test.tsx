import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import type { PlanningParameterSort } from "@cpg/core/validators/planning-parameters/planning-parameter-list.schema";
import { en } from "../../i18n/messages/en";
import { PlanningParametersScreen } from "./planning-parameters-screen";

const dialog = vi.hoisted(() => vi.fn());
vi.mock("./add-planning-parameters-dialog", () => ({
  AddPlanningParametersDialog: (props: object) => {
    dialog(props);
    return <button>Add parameters</button>;
  },
}));
vi.mock("./planning-parameter-actions", () => ({ PlanningParameterActions: () => <button>Row actions</button> }));

const MATERIALS = [{ id: "00000005", type: "finished" as const, description: "Cabinet", baseUnit: "each", active: true, createdAt: new Date(), version: 1 }];
const LOCATIONS = [{ id: "00000001", name: "Main plant", active: false, createdAt: new Date(), version: 1 }];
const set = (procurement: "make" | "buy") => ({
  material: "00000005",
  location: "00000001",
  procurement,
  leadTimeDays: 2,
  minimumQuantity: "50.000000",
  lotMultiple: "0.500000",
  version: 1,
});
const TENANT = { code: "test", name: "Test", generation: 1, readOnly: false };
const LIST = { search: { q: "", typed: "" }, sort: { sort: "material" as PlanningParameterSort, dir: "asc" as SortDirection } };
const renderScreen = (sets: object[], admin = true, list = LIST) =>
  render(
    <PlanningParametersScreen
      tenant={TENANT}
      sets={sets as never}
      materials={MATERIALS}
      locations={LOCATIONS}
      locale="en"
      messages={en}
      admin={admin}
      {...list}
    />,
  );

describe("PlanningParametersScreen", () => {
  it("heads the list with the one h1 and the admin's Add, then the table with right-aligned quantities", () => {
    renderScreen([set("make")]);

    const header = screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]") as HTMLElement;
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Planning parameters — Test");
    expect(within(header).getByRole("button", { name: "Add parameters" })).toBeTruthy();
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells[0].className).toMatch(/\bsticky left-0\b/);
    expect(cells[3].className).toMatch(/\btext-right tabular-nums\b/);
    expect(cells[4].textContent).toBe("50 each");
    expect(cells[4].className).toContain("hidden md:table-cell");
    // Procurement is a category (a tag); the inactive location is a state (a dashed quiet badge).
    expect(within(cells[2]).getByText("Make").dataset.slot).toBe("badge");
    expect(within(cells[1]).getByText("Inactive").dataset.tone).toBe("neutral");
  });

  it("offers Add parameters only the active locations, as autocomplete choices (LFC-019, #222)", () => {
    render(
      <PlanningParametersScreen
        tenant={TENANT}
        sets={[]}
        materials={MATERIALS}
        locations={[...LOCATIONS, { id: "00000003", name: "North warehouse", active: true, createdAt: new Date(), version: 1 }]}
        locale="en"
        messages={en}
        admin
        {...LIST}
      />,
    );

    expect(dialog).toHaveBeenCalledWith(expect.objectContaining({ locations: [{ value: "00000003", code: "00000003", name: "North warehouse" }] }));
  });

  it("tells a reader whom to ask when the list is empty", () => {
    renderScreen([], false);

    expect(screen.getByText("Ask an administrator to add planning parameters.")).toBeTruthy();
    expect(screen.queryAllByRole("button").map((button) => button.textContent)).toEqual(["Search"]);
  });

  it("searches above the list, sorts by every stored column but the decimal quantities, and marks the matches (#217)", () => {
    renderScreen([set("buy")], false, { search: { q: "cabinet plant", typed: "cabinet plant" }, sort: { sort: "leadTime", dir: "desc" } });

    expect(screen.getByRole("searchbox", { name: "Search planning parameters" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("1 result for “cabinet plant” · Clear search");
    expect(screen.getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/admin/test/planning-parameters?sort=leadTime&dir=desc");
    expect(screen.getAllByRole("columnheader").map((header) => header.getAttribute("aria-sort"))).toEqual(["none", "none", "none", "descending", null, null]);
    expect(screen.getByRole("link", { name: "Make / Buy" }).getAttribute("href")).toBe("/admin/test/planning-parameters?q=cabinet+plant&sort=procurement&dir=asc");
    expect([...document.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual(["Cabinet", "plant"]);
  });

  it("says when nothing matches, with the way back to the whole list (#217)", () => {
    renderScreen([], false, { search: { q: "brass", typed: "brass" }, sort: LIST.sort });

    expect(screen.getByRole("cell").textContent).toBe("Nothing matches “brass”. Clear search");
  });
});
