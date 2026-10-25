import type { MaterialSummary, NamedRecordView } from "@cpg/core";
import {
  QUANTITY_OUT_OF_RANGE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
} from "@cpg/core/validators/boms/bom-fields.schema";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { UNIT_FORMAT_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import { LOCATION_CHOICE_MESSAGE, MATERIAL_CHOICE_MESSAGE } from "@cpg/core/validators/planning-parameters/planning-parameter-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import { STOCK_REASON_MESSAGE } from "@cpg/core/validators/stock/stock-correction.schema";
import {
  TRANSFER_ARRIVAL_BEFORE_DISPATCH_MESSAGE,
  TRANSFER_SAME_LOCATION_MESSAGE,
  TRANSFER_SINGLE_MATERIAL_MESSAGE,
} from "@cpg/core/validators/transfers/transfer.schema";
import type { Messages } from "../../i18n/messages/en";
import { errorFormatter, fill, shownQuantity, type TenantContext } from "../forms/form-labels";
import { materialPicker, type MaterialPicker } from "../materials/material-picker";
import { recordPicker } from "../named-records/record-picker";

/**
 * The transfer screens' strings in the reader's language: plain strings, so they can reach client
 * components (the server-side headings stay behind). `errors` holds every code the screens can show.
 */
export type TransfersLabels = Omit<Messages["transfers"], "heading" | "detailHeading" | "errors"> & {
  errors: Record<string, string>;
  /** The form's material autocomplete (#217). */
  picker: MaterialPicker;
  locationPicker: MaterialPicker;
};

/** Builds the transfer labels from a dictionary (server side, where `messages` is available). */
export function transfersLabels(messages: Messages): TransfersLabels {
  const labels: Partial<Messages["transfers"]> = { ...messages.transfers };
  delete labels.heading;
  delete labels.detailHeading;
  return {
    ...(labels as Omit<Messages["transfers"], "heading" | "detailHeading">),
    errors: { ...messages.errors, ...messages.transfers.errors },
    picker: materialPicker(messages.lists), locationPicker: recordPicker(messages.lists, "location"),
  };
}

export { errorFormatter, fill, shownQuantity, type TenantContext };

/** A field message from the shared schemas or the service in the reader's language; unknown ones pass through. */
export function fieldErrorFormatter(labels: Pick<TransfersLabels, "fieldErrors">) {
  const t = labels.fieldErrors;
  const known: Record<string, string> = {
    [MATERIAL_CHOICE_MESSAGE]: t.material,
    [LOCATION_CHOICE_MESSAGE]: t.location,
    [TRANSFER_SAME_LOCATION_MESSAGE]: t.sameLocation,
    [TRANSFER_ARRIVAL_BEFORE_DISPATCH_MESSAGE]: t.arrivalBeforeDispatch,
    [TRANSFER_SINGLE_MATERIAL_MESSAGE]: t.singleMaterial,
    [POSITIVE_QUANTITY_MESSAGE]: t.quantity,
    [UNIT_FORMAT_MESSAGE]: t.unit,
    [CALENDAR_DATE_MESSAGE]: t.date,
    [UNIT_NOT_CONVERTIBLE_MESSAGE]: t.unitNotConvertible,
    [QUANTITY_ROUNDS_TO_ZERO_MESSAGE]: t.roundsToZero,
    [QUANTITY_OUT_OF_RANGE_MESSAGE]: t.outOfRange,
    [STOCK_REASON_MESSAGE]: t.reason,
  };
  return (message: string): string => known[message] ?? message;
}

/** A tenant's records by business ID, as the screens look up descriptions, names and base units. */
export const byId = <T extends { id: string }>(records: T[]): Map<string, T> => new Map(records.map((record) => [record.id, record]));

/** A location as the screens name it: "00000001 Main plant". */
export const locationName = (locations: Map<string, NamedRecordView>, id: string): string => `${id} ${locations.get(id)!.name}`;

/** A material as the screens name it: "00000001 Steel sheet". */
export const materialName = (materials: Map<string, MaterialSummary>, id: string): string => `${id} ${materials.get(id)!.description}`;

/** Whether a stored six-decimal quantity is more than nothing. */
export const isPositive = (quantity: string): boolean => /[1-9]/.test(quantity);
