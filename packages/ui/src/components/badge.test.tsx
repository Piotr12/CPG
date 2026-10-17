import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders a span with the default variant", () => {
    render(<Badge className="extra">new</Badge>);

    const badge = screen.getByText("new");
    expect(badge.tagName).toBe("SPAN");
    expect(badge.dataset).toMatchObject({ slot: "badge", variant: "default" });
    expect(badge.className).toContain("bg-primary");
    expect(badge.className).toContain("extra");
  });

  it("applies the chosen variant", () => {
    render(<Badge variant="destructive">late</Badge>);

    const badge = screen.getByText("late");
    expect(badge.dataset.variant).toBe("destructive");
    expect(badge.className).toContain("text-destructive");
  });

  it("renders its child instead of a span with asChild", () => {
    render(
      <Badge asChild>
        <a href="/orders">orders</a>
      </Badge>,
    );

    const link = screen.getByRole("link", { name: "orders" });
    expect(link.dataset.slot).toBe("badge");
  });
});
