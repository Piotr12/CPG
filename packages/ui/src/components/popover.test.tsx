import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./popover";

describe("Popover", () => {
  it("opens from its trigger and renders every part with its slot", () => {
    render(
      <Popover>
        <PopoverAnchor className="an">anchor</PopoverAnchor>
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent className="ct" aria-label="panel">
          <PopoverHeader className="hd">
            <PopoverTitle className="tt">title</PopoverTitle>
            <PopoverDescription className="ds">description</PopoverDescription>
          </PopoverHeader>
          <button type="button">inside</button>
        </PopoverContent>
      </Popover>,
    );

    expect(screen.getByText("anchor").dataset.slot).toBe("popover-anchor");
    const trigger = screen.getByText("open");
    expect(trigger.dataset.slot).toBe("popover-trigger");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);

    const content = screen.getByRole("dialog", { name: "panel" });
    expect(content.dataset.slot).toBe("popover-content");
    expect(content.classList).toContain("ct");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("title").dataset.slot).toBe("popover-title");
    expect(screen.getByText("description").dataset.slot).toBe("popover-description");
    expect(screen.getByText("title").parentElement!.dataset.slot).toBe("popover-header");
    expect(screen.getByRole("button", { name: "inside" })).toBeTruthy();
  });

  it("closes on Escape and gives focus back to its trigger", async () => {
    render(
      <Popover>
        <PopoverTrigger>open</PopoverTrigger>
        <PopoverContent aria-label="panel" align="end">
          content
        </PopoverContent>
      </Popover>,
    );
    const trigger = screen.getByText("open");

    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    // Radix moves focus back once the content has unmounted.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
