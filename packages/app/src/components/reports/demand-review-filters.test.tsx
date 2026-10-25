import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StatisticalFactorView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { demandView } from "./demand-review-fixture";
import { DemandReviewFilters, productOptions, unitRule } from "./demand-review-filters";

const t = en.demandReview;
const widget: StatisticalFactorView = { id: "00000001", description: "Widget", active: true, baseUnit: "each", perBaseUnit: "1.5", otherUnits: [] };
const gadget: StatisticalFactorView = { id: "00000002", description: "Gadget", active: false, baseUnit: "box", perBaseUnit: null, otherUnits: [] };
const plant = { id: "00000001", name: "Plant", active: true, createdAt: new Date(), version: 1 };
const depot = { ...plant, id: "00000002", name: "Depot", active: false };

describe("productOptions", () => {
  it("shows each product's SU factor, or that it has none, and marks an inactive one", () => {
    expect(productOptions([widget, gadget], t)).toEqual([
      { value: "00000001", code: "00000001", name: "Widget", detail: "1 each = 1.5 SU" },
      { value: "00000002", code: "00000002", name: "Gadget", detail: "No SU factor", inactive: true },
    ]);
  });
});

describe("unitRule", () => {
  it("says several products are shown in SU, and which units one product would allow", () => {
    expect(unitRule(demandView(), 10, "en", t)).toBe(
      "10 finished products are shown together, so quantities are in statistical units (SU). Choose one product to see it in each or pallet.",
    );
    expect(unitRule(demandView({ materials: ["00000001", "00000002"], disabledUnits: ["box", "each", "pallet"] }), 10, "pl", pl.demandReview)).toBe(
      "2 wyroby gotowe są pokazane razem, więc ilości są w jednostkach statystycznych (SU). Wybierz jeden wyrób, aby zobaczyć go w jednostce box, each lub pallet.",
    );
  });

  it("leaves out the second sentence when no other unit exists, and names one product's units", () => {
    expect(unitRule(demandView({ disabledUnits: [] }), 5, "en", t)).toBe("5 finished products are shown together, so quantities are in statistical units (SU).");
    expect(unitRule(demandView({ materials: ["00000001"], units: ["each", "pallet", "SU"] }), 10, "en", t)).toBe(
      "One product is selected, so any of its units can be shown: each, pallet, SU.",
    );
  });
});

describe("DemandReviewFilters", () => {
  const renderForm = (products = [widget, gadget], view = demandView()) =>
    render(<DemandReviewFilters action="/admin/test/reports/demand-review" view={view} products={products} locations={[plant, depot]} locale="en" labels={t} />);

  it("is a GET form of the bucket, locations, products and unit, never carrying the offset", () => {
    renderForm(undefined, demandView({ offset: 2, materials: ["00000001"], locations: ["00000002"] }));
    const form = screen.getByRole("form", { name: t.filterForm });
    expect(form.getAttribute("action")).toBe("/admin/test/reports/demand-review");
    expect(form.querySelector("[name=offset]")).toBeNull();
    const bucket = within(screen.getByRole("radiogroup", { name: t.bucket }));
    expect((bucket.getByRole("radio", { name: "Week" }) as HTMLInputElement).checked).toBe(true);
    const unit = within(screen.getByRole("radiogroup", { name: t.unit }));
    expect(unit.getAllByRole("radio").map((radio) => [(radio as HTMLInputElement).value, (radio as HTMLInputElement).disabled])).toEqual([
      ["SU", false], ["each", true], ["pallet", true],
    ]);
    const submitted = new FormData(form as HTMLFormElement);
    expect([submitted.getAll("material"), submitted.getAll("location"), submitted.get("bucket"), submitted.get("unit")]).toEqual([["00000001"], ["00000002"], "week", "SU"]);
    expect(screen.getByRole("link", { name: t.clear }).getAttribute("href")).toBe("/admin/test/reports/demand-review");
    expect((screen.getByRole("button", { name: t.apply }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables every control when the tenant has no finished product", () => {
    renderForm([]);
    expect((screen.getByRole("button", { name: t.apply }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole("radio").every((radio) => (radio as HTMLInputElement).disabled)).toBe(true);
  });
});
