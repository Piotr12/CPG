import { describe, expect, it } from "vitest";
import { errorFormatter, fill } from "./form-labels";

describe("fill", () => {
  it("fills known placeholders and leaves unknown ones", () => {
    expect(fill("Edit {id} in {unit}", { id: "00000001" })).toBe("Edit 00000001 in {unit}");
  });
});

describe("errorFormatter", () => {
  it("says a known code in the screen's words and keeps the server's message otherwise", () => {
    const format = errorFormatter({ errors: { CONFLICT: "Taken." } });

    expect(format({ code: "CONFLICT", message: "x" })).toBe("Taken.");
    expect(format({ code: "SOMETHING_ELSE", message: "As the server said." })).toBe("As the server said.");
  });
});
