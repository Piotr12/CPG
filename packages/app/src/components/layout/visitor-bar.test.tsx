import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VisitorBar } from "./visitor-bar";

const mocks = vi.hoisted(() => ({ pathname: "/help" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));

const labels = { menu: "Menu", help: "Pomoc", signIn: "Zaloguj się" };

describe("VisitorBar", () => {
  it("offers a visitor the homepage, Help and Sign in, in the visitor's language, and marks the open one", () => {
    render(<VisitorBar locale="pl" labels={labels} />);

    const bar = screen.getByRole("banner");
    expect(bar.getAttribute("lang")).toBe("pl");
    expect(bar.dataset.visitorBar).toBeDefined();
    const brand = within(bar).getByRole("link", { name: "CPG" });
    expect(brand.getAttribute("href")).toBe("/");
    // The mammoth mark at 20 px beside the name, not an emoji.
    expect(brand.querySelector("svg[data-slot=mammoth-mark]")!.getAttribute("width")).toBe("20");
    expect(brand.textContent).toBe("CPG");
    const nav = within(screen.getByRole("navigation", { name: "Menu" }));
    expect(nav.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href"), link.getAttribute("aria-current")])).toEqual([
      ["Pomoc", "/help", "page"],
      ["Zaloguj się", "/login", null],
    ]);
    const help = nav.getByRole("link", { name: "Pomoc" });
    expect(help.className).toContain("py-2");
    expect(help.className).toContain("aria-[current=page]:underline-offset-4");
  });

  it("marks Sign in on the sign-in page", () => {
    mocks.pathname = "/login";
    render(<VisitorBar locale="en" labels={labels} />);
    expect(screen.getByRole("link", { name: "Zaloguj się" }).getAttribute("aria-current")).toBe("page");
  });
});
