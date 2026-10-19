import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Label } from "./label";

describe("Label", () => {
  it("labels its control and keeps extra classes", () => {
    render(
      <>
        <Label htmlFor="username" className="extra">
          Username
        </Label>
        <input id="username" />
      </>,
    );

    const label = screen.getByText("Username");
    expect(label.tagName).toBe("LABEL");
    expect(label.dataset.slot).toBe("label");
    expect(label.className).toContain("extra");
    expect(screen.getByLabelText("Username").id).toBe("username");
  });
});
