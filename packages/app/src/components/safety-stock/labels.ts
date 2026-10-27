import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import {
  LOCATION_CHOICE_MESSAGE,
  MATERIAL_CHOICE_MESSAGE,
} from "@cpg/core/validators/planning-parameters/planning-parameter-fields.schema";
import { QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import type { Messages } from "../../i18n/messages/en";
import { materialPicker, type MaterialPicker } from "../materials/material-picker";
import { recordPicker } from "../named-records/record-picker";

/**
 * The safety stock screen's strings in the reader's language: plain strings for client components;
 * `picker` is the shared material picker's words (#217).
 */
export type SafetyStockLabels = Omit<Messages["safetyStock"], "heading" | "errors"> & {
  errors: Record<string, string>;
  picker: MaterialPicker;
  locationPicker: MaterialPicker;
  /** A field's info button name, `{field}` for its label (UX-014). */
  infoLabel: string;
};

/** Builds the labels from a dictionary (server side, where `messages` is available). */
export function safetyStockLabels(messages: Messages): SafetyStockLabels {
  const labels: Partial<Messages["safetyStock"]> = { ...messages.safetyStock };
  delete labels.heading;
  return {
    ...(labels as Omit<Messages["safetyStock"], "heading">),
    errors: { ...messages.errors, ...messages.safetyStock.errors },
    picker: materialPicker(messages.lists), locationPicker: recordPicker(messages.lists, "location"),
    infoLabel: messages.forms.infoLabel,
  };
}

/** A field message from the shared schemas in the reader's language; unknown ones pass through. */
export function fieldErrorFormatter(labels: SafetyStockLabels) {
  const t = labels.fieldErrors;
  const known: Record<string, string> = {
    [MATERIAL_CHOICE_MESSAGE]: t.material,
    [LOCATION_CHOICE_MESSAGE]: t.location,
    [CALENDAR_DATE_MESSAGE]: t.date,
    [QUANTITY_MESSAGE]: t.quantity,
  };
  return (message: string): string => known[message] ?? message;
}
