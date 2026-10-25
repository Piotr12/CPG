import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DemandReviewView, StatisticalFactorView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { demandView, figures } from "./demand-review-fixture";
import { DemandReviewScreen } from "./demand-review-screen";

const t = en.demandReview;
const widget: StatisticalFactorView = { id: "00000001", description: "Widget", active: true, baseUnit: "each", perBaseUnit: "1.5", otherUnits: [] };
const gadget: StatisticalFactorView = { id: "00000002", description: "Gadget", active: false, baseUnit: "box", perBaseUnit: null, otherUnits: [] };
const plant = { id: "00000001", name: "Plant", active: true, createdAt: new Date(), version: 1 };
const depot = { ...plant, id: "00000002", name: "Depot", active: false };
const renderScreen = (view: DemandReviewView = demandView(), { products = [widget, gadget], refused = false } = {}) =>
  render(<DemandReviewScreen tenant={{ code: "test", name: "Test" }} view={view} products={products} locations={[plant, depot]} refused={refused} locale="en" messages={en} />);
const grid = () => within(screen.getByRole("table", { name: "Shipped and still to ship per product and week" }));
const href = (name: string) => new URL(screen.getByRole("link", { name }).getAttribute("href")!, "http://cpg.test");

describe("DemandReviewScreen", () => {
  it("heads the review with the bucket and today, then the chart in the report unit with its two totals", () => {
    renderScreen();
    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual(["Demand review — Test"]);
    expect(screen.getByText(/per week\. Today is 2026-10-25;/)).toBeTruthy();
    expect(screen.getByText("Shipped and still to ship per week, in SU")).toBeTruthy();
    expect(document.querySelector("[data-headline]")!.textContent).toBe("Last 13 weeks: 12.5 SU shipped · this week and the next 13: 203 SU to ship");
    expect(screen.getByRole("img", { name: /^Shipped and still to ship per week, in SU\. Past columns/ })).toBeTruthy();
    expect(screen.getByText("Open customer orders (overdue ones due today)")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("names the products left out of SU, linking to their factors", () => {
    renderScreen();
    expect(screen.getByText("Left out: 00000002 — Gadget (Inactive) have no SU factor yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: t.excludedLink }).getAttribute("href")).toBe("/admin/test/statistical-units");
  });

  it("moves the window with Earlier and Later, keeping every filter, and hides the link at the limit", () => {
    renderScreen(demandView({ materials: ["00000001", "00000002"], locations: ["00000001"], offset: 0 }));
    const earlier = href(t.earlierLabel);
    expect(earlier.pathname).toBe("/admin/test/reports/demand-review");
    expect([...earlier.searchParams]).toEqual([["bucket", "week"], ["material", "00000001"], ["material", "00000002"], ["location", "00000001"], ["unit", "SU"], ["offset", "-1"]]);
    expect(href(t.laterLabel).searchParams.get("offset")).toBe("1");
  });

  it("says the window moved, and hides Later at the latest window", () => {
    renderScreen(demandView({ offset: 20 }));
    expect(document.querySelector("[data-headline]")!.textContent).toBe("In this window: 12.5 SU shipped · 203 SU still to ship");
    expect(screen.queryByRole("link", { name: t.laterLabel })).toBeNull();
    expect(href(t.earlierLabel).searchParams.get("offset")).toBe("19");
  });

  it("drops the offset from the link back to today's window", () => {
    renderScreen(demandView({ offset: 1 }));
    expect(href(t.earlierLabel).searchParams.has("offset")).toBe(false);
  });

  it("draws no Today rule when the window doesn't hold today", () => {
    const later = demandView({ offset: 3 }).buckets.map((bucket) => ({ ...bucket, past: false, current: false }));
    renderScreen(demandView({ offset: 3, buckets: later }));
    expect(document.querySelector("[data-headline]")!.textContent).toBe("In this window: – SU shipped · 203 SU still to ship");
    expect(screen.queryByText(t.past)).toBeNull();
  });

  it("hides Earlier at the earliest window", () => {
    renderScreen(demandView({ offset: -20 }));
    expect(screen.queryByRole("link", { name: t.earlierLabel })).toBeNull();
  });

  it("lists products in the grid by ID and name, with the omitted rows counted", () => {
    renderScreen(demandView({ omittedRows: 2 }));
    expect(grid().getByRole("button", { name: "Details of 00000001 — Widget" })).toBeTruthy();
    expect(screen.getByText("1 product · SU per week · tinted columns are shipped, white ones still to ship")).toBeTruthy();
    expect(screen.getByText("2 rows with nothing in this window are not shown.")).toBeTruthy();
    expect(grid().getAllByRole("columnheader")[0].textContent).toBe("Product");
  });

  it("lists one product's locations, keeping an unknown key as it is", () => {
    const row = [figures({ shipped: 1 }), figures(), figures()];
    renderScreen(demandView({ materials: ["00000001"], unit: "each", excluded: [], rows: [{ key: "00000002", figures: row }, { key: "00000009", figures: row }] }));
    expect(grid().getAllByRole("columnheader")[0].textContent).toBe("Location");
    expect(grid().getByRole("button", { name: "Details of 00000002 — Depot (Inactive)" })).toBeTruthy();
    expect(grid().getByRole("button", { name: "Details of 00000009" })).toBeTruthy();
    expect(screen.getByText("2 locations · each per week · tinted columns are shipped, white ones still to ship")).toBeTruthy();
    expect(screen.queryByText(/Left out/)).toBeNull();
    expect(document.querySelector("[data-omitted]")).toBeNull();
  });

  it("names a left-out product by its ID when it isn't listed", () => {
    renderScreen(demandView({ excluded: [{ material: "00000099", code: "NO_STATISTICAL_FACTOR" }] }));
    expect(screen.getByText("Left out: 00000099 have no SU factor yet.")).toBeTruthy();
  });

  it("makes way for an empty state when every chosen product lacks an SU factor", () => {
    renderScreen(demandView({ materials: ["00000002"], rows: [] }));
    expect(screen.getByText(t.allExcluded)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("link", { name: t.excludedLink }).getAttribute("href")).toBe("/admin/test/statistical-units");
  });

  it("sends a tenant with no finished product to Materials", () => {
    renderScreen(demandView({ excluded: [], rows: [] }), { products: [] });
    expect(screen.getByText(t.noProducts)).toBeTruthy();
    expect(screen.getByRole("link", { name: t.noProductsLink }).getAttribute("href")).toBe("/admin/test/materials");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("explains a refused product above the form", () => {
    renderScreen(demandView(), { refused: true });
    expect(screen.getByText(t.finishedOnly)).toBeTruthy();
  });
});
