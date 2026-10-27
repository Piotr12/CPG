import { describe, expect, it } from "vitest";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { MATERIAL_CHOICE_MESSAGE } from "@cpg/core/validators/planning-parameters/planning-parameter-fields.schema";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { fieldErrorFormatter, safetyStockLabels } from "./labels";

describe("safetyStockLabels", () => {
  it("drops the server-side heading and merges the screen's errors over the shared ones", () => {
    const labels = safetyStockLabels(en);
    expect(labels).not.toHaveProperty("heading");
    expect(labels.errors.SAFETY_STOCK_TARGET_EXISTS).toBe(en.safetyStock.errors.SAFETY_STOCK_TARGET_EXISTS);
    expect(labels.errors.VALIDATION_FAILED).toBe(en.errors.VALIDATION_FAILED);
    expect(labels.infoLabel).toBe("About {field}");
    expect(safetyStockLabels(pl).infoLabel).toBe("Informacje o polu {field}");
  });
});

describe("fieldErrorFormatter", () => {
  it("translates the schemas' messages, keeps English equal to them, and passes unknown ones through", () => {
    expect(fieldErrorFormatter(safetyStockLabels(pl))(CALENDAR_DATE_MESSAGE)).toBe("Podaj prawdziwą datę w formacie RRRR-MM-DD.");
    expect(fieldErrorFormatter(safetyStockLabels(en))(CALENDAR_DATE_MESSAGE)).toBe(CALENDAR_DATE_MESSAGE);
    expect(fieldErrorFormatter(safetyStockLabels(en))(MATERIAL_CHOICE_MESSAGE)).toBe(MATERIAL_CHOICE_MESSAGE);
    expect(fieldErrorFormatter(safetyStockLabels(pl))("New.")).toBe("New.");
  });
});
