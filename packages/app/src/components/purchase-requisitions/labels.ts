import type { MaterialSummary, NamedRecordView } from "@cpg/core";
import { UNIT_FORMAT_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import {
  QUANTITY_OUT_OF_RANGE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
} from "@cpg/core/validators/boms/bom-fields.schema";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { LOCATION_CHOICE_MESSAGE, MATERIAL_CHOICE_MESSAGE } from "@cpg/core/validators/planning-parameters/planning-parameter-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import { errorMessage } from "../../i18n/error-message";
import type { Messages } from "../../i18n/messages/en";
import { fill, shownQuantity, type TenantContext } from "../forms/form-labels";
import { materialPicker, type MaterialPicker } from "../materials/material-picker";

/**
 * The requisition screen's strings in the reader's language: plain strings, so they can reach client
 * components (the server-side heading stays behind). `errors` holds every code the screen can show.
 */
export type RequisitionsLabels = Omit<Messages["purchaseRequisitions"], "heading" | "errors"> & {
  errors: Record<string, string>;
  lifecycle: Messages["lifecycle"];
  /** The form's material autocomplete (#217). */
  picker: MaterialPicker;
};

/** Builds the requisition screen's labels from a dictionary (server side, where `messages` is available). */
export function requisitionsLabels(messages: Messages): RequisitionsLabels {
  const labels: Partial<Messages["purchaseRequisitions"]> = { ...messages.purchaseRequisitions };
  delete labels.heading;
  return {
    lifecycle: messages.lifecycle,
    ...(labels as Omit<Messages["purchaseRequisitions"], "heading">),
    errors: { ...messages.errors, ...messages.purchaseRequisitions.errors },
    picker: materialPicker(messages.lists),
  };
}

export { fill, shownQuantity, type TenantContext };

/** An error envelope as the requisition screen says it, translated by code. */
export function errorFormatter(labels: Pick<RequisitionsLabels, "errors">) {
  return (error: { code: string; message: string }): string => errorMessage(labels.errors, error);
}

/** A field message from the shared schemas or the service in the reader's language; unknown ones pass through. */
export function fieldErrorFormatter(labels: RequisitionsLabels) {
  const t = labels.fieldErrors;
  const known: Record<string, string> = {
    [MATERIAL_CHOICE_MESSAGE]: t.material,
    [LOCATION_CHOICE_MESSAGE]: t.location,
    [POSITIVE_QUANTITY_MESSAGE]: t.quantity,
    [UNIT_FORMAT_MESSAGE]: t.unit,
    [CALENDAR_DATE_MESSAGE]: t.date,
    [UNIT_NOT_CONVERTIBLE_MESSAGE]: t.unitNotConvertible,
    [QUANTITY_ROUNDS_TO_ZERO_MESSAGE]: t.roundsToZero,
    [QUANTITY_OUT_OF_RANGE_MESSAGE]: t.outOfRange,
  };
  return (message: string): string => known[message] ?? message;
}

/** A tenant's records by business ID, as the screens look up descriptions, names and base units. */
export const byId = <T extends { id: string }>(records: T[]): Map<string, T> => new Map(records.map((record) => [record.id, record]));

export type MaterialsById = Map<string, MaterialSummary>;
export type LocationsById = Map<string, NamedRecordView>;
