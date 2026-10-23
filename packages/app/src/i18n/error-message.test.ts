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
  it("keeps the actionable server message when translation context is missing or incomplete", () => {
    const message = "Material 00000001 holds 2.000001 kg at location 00000002.";
    expect(errorMessage(pl.errors, { code: "STOCK_NOT_EMPTY", message })).toBe(message);
    expect(errorMessage(en.errors, { code: "STOCK_NOT_EMPTY", message, params: { material: "00000001" } })).toBe(message);
  });

  it("keeps the blocking order ID through structured translated demand refusals", () => {
    expect(errorMessage(pl.errors, { code: "MATERIAL_HAS_CUSTOMER_DEMAND", message: "Customer order 00000017 has outstanding demand for this material.", params: { order: "00000017" } })).toBe("Zamówienie klienta 00000017 ma niezrealizowany popyt na ten materiał.");
    expect(errorMessage(pl.errors, { code: "LOCATION_HAS_CUSTOMER_ORDERS", message: "unexpected detail" })).toBe("unexpected detail");
  });

  it("names the Open purchase order or requisition that keeps a location active, in English and Polish (#141)", () => {
    const order = { code: "LOCATION_HAS_PURCHASE_ORDERS", message: "Purchase order 00000004 is still Open.", params: { order: "00000004" } };
    const requisition = { code: "LOCATION_HAS_REQUISITIONS", message: "Purchase requisition 00000002 is still Open.", params: { requisition: "00000002" } };
    expect(errorMessage(en.errors, order)).toBe("Purchase order 00000004 is still Open for delivery to this location.");
    expect(errorMessage(pl.errors, order)).toBe("Zamówienie zakupu 00000004 z dostawą do tej lokalizacji jest nadal otwarte.");
    expect(errorMessage(en.errors, requisition)).toBe("Purchase requisition 00000002 is still Open at this location.");
    expect(errorMessage(pl.errors, requisition)).toBe("Zapotrzebowanie zakupu 00000002 jest nadal otwarte w tej lokalizacji.");
  });

});
