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

  it("opens a destructive flow in the soft danger tone, hovering on the border", () => {
    const classes = buttonVariants({ variant: "destructive" }).split(" ");
    expect(classes).toEqual(expect.arrayContaining(["text-danger", "bg-danger-surface", "border-danger-edge", "hover:border-danger"]));
    expect(classes.join(" ")).not.toMatch(/destructive\/|hover:bg-/);
  });

  it("confirms in solid danger, darkening on hover in both themes", () => {
    render(<Button variant="destructive-solid">Reset Test</Button>);

    const button = screen.getByRole("button", { name: "Reset Test" });
    expect(button.dataset.variant).toBe("destructive-solid");
    expect(button.className.split(" ")).toEqual(
      expect.arrayContaining(["bg-danger-solid", "text-danger-solid-foreground", "hover:bg-danger-solid-hover"]),
    );
    expect(button.className).not.toMatch(/text-white/);
  });

  it("underlines a link in the foreground colour", () => {
    const classes = buttonVariants({ variant: "link" }).split(" ");
    expect(classes).toEqual(expect.arrayContaining(["text-foreground", "underline", "underline-offset-4"]));
    expect(classes).not.toContain("text-primary");
  });

  it("keeps an outline button opaque in both themes", () => {
    const classes = buttonVariants({ variant: "outline" }).split(" ");
    expect(classes).toEqual(expect.arrayContaining(["border-border", "bg-background", "hover:bg-muted"]));
    expect(classes.join(" ")).not.toMatch(/input/);
  });

  it.each([
    ["xs", "h-6"],
    ["sm", "h-7"],
    ["default", "h-8"],
    ["lg", "h-9"],
  ] as const)("keeps the %s height on the 8 px radius, without moving when pressed", (size, height) => {
    const classes = buttonVariants({ size }).split(" ");
    expect(classes).toEqual(expect.arrayContaining([height, "rounded-md"]));
    expect(classes.join(" ")).not.toMatch(/rounded-\[|rounded-lg|translate-y|text-\[|px-2\.5/);
  });

  it("sets small text in the caption step and pads controls by 12 px", () => {
    expect(buttonVariants({ size: "sm" }).split(" ")).toEqual(expect.arrayContaining(["text-xs", "px-3"]));
    expect(buttonVariants({ size: "default" })).toContain("px-3");
    expect(buttonVariants({ size: "lg" })).toContain("px-3");
    for (const size of ["icon-xs", "icon-sm"] as const) expect(buttonVariants({ size })).toContain("rounded-md");
  });
});
