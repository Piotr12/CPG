import { render, screen } from "@testing-library/react";
import { CircleCheck, Info, Lock, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StatusTone } from "./status-badge";
import { CALLOUT_TONES, Callout } from "./callout";

/** The markup of a Lucide icon, to tell which one a callout drew. */
const iconMarkup = (Icon: LucideIcon) => renderToStaticMarkup(<Icon aria-hidden="true" />).match(/lucide-[a-z0-9-]+/)![0];

describe("Callout", () => {
  it("is a note by default: icon, body and nothing else", () => {
    render(<Callout tone="neutral">Stock is checked when a completion is posted.</Callout>);

    const callout = screen.getByRole("note");
    expect(callout.dataset).toMatchObject({ slot: "callout", tone: "neutral" });
    expect(callout.className.split(" ")).toEqual(expect.arrayContaining(["flex", "gap-2", "rounded-md", "border", "p-4"]));
    const icon = callout.querySelector("svg")!;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect([...icon.classList]).toEqual(expect.arrayContaining(["size-4", "shrink-0", "text-neutral-tone"]));
    const body = screen.getByText("Stock is checked when a completion is posted.");
    expect([...body.classList]).toEqual(["max-w-prose", "text-sm", "text-foreground"]);
    expect(callout.querySelectorAll("p")).toHaveLength(0);
  });

  it.each<[StatusTone, string, string, LucideIcon]>([
    ["neutral", "bg-neutral-surface border-neutral-edge", "text-neutral-tone", Info],
    ["success", "bg-success-surface border-success-edge", "text-success", CircleCheck],
    ["warning", "bg-warning-surface border-warning-edge", "text-warning", TriangleAlert],
    ["danger", "bg-danger-surface border-danger-edge", "text-danger", OctagonAlert],
  ])("paints the %s tone with complete class names and its default icon", (tone, box, iconColour, Icon) => {
    expect(CALLOUT_TONES[tone]).toEqual({ box, icon: iconColour, defaultIcon: Icon });
    render(<Callout tone={tone}>Body</Callout>);

    const callout = screen.getByRole("note");
    expect(callout.className.split(" ")).toEqual(expect.arrayContaining(box.split(" ")));
    expect(callout.querySelector("svg")!.classList).toContain(iconColour);
    expect(callout.querySelector("svg")!.classList).toContain(iconMarkup(Icon));
  });

  it("takes a title, actions, another role and another icon", () => {
    render(
      <Callout tone="success" role="status" title="Material saved." icon={Lock} actions={<button>Open material</button>}>
        It is active.
      </Callout>,
    );

    const callout = screen.getByRole("status");
    expect(screen.getByText("Material saved.").className).toBe("text-sm font-medium text-foreground");
    expect(screen.getByRole("button", { name: "Open material" }).parentElement!.className).toBe("flex flex-wrap gap-2");
    expect(callout.querySelector("svg")!.classList).toContain(iconMarkup(Lock));
    expect(callout.textContent).toBe("Material saved.It is active.Open material");
  });

  it("is an alert only when asked", () => {
    render(<Callout tone="warning" role="alert">Accept the shortage first.</Callout>);

    expect(screen.getByRole("alert").textContent).toBe("Accept the shortage first.");
  });
});
