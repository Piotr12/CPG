import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { Checkbox } from "./checkbox";

beforeAll(() => {
  // Radix sizes the checkbox's hidden form input with ResizeObserver, which jsdom doesn't have.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("Checkbox", () => {
  it("toggles, keeps extra classes and submits its value with a form while checked", () => {
    render(
      <form aria-label="filters">
        <Checkbox id="zero" name="includeZero" value="true" className="extra" />
        <label htmlFor="zero">Show zero</label>
      </form>,
    );

    const box = screen.getByRole("checkbox", { name: "Show zero" });
    expect(box.dataset.slot).toBe("checkbox");
    expect(box.className).toContain("extra");
    const form = screen.getByRole("form", { name: "filters" }) as HTMLFormElement;
    expect(new FormData(form).get("includeZero")).toBeNull();

    fireEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector("[data-slot=checkbox-indicator]")).not.toBeNull();
    expect(new FormData(form).get("includeZero")).toBe("true");
  });
});
