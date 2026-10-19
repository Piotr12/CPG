import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Separator } from "./separator";

describe("Separator", () => {
  it("is decorative and horizontal by default, and can be vertical and semantic", () => {
    const { container } = render(
      <>
        <Separator className="sp" />
        <Separator orientation="vertical" decorative={false} />
      </>,
    );
    const [horizontal, vertical] = container.querySelectorAll<HTMLElement>("[data-slot=separator]");
    expect(horizontal.getAttribute("role")).toBe("none");
    expect(horizontal.dataset.orientation).toBe("horizontal");
    expect(horizontal.classList).toContain("sp");
    expect(vertical.getAttribute("role")).toBe("separator");
    expect(vertical.getAttribute("aria-orientation")).toBe("vertical");
  });
});
