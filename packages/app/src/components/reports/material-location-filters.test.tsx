import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { MaterialLocationFilters } from "./material-location-filters";

const steel = { id: "00000001", type: "raw" as const, description: "Steel sheet", baseUnit: "kg", active: true, createdAt: new Date(), version: 1 };
const plant = { id: "00000003", name: "Main plant", active: false, createdAt: new Date(), version: 1 };
const labels = { material: "Material", location: "Location", all: "All", apply: "Apply", clear: "Clear filters", inactive: "Inactive" };
const renderForm = (selected: { material?: string; location?: string }, filtered: boolean, extra?: React.ReactNode) =>
  render(
    <MaterialLocationFilters action="/admin/test/mrp" selected={selected} filtered={filtered} materials={[steel]} locations={[plant]} labels={labels} lists={en.lists} locale="en">
      {extra}
    </MaterialLocationFilters>,
  );

describe("MaterialLocationFilters", () => {
  it("submits a material and a location to the report's own URL, showing the URL's choices", () => {
    const { container } = renderForm({ material: "00000001", location: "00000003" }, true);

    const form = container.querySelector("form")!;
    expect(form.getAttribute("action")).toBe("/admin/test/mrp");
    expect(new FormData(form).get("material")).toBe("00000001");
    expect(new FormData(form).get("location")).toBe("00000003");
    expect(screen.getByRole("button", { name: "Apply" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/admin/test/mrp");
  });

  it("offers no Clear filters, and no second row, while nothing is filtered and there are no extra controls", () => {
    const { container } = renderForm({}, false);

    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
    expect(container.querySelector(".sm\\:col-span-3")).toBeNull();
  });

  it("puts extra controls beside Clear filters", () => {
    renderForm({}, false, <span>Show rows that are all zero</span>);

    expect(screen.getByText("Show rows that are all zero").parentElement?.className).toContain("sm:col-span-3");
  });
});
