import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fieldControls } from "./field-controls";

const format = (message: string) => `E: ${message}`;

describe("fieldControls", () => {
  it("shows a field's formatted message under it and ties it to the control", () => {
    const { control } = fieldControls("f", { quantity: ["bad", "worse"] }, format);
    const quantity = control("quantity", "a hint");

    render(<>{quantity.node}</>);

    expect(screen.getByText("E: bad").id).toBe("f-quantity-note");
    expect(screen.queryByText("a hint")).toBeNull();
    expect(quantity.props).toEqual({ id: "f-quantity", name: "quantity", "aria-invalid": true, "aria-describedby": "f-quantity-note" });
  });

  it("shows the hint when the field has no error, and nothing when it has neither", () => {
    const { control, note } = fieldControls("f", {}, format);
    const hinted = control("date", "pick one");

    render(<>{hinted.node}</>);

    expect(screen.getByText("pick one").id).toBe("f-date-note");
    expect(hinted.props["aria-invalid"]).toBeUndefined();
    expect(hinted.props["aria-describedby"]).toBe("f-date-note");
    expect(note("other")).toEqual({ node: null });
    expect(control("other").props["aria-describedby"]).toBeUndefined();
  });
});
