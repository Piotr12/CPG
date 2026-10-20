import { describe, expect, it } from "vitest";
import { errorFormatter, fill, shownQuantity, TALL_DIALOG } from "./form-labels";

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

describe("shownQuantity", () => {
  it("drops trailing zeros from a stored six-decimal quantity, and keeps everything else", () => {
    expect(shownQuantity("50.000000")).toBe("50");
    expect(shownQuantity("100.000000")).toBe("100");
    expect(shownQuantity("0.500000")).toBe("0.5");
    expect(shownQuantity("0.000001")).toBe("0.000001");
    expect(shownQuantity("0.000000")).toBe("0");
    expect(shownQuantity("120")).toBe("120");
  });
});

describe("TALL_DIALOG", () => {
  it("keeps a dialog within the window and scrolls its content", () => {
    expect(TALL_DIALOG).toBe("max-h-[calc(100dvh-2rem)] overflow-y-auto");
  });
});
