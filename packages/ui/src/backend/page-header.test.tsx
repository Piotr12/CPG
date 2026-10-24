import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renders the page's one h1 and nothing it wasn't given", () => {
    const { container } = render(<PageHeader title="Materials — Test" />);

    const heading = screen.getByRole("heading", { level: 1, name: "Materials — Test" });
    expect(heading.className.split(" ")).toEqual(expect.arrayContaining(["text-2xl", "font-semibold", "tracking-tight"]));
    const header = container.firstElementChild as HTMLElement;
    expect(header.dataset.slot).toBe("page-header");
    expect(header.className.split(" ")).toEqual(
      expect.arrayContaining(["mb-6", "flex", "flex-col", "sm:flex-row", "sm:items-start", "sm:justify-between"]),
    );
    expect(header.querySelector("p")).toBeNull();
    expect(header.children).toHaveLength(1);
  });

  it("puts meta beside the title, the intro under it and the actions in their own row", () => {
    render(
      <PageHeader
        title={<span>Production order 00000060</span>}
        meta={<span>Open</span>}
        description="Plan, release and complete the order."
        actions={<button>Cancel order…</button>}
      />,
    );

    const heading = screen.getByRole("heading", { level: 1, name: "Production order 00000060" });
    expect(screen.getByText("Open").parentElement).toBe(heading.parentElement);
    expect(heading.parentElement!.className).toBe("flex min-w-0 flex-wrap items-center gap-2");
    expect(screen.getByText("Plan, release and complete the order.").className).toBe("max-w-prose text-sm text-muted-foreground");
    expect(screen.getByRole("button", { name: "Cancel order…" }).parentElement!.className).toBe("flex flex-wrap gap-2");
  });
});
