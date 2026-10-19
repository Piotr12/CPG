import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("introduces the app", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Caveman Planning Good" })).toBeTruthy();
  });

  it("lists the four MRP II steps in order, numbered", () => {
    render(<HomePage />);

    const steps = screen.getAllByRole("listitem");
    expect(steps.map((step) => step.querySelector("h2")?.textContent)).toEqual([
      "Demand Forecast",
      "Bill of Materials",
      "Production Planning",
      "Production Execution",
    ]);
    expect(steps.map((step) => step.querySelector("p")?.textContent)).toEqual(["01", "02", "03", "04"]);
  });

  it("leaves the footer to the layout: its tagline is a plain paragraph", () => {
    render(<HomePage />);

    expect(screen.getByText("Demand come. Caveman plan. Caveman make.").tagName).toBe("P");
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });
});
