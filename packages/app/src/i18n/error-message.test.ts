import { describe, expect, it } from "vitest";
import { errorMessage } from "./error-message";
import { en } from "./messages/en";
import { pl } from "./messages/pl";

describe("errorMessage", () => {
  it("translates a known error code", () => {
    expect(errorMessage(pl, { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts." })).toBe(
      "Zbyt wiele prób. Spróbuj ponownie za kilka minut.",
    );
  });

  it("keeps the server's message for a code it doesn't know", () => {
    expect(errorMessage(en, { code: "CONFLICT", message: "Someone else changed it." })).toBe("Someone else changed it.");
  });

  it("doesn't mistake inherited object keys for translations", () => {
    expect(errorMessage(en, { code: "toString", message: "Odd code." })).toBe("Odd code.");
  });
});
