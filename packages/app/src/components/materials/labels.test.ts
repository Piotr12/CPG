import { describe, expect, it } from "vitest";
import {
  DESCRIPTION_REQUIRED_MESSAGE,
  DESCRIPTION_TOO_LONG_MESSAGE,
  FACTOR_MESSAGE,
  TYPE_MESSAGE,
  UNIT_FORMAT_MESSAGE,
} from "@cpg/core/validators/materials/material-fields.schema";
import { STATISTICAL_BASE_UNIT_MESSAGE, UNIT_NOT_REGISTERED_MESSAGE } from "@cpg/core/validators/units/unit-registry";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { conversionText, errorFormatter, fieldErrorFormatter, inverseText, materialsLabels } from "./labels";

const caseConversion = { unit: "case", numerator: "12", denominator: "1", inverse: "0.083333", version: 1 };

describe("materialsLabels", () => {
  it("are plain strings for client components, with the screen's errors over the shared ones", () => {
    const labels = materialsLabels(en);

    expect(labels).not.toHaveProperty("heading");
    expect(labels.errors.VALIDATION_FAILED).toBe(en.errors.VALIDATION_FAILED);
    expect(labels.errors.FORBIDDEN).toBe("Only the administrator can change materials.");
    expect(labels.infoLabel).toBe("About {field}");
    expect(materialsLabels(pl).infoLabel).toBe("Informacje o polu {field}");
  });
});

describe("errorFormatter", () => {
  it("translates known codes and keeps the server's message otherwise", () => {
    const format = errorFormatter(materialsLabels(pl));

    expect(format({ code: "CONVERSION_EXISTS", message: "x" })).toBe("Ten materiał ma już przelicznik dla tej jednostki.");
    expect(format({ code: "QUANTITY_OUT_OF_RANGE", message: "Too large." })).toBe("Too large.");
  });
});

describe("fieldErrorFormatter", () => {
  it("translates every message of the shared schemas, and passes others through", () => {
    const format = fieldErrorFormatter(materialsLabels(pl));

    expect(
      [
        TYPE_MESSAGE,
        DESCRIPTION_REQUIRED_MESSAGE,
        DESCRIPTION_TOO_LONG_MESSAGE,
        UNIT_FORMAT_MESSAGE,
        UNIT_NOT_REGISTERED_MESSAGE,
        STATISTICAL_BASE_UNIT_MESSAGE,
        FACTOR_MESSAGE,
      ].map(format),
    ).toEqual(Object.values(pl.materials.fieldErrors));
    expect(format("Something new.")).toBe("Something new.");
  });

  it("matches the English messages word for word", () => {
    const t = en.materials.fieldErrors;
    expect([t.type, t.descriptionRequired, t.descriptionTooLong, t.unitFormat, t.unitNotRegistered, t.statisticalBaseUnit, t.factor]).toEqual([
      TYPE_MESSAGE,
      DESCRIPTION_REQUIRED_MESSAGE,
      DESCRIPTION_TOO_LONG_MESSAGE,
      UNIT_FORMAT_MESSAGE,
      UNIT_NOT_REGISTERED_MESSAGE,
      STATISTICAL_BASE_UNIT_MESSAGE,
      FACTOR_MESSAGE,
    ]);
  });
});

describe("conversion sentences", () => {
  it("say the factor as 'denominator unit = numerator base' (MAT-019, MAT-021)", () => {
    expect(conversionText(caseConversion, "each", "en")).toBe("1 case = 12 each");
    expect(conversionText({ ...caseConversion, unit: "alt", numerator: "3", denominator: "2" }, "each", "en")).toBe("2 alt = 3 each");
  });

  it("say both sides of the factor in the reader's locale (#304)", () => {
    const pallet = { ...caseConversion, unit: "pallet", numerator: "12345.5", denominator: "2.5" };

    expect(conversionText(pallet, "kg", "en")).toBe("2.5 pallet = 12,345.5 kg");
    expect(conversionText(pallet, "kg", "pl")).toBe("2,5 pallet = 12\u00a0345,5 kg");
  });

  it("show the inverse in the reader's locale, and '< 0.000001' instead of zero (#304)", () => {
    expect(inverseText(caseConversion, "each", "en")).toBe("1 each = 0.083333 case");
    expect(inverseText(caseConversion, "each", "pl")).toBe("1 each = 0,083333 case");
    expect(inverseText({ ...caseConversion, inverse: "12345.5" }, "g", "en")).toBe("1 g = 12,345.5 case");
    expect(inverseText({ ...caseConversion, inverse: "12345.5" }, "g", "pl")).toBe("1 g = 12\u00a0345,5 case");
    expect(inverseText({ ...caseConversion, inverse: "0" }, "g", "en")).toBe("1 g = < 0.000001 case");
    expect(inverseText({ ...caseConversion, inverse: "0" }, "g", "pl")).toBe("1 g = < 0,000001 case");
  });
});
