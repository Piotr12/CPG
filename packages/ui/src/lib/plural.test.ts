import { describe, expect, it } from "vitest";
import { plural } from "./plural";

describe("plural", () => {
  const polish = { one: "{count} materiał", few: "{count} materiały", many: "{count} materiałów", other: "{count} materiału" };

  it("picks the locale's form and fills in the count", () => {
    expect(plural("en", 1, { one: "{count} material", other: "{count} materials" })).toBe("1 material");
    expect(plural("en", 5, { one: "{count} material", other: "{count} materials" })).toBe("5 materials");
    expect(plural("pl", 1, polish)).toBe("1 materiał");
    expect(plural("pl", 3, polish)).toBe("3 materiały");
    expect(plural("pl", 5, polish)).toBe("5 materiałów");
  });

  it("falls back to `other` for a form the phrase doesn't give", () => {
    expect(plural("pl", 3, { one: "{count} wynik", other: "{count} wyników" })).toBe("3 wyników");
  });
});
