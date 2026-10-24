import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Highlight, highlightWords } from "./highlight";

const marks = (text: string, query?: string) =>
  [...render(<p>{Highlight({ text, query })}</p>).container.querySelectorAll("mark")].map((mark) => mark.textContent);

describe("highlightWords", () => {
  it("splits as the server does: at whitespace and LIKE's wildcards, lower-cased, without repeats", () => {
    expect(highlightWords(" Steel  M_8 steel ")).toEqual(["steel", "m", "8"]);
    expect(highlightWords(undefined)).toEqual([]);
  });
});

describe("Highlight", () => {
  it("returns the text unchanged without a search", () => {
    expect(Highlight({ text: "Steel sheet" })).toBe("Steel sheet");
    expect(Highlight({ text: "Steel sheet", query: "  " })).toBe("Steel sheet");
  });

  it("marks every occurrence of every word, ignoring case, keeping the text's own case", () => {
    expect(marks("Galvanised steel sheet, Steel", "STEEL sh")).toEqual(["steel", "sh", "Steel"]);
  });

  it("marks the longest word first and treats regex characters literally", () => {
    expect(marks("Steel (1.0 mm)", "st steel (1.0")).toEqual(["Steel", "(1.0"]);
  });

  it("keeps the whole text around the marks", () => {
    const { container } = render(<p>{Highlight({ text: "Hinge, steel", query: "steel" })}</p>);
    expect(container.textContent).toBe("Hinge, steel");
    expect(container.querySelector("mark")!.className).toContain("bg-highlight");
  });
});
