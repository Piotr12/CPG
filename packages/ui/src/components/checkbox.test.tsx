import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("is a labelled checkbox that toggles and reports its state", () => {
    const onCheckedChange = vi.fn();
    render(
      <label>
        <Checkbox onCheckedChange={onCheckedChange} className="extra" />
        Accept
      </label>,
    );
    const box = screen.getByRole("checkbox", { name: "Accept" });
    expect(box.getAttribute("data-slot")).toBe("checkbox");
    expect(box.className).toContain("extra");
    expect(box.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(box);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(box.querySelector("[data-slot=checkbox-indicator]")).toBeTruthy();
  });
});
