import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";

describe("Collapsible", () => {
  it("shows and hides its content from the trigger", () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>toggle</CollapsibleTrigger>
        <CollapsibleContent>inside</CollapsibleContent>
      </Collapsible>,
    );
    const trigger = screen.getByRole("button", { name: "toggle" });
    expect(trigger.dataset.slot).toBe("collapsible-trigger");
    expect(trigger.closest("[data-slot=collapsible]")).not.toBeNull();
    expect(screen.queryByText("inside")).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByText("inside").dataset.slot).toBe("collapsible-content");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});
