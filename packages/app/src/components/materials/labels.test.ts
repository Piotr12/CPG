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
    expect(conversionText(caseConversion, "each")).toBe("1 case = 12 each");
    expect(conversionText({ ...caseConversion, unit: "alt", numerator: "3", denominator: "2" }, "each")).toBe("2 alt = 3 each");
  });

  it("show the inverse, and '< 0.000001' instead of zero", () => {
    const labels = materialsLabels(en);

    expect(inverseText(caseConversion, "each", labels)).toBe("1 each = 0.083333 case");
    expect(inverseText({ ...caseConversion, inverse: "0" }, "g", labels)).toBe("1 g = < 0.000001 case");
  });
});
