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
  });
});
