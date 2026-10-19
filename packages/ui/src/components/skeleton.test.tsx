import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("renders a pulsing placeholder with its slot and the caller's classes", () => {
    const { container } = render(<Skeleton className="h-4" aria-hidden />);
    const skeleton = container.firstElementChild as HTMLElement;
    expect(skeleton.dataset.slot).toBe("skeleton");
    expect(skeleton.classList).toContain("animate-pulse");
    expect(skeleton.classList).toContain("h-4");
  });
});
