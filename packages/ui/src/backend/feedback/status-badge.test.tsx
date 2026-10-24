import { render, screen } from "@testing-library/react";
import { CircleCheck, CircleOff } from "lucide-react";
import { describe, expect, it } from "vitest";
import { STATUS_BADGE_TONES, StatusBadge, type StatusTone } from "./status-badge";

describe("StatusBadge", () => {
  it("shows the label after a hidden 14 px icon, in a 20 px tag", () => {
    render(<StatusBadge tone="success" icon={CircleCheck}>Completed</StatusBadge>);

    const badge = screen.getByText("Completed");
    expect(badge.dataset).toMatchObject({ slot: "status-badge", tone: "success" });
    expect(badge.className.split(" ")).toEqual(
      expect.arrayContaining(["inline-flex", "h-5", "gap-1", "rounded-sm", "border", "px-1.5", "text-xs", "font-medium", "whitespace-nowrap"]),
    );
    expect(badge.className).toContain("[&>svg]:size-3.5!");
    // The tone's border replaces the badge's transparent one.
    expect(badge.classList).not.toContain("border-transparent");
    expect(badge.className).not.toMatch(/bg-primary/);
    expect(badge.hasAttribute("data-variant")).toBe(false);
    expect(badge.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    expect(badge.textContent).toBe("Completed");
    expect(badge.classList).not.toContain("border-dashed");
  });

  it.each<[StatusTone, string[]]>([
    ["success", ["bg-success-surface", "text-success", "border-success-edge"]],
    ["warning", ["bg-warning-surface", "text-warning", "border-warning-edge"]],
    ["danger", ["bg-danger-surface", "text-danger", "border-danger-edge"]],
    ["neutral", ["bg-neutral-surface", "text-neutral-tone", "border-neutral-edge"]],
  ])("paints the %s tone with its complete class names", (tone, classes) => {
    expect(STATUS_BADGE_TONES[tone].split(" ")).toEqual(classes);
    render(<StatusBadge tone={tone} icon={CircleCheck}>State</StatusBadge>);
    expect(screen.getByText("State").className.split(" ")).toEqual(expect.arrayContaining(classes));
  });

  it("draws a dashed edge when asked", () => {
    render(<StatusBadge tone="neutral" icon={CircleOff} dashed>Inactive</StatusBadge>);

    expect(screen.getByText("Inactive").classList).toContain("border-dashed");
  });
});
