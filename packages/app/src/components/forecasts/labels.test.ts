import { describe, expect, it } from "vitest";
import {
  QUANTITY_OUT_OF_RANGE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
} from "@cpg/core/validators/boms/bom-fields.schema";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { UNIT_FORMAT_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import { LOCATION_CHOICE_MESSAGE, MATERIAL_CHOICE_MESSAGE } from "@cpg/core/validators/planning-parameters/planning-parameter-fields.schema";
import { QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { fieldErrorFormatter, forecastsLabels } from "./labels";

describe("forecastsLabels", () => {
  it("drops the server-side heading and merges the screen's errors over the shared ones", () => {
    const labels = forecastsLabels(en);
    expect(labels).not.toHaveProperty("heading");
    expect(labels.errors.FORECAST_EXISTS).toBe(en.forecasts.errors.FORECAST_EXISTS);
    expect(labels.errors.VALIDATION_FAILED).toBe(en.errors.VALIDATION_FAILED);
  });

  it("holds plain data only, so a server page can hand it to a client component", () => {
    const functions = (node: unknown): boolean =>
      typeof node === "function" || (typeof node === "object" && node !== null && Object.values(node).some(functions));
    expect(functions(forecastsLabels(en))).toBe(false);
    expect(functions(forecastsLabels(pl))).toBe(false);
  });
});

describe("fieldErrorFormatter", () => {
  const messages = [
    MATERIAL_CHOICE_MESSAGE,
    LOCATION_CHOICE_MESSAGE,
    CALENDAR_DATE_MESSAGE,
    QUANTITY_MESSAGE,
    UNIT_FORMAT_MESSAGE,
    UNIT_NOT_CONVERTIBLE_MESSAGE,
    QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
    QUANTITY_OUT_OF_RANGE_MESSAGE,
  ];

  it("keeps English equal to the schemas' messages", () => {
    const format = fieldErrorFormatter(forecastsLabels(en));
    expect(messages.map(format)).toEqual(messages);
  });

  it("translates every schema message into Polish, and passes unknown ones through", () => {
    const format = fieldErrorFormatter(forecastsLabels(pl));
    expect(format(CALENDAR_DATE_MESSAGE)).toBe("Podaj prawdziwą datę w formacie RRRR-MM-DD.");
    expect(messages.map(format).filter((text, index) => text === messages[index])).toEqual([]);
    expect(format("New.")).toBe("New.");
  });
});
