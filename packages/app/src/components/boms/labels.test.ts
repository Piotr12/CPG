import { COMPONENT_COUNT_MESSAGE, RAW_OUTPUT_MESSAGE } from "@cpg/core/validators/boms/bom-fields.schema";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { bomsLabels, enteredAs, errorFormatter, fieldErrorFormatter, lineSummary, materialsById, validityText } from "./labels";

const materials = materialsById([
  { id: "00000002", type: "raw", description: "Bolt M8", baseUnit: "each", active: true, createdAt: new Date(), version: 1 },
]);
const bolts = { material: "00000002", quantity: "24.000000", enteredQuantity: "2", enteredUnit: "case", numerator: "12", denominator: "1" };

describe("BOM labels", () => {
  it("leave the server-side headings out and merge the screen's errors over the shared ones", () => {
    const labels = bomsLabels(en);
    expect(labels).not.toHaveProperty("heading");
    expect(labels).not.toHaveProperty("detailHeading");
    expect(labels.errors).toMatchObject({ VALIDATION_FAILED: "Some fields are invalid.", FORBIDDEN: "Only the administrator can change BOMs." });
  });

  it("carry the shared material picker's words in the reader's language, as plain data (#217)", () => {
    const { picker } = bomsLabels(pl);
    const { placeholder, ...labels } = pl.lists.materialPicker;
    expect(picker).toEqual({ labels, placeholder });
    expect(JSON.parse(JSON.stringify(picker))).toEqual(picker);
  });

  it("append a clash's or a cycle's language-neutral details to the translated sentence", () => {
    const format = errorFormatter(bomsLabels(pl));
    const clash = { code: "BOM_PRIORITY_CONFLICT", message: "Another active BOM …: BOM 00000001 (2027-03-01 – …)." };
    const cycle = { code: "BOM_CYCLE", message: "This recipe would make a cycle: 00000008 Sub A → 00000008 Sub A." };

    expect(format(clash)).toBe(`${pl.boms.errors.BOM_PRIORITY_CONFLICT} BOM 00000001 (2027-03-01 – …).`);
    expect(format(cycle)).toBe(`${pl.boms.errors.BOM_CYCLE} 00000008 Sub A → 00000008 Sub A.`);
    expect(format({ code: "BOM_CYCLE", message: "No details" })).toBe(pl.boms.errors.BOM_CYCLE);
    expect(format({ code: "FORBIDDEN", message: "x: y" })).toBe(pl.boms.errors.FORBIDDEN);
  });

  it("show an untranslated code's server message as it is, details included", () => {
    const format = errorFormatter({ ...bomsLabels(en), errors: {} });
    expect(format({ code: "BOM_CYCLE", message: "This recipe would make a cycle: A → A." })).toBe("This recipe would make a cycle: A → A.");
  });

  it("translate the shared and the service's field messages, and pass others through", () => {
    const format = fieldErrorFormatter(bomsLabels(pl));
    expect(format(COMPONENT_COUNT_MESSAGE)).toBe(pl.boms.fieldErrors.components);
    expect(format(RAW_OUTPUT_MESSAGE)).toBe(pl.boms.fieldErrors.rawOutput);
    expect(format("Something new.")).toBe("Something new.");
  });

  it("summarize a line by base quantity, unit and material, and say how it was entered (MAT-019)", () => {
    expect(lineSummary(bolts, materials)).toBe("24 each 00000002 Bolt M8");
    expect(enteredAs(bolts, materials, bomsLabels(en))).toBe("2 case at 1 case = 12 each");
    expect(enteredAs({ ...bolts, enteredUnit: "each" }, materials, bomsLabels(en))).toBe("");
  });

  it("write a validity with its end, or the no-end word", () => {
    expect(validityText({ validFrom: "2026-01-01", validThrough: "2026-12-31" }, "no end")).toBe("2026-01-01 – 2026-12-31");
    expect(validityText({ validFrom: "2026-01-01", validThrough: null }, "no end")).toBe("2026-01-01 – no end");
  });
});
