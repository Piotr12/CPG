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
    expect(box.className.split(" ")).toEqual(expect.arrayContaining([...["focus-visible:ring-2", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "focus-visible:ring-offset-background"], ...["aria-invalid:border-danger-edge", "aria-invalid:ring-2", "aria-invalid:ring-danger-edge", "aria-invalid:focus-visible:ring-ring"], "rounded-sm"]));
    expect(box.className).not.toMatch(/bg-input|rounded-\[|ring-ring\//);
    expect(box.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(box);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(box.querySelector("[data-slot=checkbox-indicator]")).toBeTruthy();
  });

  it("submits its value with a plain form only while checked", () => {
    render(
      <form aria-label="filters">
        <Checkbox id="zero" name="includeZero" value="true" />
        <label htmlFor="zero">Show zero</label>
      </form>,
    );
    const form = screen.getByRole("form", { name: "filters" }) as HTMLFormElement;
    expect(new FormData(form).get("includeZero")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "Show zero" }));
    expect(new FormData(form).get("includeZero")).toBe("true");
  });
});
