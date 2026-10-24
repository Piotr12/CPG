import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MammothMark } from "./mammoth-mark";

/** Every `<path>`'s `d` and `fill` in `app/icon.svg`, in order. */
function iconPaths(): [string, string][] {
  const svg = readFileSync(path.join(import.meta.dirname, "../../app/icon.svg"), "utf8");
  return [...svg.matchAll(/<path\b[^>]*>/g)].map(([tag]) => [tag.match(/\bd="([^"]+)"/)![1]!, tag.match(/\bfill="([^"]+)"/)![1]!]);
}

describe("MammothMark", () => {
  it("draws exactly the paths and fills of icon.svg, in order", () => {
    const expected = iconPaths();
    expect(expected).toHaveLength(7);
    expect(new Set(expected.map(([, fill]) => fill))).toEqual(new Set(["#6D4534", "#A56953", "#1C1C1C", "#FFDEA7"]));

    const { container } = render(<MammothMark size={20} />);
    const drawn = [...container.querySelectorAll("path")].map((element) => [element.getAttribute("d"), element.getAttribute("fill")]);
    expect(drawn).toEqual(expected);
  });

  it.each([16, 20, 40] as const)("is a decorative %s px square on the icon's viewBox", (size) => {
    const { container } = render(<MammothMark size={size} />);

    const svg = container.querySelector("svg")!;
    expect(svg.dataset.slot).toBe("mammoth-mark");
    expect(svg.getAttribute("viewBox")).toBe("0 0 32 32");
    expect(svg.getAttribute("width")).toBe(String(size));
    expect(svg.getAttribute("height")).toBe(String(size));
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.getAttribute("class")).toBe("shrink-0");
  });

  it("passes a className through", () => {
    const { container } = render(<MammothMark size={40} className="mx-auto" />);

    expect(container.querySelector("svg")!.getAttribute("class")).toBe("shrink-0 mx-auto");
  });
});
