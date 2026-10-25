import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartLegend, type ChartLegendItem } from "./chart-legend";

const ITEMS: ChartLegendItem[] = [
  { label: "Shipped", series: 1 },
  { label: "Open customer orders (overdue ones due today)", series: 2 },
  { label: "Forecast not yet ordered", series: 3 },
  { label: "Ordered", series: "line" },
];

describe("ChartLegend", () => {
  it("lists each series as a swatch and its name, the name in a text token", () => {
    render(<ChartLegend items={ITEMS} />);

    const list = screen.getByRole("list");
    expect(list.dataset.slot).toBe("chart-legend");
    expect(list.className).toContain("text-muted-foreground");
    expect(list.className).not.toMatch(/chart-\d/);
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(ITEMS.map((item) => item.label));
    for (const item of items) {
      expect(item.querySelector("span")!.getAttribute("class")).toBeNull();
      expect(item.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("draws solid swatches in the series tokens, the third hatched, and the line with its dot", () => {
    render(<ChartLegend items={ITEMS} />);

    const swatches = screen.getAllByRole("listitem").map((item) => item.querySelector("svg")!);
    expect(swatches.map((swatch) => swatch.dataset.swatch)).toEqual(["solid", "solid", "hatched", "line"]);
    expect(swatches[0]!.querySelector("rect")!.getAttribute("class")).toBe("fill-chart-1");
    expect(swatches[1]!.querySelector("rect")!.getAttribute("class")).toBe("fill-chart-2");

    const hatched = swatches[2]!;
    expect(hatched.querySelector("rect")!.getAttribute("class")).toBe("fill-chart-3");
    expect(hatched.querySelector("rect")!.getAttribute("fill-opacity")).toBe("0.25");
    // Diagonal stripes rising left to right, as the chart's rotate(45) pattern draws them.
    expect(hatched.querySelector("path")!.getAttribute("d")).toBe("M-2 6L6 -2M-2 14L14 -2M6 14L14 6");
    expect(hatched.querySelector("path")!.getAttribute("class")).toBe("stroke-chart-3");

    const line = swatches[3]!;
    expect(line.querySelector("line")!.getAttribute("class")).toBe("stroke-foreground");
    expect(line.querySelector("line")!.getAttribute("stroke-opacity")).toBe("0.7");
    expect(line.querySelector("line")!.getAttribute("stroke-width")).toBe("1.5");
    const dot = line.querySelector("circle")!;
    expect([dot.getAttribute("cx"), dot.getAttribute("r"), dot.getAttribute("class")]).toEqual(["8", "2.5", "fill-foreground stroke-card"]);
  });
});
