import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

beforeAll(() => {
  // Radix positions tooltips with ResizeObserver, which jsdom doesn't have.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("Tooltip", () => {
  it("shows its content when the trigger gets focus", async () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>hover me</TooltipTrigger>
          <TooltipContent className="tc">the tip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole("button", { name: "hover me" });
    expect(trigger.dataset.slot).toBe("tooltip-trigger");

    await act(async () => fireEvent.focus(trigger));

    const content = document.querySelector<HTMLElement>("[data-slot=tooltip-content]")!;
    expect(content.classList).toContain("tc");
    expect(screen.getByRole("tooltip").textContent).toBe("the tip");
  });
});
