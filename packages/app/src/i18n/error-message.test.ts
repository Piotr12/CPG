import { describe, expect, it } from "vitest";
import { errorMessage } from "./error-message";
import { en } from "./messages/en";
import { pl } from "./messages/pl";

describe("errorMessage", () => {
  it("translates a known error code", () => {
    expect(errorMessage(pl.errors, { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts." })).toBe(
      "Zbyt wiele prób. Spróbuj ponownie za kilka minut.",
    );
  });

  it("keeps the server's message for a code it doesn't know", () => {
    expect(errorMessage(en.errors, { code: "CONFLICT", message: "Someone else changed it." })).toBe("Someone else changed it.");
  });

  it("doesn't mistake inherited object keys for translations", () => {
    expect(errorMessage(en.errors, { code: "toString", message: "Odd code." })).toBe("Odd code.");
  });
  it("translates stock refusals while keeping exact pair and quantity context", () => {
    const params = { material: "00000001", location: "00000002", available: "2.000000", requested: "3.000000", unit: "each" };
    expect(errorMessage(pl.errors, { code: "INSUFFICIENT_STOCK", message: "Not enough.", params })).toBe("Materiał 00000001 w lokalizacji 00000002: dostępne 2.000000 each; wymagane 3.000000 each.");
    expect(errorMessage(pl.errors, { code: "STOCK_NOT_EMPTY", message: "Not empty.", params: { ...params, quantity: "2.000000" } })).toBe("Materiał 00000001 w lokalizacji 00000002 ma zapas 2.000000 each. Wyzeruj zapas przed dezaktywacją.");
    expect(errorMessage(pl.errors, { code: "MATERIAL_HAS_MOVEMENTS", message: "Locked." })).toBe("Materiał ma historię zapasu, więc nie można zmienić jego typu ani jednostki podstawowej.");
    expect(errorMessage({}, { code: "OTHER", message: "Available {available}.", params })).toBe("Available 2.000000.");
  });
});
