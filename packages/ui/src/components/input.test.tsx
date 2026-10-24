import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./input";

describe("Input", () => {
  it("renders an input with its type, props and extra classes", () => {
    render(<Input type="password" name="password" aria-label="Password" className="extra" />);

    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input.type).toBe("password");
    expect(input.name).toBe("password");
    expect(input.dataset.slot).toBe("input");
    expect(input.className).toContain("border-input");
    expect(input.className).toContain("extra");
    expect(input.className.split(" ")).toEqual(expect.arrayContaining([...["focus-visible:ring-2", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "focus-visible:ring-offset-background"], ...["aria-invalid:border-danger-edge", "aria-invalid:ring-2", "aria-invalid:ring-danger-edge", "aria-invalid:focus-visible:ring-ring"], "rounded-md", "px-3"]));
    // --input is an opaque boundary colour now, never a fill.
    expect(input.className).not.toMatch(/bg-input|ring-ring\/|ring-3/);
  });
});
