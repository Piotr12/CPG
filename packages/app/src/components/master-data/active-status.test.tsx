import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActiveStatus, InactiveMark } from "./active-status";

const labels = { active: "Active", inactive: "Inactive" };

describe("ActiveStatus", () => {
  it("shows Active as a quiet solid badge and Inactive as a quiet dashed one, each with its icon", () => {
    const { rerender } = render(<ActiveStatus active labels={labels} />);
    const active = screen.getByText("Active");
    expect([active.dataset.slot, active.dataset.tone]).toEqual(["status-badge", "neutral"]);
    expect(active.className).not.toContain("border-dashed");
    expect(active.querySelector("svg.lucide-circle")).toBeTruthy();

    rerender(<ActiveStatus active={false} labels={labels} />);
    const inactive = screen.getByText("Inactive");
    expect(inactive.dataset.tone).toBe("neutral");
    expect(inactive.className).toContain("border-dashed");
    expect(inactive.querySelector("svg.lucide-circle-off")).toBeTruthy();
  });
});

describe("InactiveMark", () => {
  it("marks only an inactive reference", () => {
    const { rerender, container } = render(<InactiveMark active label="Inactive" />);
    expect(container.textContent).toBe("");

    rerender(<InactiveMark active={false} label="Nieaktywny" />);
    expect(screen.getByText("Nieaktywny").dataset.tone).toBe("neutral");
  });
});
