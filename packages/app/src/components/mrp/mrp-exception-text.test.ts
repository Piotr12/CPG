import { describe, expect, it } from "vitest";
import type { MrpExceptionView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { exceptionText } from "./mrp-exception-text";

const exception = (code: string, params: Record<string, string> = {}): MrpExceptionView => ({ code, message: "The API's English message, never shown", params: { material: "00000001", location: "00000002", ...params } });
const context = { unit: "KG", locale: "en" as const, location: (code: string) => `${code} Warehouse` };
const english = (code: string, params?: Record<string, string>) => exceptionText(exception(code, params), context, en.mrp.explanations.exceptions);

describe("exceptionText (E18-S03): an exception's label and text by code and params", () => {
  it("explains Missing Planning Parameters by its reason, and falls back without one", () => {
    expect(english("MISSING_PLANNING_PARAMETERS", { reason: "no-set" })).toEqual({
      label: "Missing Planning Parameters", text: "This material has no planning parameters at this location, so MRP proposes no supply for it there.",
    });
    expect(english("MISSING_PLANNING_PARAMETERS", { reason: "raw-make" }).text).toContain("raw material is set to Make");
    expect(english("MISSING_PLANNING_PARAMETERS", { reason: "invalid-set" }).text).toContain("can't be used");
    expect(english("MISSING_PLANNING_PARAMETERS", { reason: "a-newer-reason" }).text).toBe(en.mrp.explanations.exceptions.codes.MISSING_PLANNING_PARAMETERS.plain);
    expect(english("MISSING_PLANNING_PARAMETERS").text).toBe(en.mrp.explanations.exceptions.codes.MISSING_PLANNING_PARAMETERS.plain);
  });

  it("fills Missing BOM, Missing Usable BOM and BOM cycle from their params, or gives the plain text", () => {
    expect(english("MISSING_BOM", { date: "2026-11-06" })).toEqual({ label: "Missing BOM", text: "No active BOM has a current revision valid on 2026-11-06, so MRP proposes no production." });
    expect(english("MISSING_BOM").text).toBe(en.mrp.explanations.exceptions.codes.MISSING_BOM.plain);
    expect(english("MISSING_USABLE_BOM", { date: "2026-11-06", inactive: "00000004/1: 00000011" })).toEqual({
      label: "Missing Usable BOM", text: "Every BOM valid on 2026-11-06 has an inactive component, so MRP proposes no production.",
    });
    expect(english("CYCLIC_BOM", { path: "00000003 →(BOM 00000009) 00000001 →(BOM 00000007) 00000003" }).text).toBe(
      "This material is on a cycle of BOMs, so MRP doesn't explode it: 00000003 →(BOM 00000009) 00000001 →(BOM 00000007) 00000003.",
    );
  });

  it("names an unreadable record by its kind, with its document when there is one", () => {
    expect(english("INVALID_UOM_CONVERSION", { record: "bom-line", document: "00000004/1/2" })).toEqual({
      label: "Unit not convertible", text: "A stored BOM line of this material, 00000004/1/2, can't be read, so MRP proposes no supply for it.",
    });
    expect(english("INVALID_UOM_CONVERSION", { record: "stock-balance" }).text).toBe("A stored stock balance of this material can't be read, so MRP proposes no supply for it.");
    expect(english("INVALID_UOM_CONVERSION", { record: "a-newer-record" }).text).toBe(en.mrp.explanations.exceptions.codes.INVALID_UOM_CONVERSION.plain);
  });

  it("explains No Feasible BOM as a provisional plan", () => {
    expect(english("NO_FEASIBLE_BOM", { date: "2026-11-09", missing: "" })).toEqual({ label: "No Feasible BOM", text: en.mrp.explanations.exceptions.codes.NO_FEASIBLE_BOM.text });
  });

  it("gives Insufficient Transfer Stock's quantities in the locale and the plan's unit, and names the destination", () => {
    const params = { transfer: "00000009", destination: "00000003", planned: "30.000000", available: "12.500000" };
    expect(english("INSUFFICIENT_TRANSFER_STOCK", params)).toEqual({
      label: "Insufficient Transfer Stock",
      text: "Transfer 00000009 to 00000003 Warehouse plans 30 KG, but only 12.5 KG is available at the source on its dispatch day, so only that part is planned.",
    });
    expect(exceptionText(exception("INSUFFICIENT_TRANSFER_STOCK", params), { ...context, locale: "pl" }, pl.mrp.explanations.exceptions).text).toBe(
      "Przesunięcie 00000009 do 00000003 Warehouse planuje 30 KG, ale w dniu wysyłki źródło ma tylko 12,5 KG, więc planowana jest tylko ta część.",
    );
    expect(english("INSUFFICIENT_TRANSFER_STOCK", { transfer: "00000009" }).text).toBe(en.mrp.explanations.exceptions.codes.INSUFFICIENT_TRANSFER_STOCK.plain);
  });

  it("gives a code this image doesn't know the fallback, in both languages", () => {
    expect(english("A_NEWER_CODE")).toEqual({ label: "MRP exception", text: "MRP raised an exception for this material at this location." });
    expect(exceptionText(exception("A_NEWER_CODE"), context, pl.mrp.explanations.exceptions)).toEqual({ label: "Wyjątek MRP", text: "MRP zgłosił wyjątek dla tego materiału w tej lokalizacji." });
  });

  it("translates every code in Polish too", () => {
    expect(exceptionText(exception("MISSING_BOM", { date: "2026-11-06" }), context, pl.mrp.explanations.exceptions)).toEqual({
      label: "Brak BOM-u", text: "Żaden aktywny BOM nie ma bieżącej rewizji ważnej 2026-11-06, więc MRP nie proponuje produkcji.",
    });
  });
});
