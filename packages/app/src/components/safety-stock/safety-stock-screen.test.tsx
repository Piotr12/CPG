import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import type { SafetyStockSort } from "@cpg/core/validators/safety-stock/safety-stock-list.schema";
import { en } from "../../i18n/messages/en";
import { SafetyStockScreen } from "./safety-stock-screen";

const dialog = vi.hoisted(() => vi.fn());
vi.mock("./add-safety-stock-target-dialog", () => ({
  AddSafetyStockTargetDialog: (props: object) => {
    dialog(props);
    return <button>Add target</button>;
  },
}));
vi.mock("./safety-stock-target-actions", () => ({ SafetyStockTargetActions: () => <button>Row actions</button> }));

const MATERIALS = [{ id: "00000005", type: "finished" as const, description: "Cabinet", baseUnit: "each", active: true, createdAt: new Date(), version: 1 }];
const LOCATIONS = [{ id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 }];
const target = (effectiveFrom: string) => ({ material: "00000005", location: "00000001", effectiveFrom, quantity: "10.000000", version: 1 });
const TENANT = { code: "test", name: "Test", generation: 1, readOnly: false };
const LIST = { search: { q: "", typed: "" }, sort: { sort: "material" as SafetyStockSort, dir: "asc" as SortDirection } };
const renderScreen = (targets: object[], admin = true, list = LIST) =>
  render(
    <SafetyStockScreen
      tenant={TENANT}
      targets={targets as never}
      materials={MATERIALS}
      locations={LOCATIONS}
      today="2027-01-15"
      locale="en"
      messages={en}
      admin={admin}
      {...list}
    />,
  );

describe("SafetyStockScreen", () => {
  it("heads the list with the one h1 and Add target, then each target's state from the tone map", () => {
    renderScreen([target("2026-12-01"), target("2027-01-01"), target("2027-02-01")]);

    const header = screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]") as HTMLElement;
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Safety stock — Test");
    expect(within(header).getByText(/2027-01-15/)).toBeTruthy();
    expect(within(header).getByRole("button", { name: "Add target" })).toBeTruthy();
    const badges = screen.getAllByRole("row").slice(1).map((row) => {
      const badge = row.querySelector("[data-slot=status-badge]") as HTMLElement;
      return [badge.textContent, badge.dataset.tone];
    });
    expect(badges).toEqual([
      ["Superseded", "neutral"],
      ["In effect", "success"],
      ["Scheduled", "neutral"],
    ]);
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells[2].className).toMatch(/\bwhitespace-nowrap\b/);
    expect(cells[3].className).toMatch(/\btext-right tabular-nums\b/);
  });

  it("offers Add target only the active locations, as autocomplete choices (LFC-019, #222)", () => {
    render(
      <SafetyStockScreen tenant={TENANT} targets={[]} materials={MATERIALS} locations={[...LOCATIONS, ]} today="2027-01-15" locale="en" messages={en} admin {...LIST} />,
    );

    expect(dialog).toHaveBeenCalledWith(expect.objectContaining({ locations: [{ value: "00000001", code: "00000001", name: "Main plant" }] }));
  });

  it("tells a reader whom to ask when there are no targets", () => {
    renderScreen([], false);

    expect(screen.getByText("Ask an administrator to add safety-stock targets.")).toBeTruthy();
    expect(screen.queryAllByRole("button").map((button) => button.textContent)).toEqual(["Search"]);
  });

  it("searches above the list, sorts by every column but the decimal target, and marks the matches (#217)", () => {
    renderScreen([target("2027-01-01")], false, { search: { q: "0005 main", typed: "0005 main" }, sort: { sort: "status", dir: "desc" } });

    expect(screen.getByRole("searchbox", { name: "Search safety stock" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("1 result for “0005 main” · Clear search");
    expect(screen.getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/admin/test/safety-stock?sort=status&dir=desc");
    expect(screen.getAllByRole("columnheader").map((header) => header.getAttribute("aria-sort"))).toEqual(["none", "none", "none", null, "descending"]);
    expect(screen.getByRole("link", { name: "Effective from" }).getAttribute("href")).toBe("/admin/test/safety-stock?q=0005+main&sort=effectiveFrom&dir=asc");
    expect([...document.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual(["0005", "Main"]);
  });

  it("says when nothing matches, with the way back to the whole list (#217)", () => {
    renderScreen([], false, { search: { q: "brass", typed: "brass" }, sort: LIST.sort });

    expect(screen.getByRole("cell").textContent).toBe("Nothing matches “brass”. Clear search");
  });
});
