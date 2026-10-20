import {
  LEAD_TIME_MESSAGE,
  LOCATION_CHOICE_MESSAGE,
  MATERIAL_CHOICE_MESSAGE,
  PROCUREMENT_MESSAGE,
  RAW_MATERIAL_BUY_ONLY_MESSAGE,
} from "@cpg/core/validators/planning-parameters/planning-parameter-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE, QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import type { Messages } from "../../i18n/messages/en";

/**
 * The planning parameters screen's strings in the reader's language: plain strings, so they can
 * reach client components (the server-side `heading` stays behind). `errors` holds every code the
 * screen can show.
 */
export type PlanningParametersLabels = Omit<Messages["planningParameters"], "heading" | "errors"> & {
  errors: Record<string, string>;
};

/** Builds the labels from a dictionary (server side, where `messages` is available). */
export function planningParametersLabels(messages: Messages): PlanningParametersLabels {
  const labels: Partial<Messages["planningParameters"]> = { ...messages.planningParameters };
  delete labels.heading;
  return {
    ...(labels as Omit<Messages["planningParameters"], "heading">),
    errors: { ...messages.errors, ...messages.planningParameters.errors },
  };
}

/** A field message from the shared schemas or the service in the reader's language; unknown ones pass through. */
export function fieldErrorFormatter(labels: PlanningParametersLabels) {
  const t = labels.fieldErrors;
  const known: Record<string, string> = {
    [MATERIAL_CHOICE_MESSAGE]: t.material,
    [LOCATION_CHOICE_MESSAGE]: t.location,
    [PROCUREMENT_MESSAGE]: t.procurement,
    [RAW_MATERIAL_BUY_ONLY_MESSAGE]: t.rawBuyOnly,
    [LEAD_TIME_MESSAGE]: t.leadTime,
    [QUANTITY_MESSAGE]: t.quantity,
    [POSITIVE_QUANTITY_MESSAGE]: t.positiveQuantity,
  };
  return (message: string): string => known[message] ?? message;
}
