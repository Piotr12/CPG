import {
  QUANTITY_OUT_OF_RANGE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
} from "@cpg/core/validators/boms/bom-fields.schema";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { UNIT_FORMAT_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import {
  LOCATION_CHOICE_MESSAGE,
  MATERIAL_CHOICE_MESSAGE,
} from "@cpg/core/validators/planning-parameters/planning-parameter-fields.schema";
import { QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import type { Messages } from "../../i18n/messages/en";

/** The forecasts screen's strings in the reader's language: plain strings for client components. */
export type ForecastsLabels = Omit<Messages["forecasts"], "heading" | "errors"> & { errors: Record<string, string> };

/** Builds the labels from a dictionary (server side, where `messages` is available). */
export function forecastsLabels(messages: Messages): ForecastsLabels {
  const labels: Partial<Messages["forecasts"]> = { ...messages.forecasts };
  delete labels.heading;
  return {
    ...(labels as Omit<Messages["forecasts"], "heading">),
    errors: { ...messages.errors, ...messages.forecasts.errors },
  };
}

/** A field message from the shared schemas in the reader's language; unknown ones pass through. */
export function fieldErrorFormatter(labels: ForecastsLabels) {
  const t = labels.fieldErrors;
  const known: Record<string, string> = {
    [MATERIAL_CHOICE_MESSAGE]: t.material,
    [LOCATION_CHOICE_MESSAGE]: t.location,
    [CALENDAR_DATE_MESSAGE]: t.date,
    [QUANTITY_MESSAGE]: t.quantity,
    [UNIT_FORMAT_MESSAGE]: t.unit,
    [UNIT_NOT_CONVERTIBLE_MESSAGE]: t.unitNotConvertible,
    [QUANTITY_ROUNDS_TO_ZERO_MESSAGE]: t.roundsToZero,
    [QUANTITY_OUT_OF_RANGE_MESSAGE]: t.outOfRange,
  };
  return (message: string): string => known[message] ?? message;
}
