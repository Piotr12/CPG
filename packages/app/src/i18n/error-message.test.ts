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
  it("keeps the blocking order ID in a translated demand refusal", () => {
    expect(errorMessage(pl.errors, { code: "MATERIAL_HAS_CUSTOMER_DEMAND", message: "Customer order 00000017 has outstanding demand for this material." })).toBe("Zamówienie klienta 00000017 ma niezrealizowany popyt na ten materiał.");
    expect(errorMessage(pl.errors, { code: "LOCATION_HAS_CUSTOMER_ORDERS", message: "unexpected detail" })).toBe("unexpected detail");
  });

});
