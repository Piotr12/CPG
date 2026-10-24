import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, buttonVariants } from "./button";

describe("Button", () => {
  it("renders a button with the default variant and size", () => {
    render(<Button type="submit">Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.dataset).toMatchObject({ slot: "button", variant: "default", size: "default" });
    expect(button.className).toContain("bg-primary");
  });

  it("applies the chosen variant, size and extra classes", () => {
    render(
      <Button variant="outline" size="lg" className="w-full">
        Cancel
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button.dataset).toMatchObject({ variant: "outline", size: "lg" });
    expect(button.className).toContain("h-9");
    expect(button.className).toContain("w-full");
  });

  it("renders its child instead of a button with asChild", () => {
    render(
      <Button asChild>
        <a href="https://example.com/">Example</a>
      </Button>,
    );

    expect(screen.getByRole("link", { name: "Example" }).dataset.slot).toBe("button");
  });

  it("hovers and presses on explicit tokens and focuses with the opaque ring", () => {
    const classes = (variant: "default" | "secondary" | "destructive") => buttonVariants({ variant }).split(" ");
    expect(classes("default")).toEqual(expect.arrayContaining(["hover:bg-primary-hover", "active:bg-primary-active", ...["focus-visible:ring-2", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "focus-visible:ring-offset-background"]]));
    expect(classes("secondary")).toContain("hover:bg-secondary-hover");
    expect(classes("default").join(" ")).not.toMatch(/hover:bg-primary\/|color-mix|ring-ring\/|ring-3/);
    // No variant swaps the ring for a translucent one.
    expect(classes("destructive").join(" ")).not.toMatch(/focus-visible:ring-destructive/);
    expect(classes("default")).toEqual(expect.arrayContaining(["aria-invalid:border-danger"]));
  });

  it("exposes the variant classes for non-button elements", () => {
    expect(buttonVariants({ variant: "ghost", size: "icon" })).toContain("size-8");
  });
});
