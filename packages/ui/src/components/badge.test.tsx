import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge, badgeVariants } from "./badge";

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
    // The danger tone on tokens, no alpha fills.
    expect(badge.className.split(" ")).toEqual(expect.arrayContaining(["border-danger-edge", "bg-danger-surface", "[a]:hover:border-danger"]));
    expect(badge.className).not.toMatch(/destructive\//);
  });

  it("focuses with the opaque ring in every variant", () => {
    render(<Badge variant="destructive">late</Badge>);

    const classes = screen.getByText("late").className.split(" ");
    expect(classes).toEqual(expect.arrayContaining(["focus-visible:ring-2", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "focus-visible:ring-offset-background"]));
    expect(classes.filter((name) => /ring-\[3px\]|ring-ring\/|focus-visible:ring-destructive/.test(name))).toEqual([]);
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

  it("is a square-cornered 20 px category tag with 14 px icons", () => {
    const classes = badgeVariants().split(" ");
    expect(classes).toEqual(expect.arrayContaining(["rounded-sm", "h-5", "px-1.5", "text-xs", "font-medium", "[&>svg]:size-3.5!"]));
    expect(classes).not.toContain("rounded-4xl");
    expect(classes).not.toContain("px-2");
  });

  it("styles secondary and outline as quiet tags and hovers without opacity", () => {
    expect(badgeVariants({ variant: "secondary" }).split(" ")).toEqual(expect.arrayContaining(["bg-muted", "text-foreground"]));
    expect(badgeVariants({ variant: "outline" }).split(" ")).toEqual(expect.arrayContaining(["border-border", "bg-transparent", "text-foreground"]));
    expect(badgeVariants({ variant: "default" })).toContain("[a]:hover:bg-primary-hover");
    for (const variant of ["default", "secondary", "destructive", "outline"] as const) {
      expect(badgeVariants({ variant })).not.toMatch(/hover:[^ ]*\/\d+/);
    }
  });
});
