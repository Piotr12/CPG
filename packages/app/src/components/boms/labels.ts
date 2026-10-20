import type { BomComponentView, MaterialSummary } from "@cpg/core";
import {
  COMPONENT_COUNT_MESSAGE,
  DUPLICATE_COMPONENT_MESSAGE,
  FINISHED_COMPONENT_MESSAGE,
  OUTPUT_CHOICE_MESSAGE,
  PRIORITY_MESSAGE,
  QUANTITY_OUT_OF_RANGE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  RAW_OUTPUT_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
  VALID_THROUGH_BEFORE_FROM_MESSAGE,
} from "@cpg/core/validators/boms/bom-fields.schema";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { UNIT_FORMAT_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import { MATERIAL_CHOICE_MESSAGE } from "@cpg/core/validators/planning-parameters/planning-parameter-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import { errorMessage } from "../../i18n/error-message";
import type { Messages } from "../../i18n/messages/en";
import { fill, shownQuantity, type TenantContext } from "../forms/form-labels";

/**
 * The BOM screens' strings in the reader's language: plain strings, so they can reach client
 * components (the server-side headings stay behind). `errors` holds every code the screens can show.
 */
export type BomsLabels = Omit<Messages["boms"], "heading" | "detailHeading" | "errors"> & { errors: Record<string, string> };

/** Builds the BOM screens' labels from a dictionary (server side, where `messages` is available). */
export function bomsLabels(messages: Messages): BomsLabels {
  const labels: Partial<Messages["boms"]> = { ...messages.boms };
  delete labels.heading;
  delete labels.detailHeading;
  return { ...(labels as Omit<Messages["boms"], "heading" | "detailHeading">), errors: { ...messages.errors, ...messages.boms.errors } };
}

export { fill, shownQuantity, type TenantContext };

/**
 * The codes whose server message carries language-neutral details after its first colon: the BOM a
 * priority clashes with and the shared days, or the cycle's path. The screen appends them to its own
 * sentence, so they survive translation.
 */
const DETAILED_CODES = new Set(["BOM_PRIORITY_CONFLICT", "BOM_CYCLE"]);

/** An error envelope as the BOM screens say it: translated by code, plus the details of a clash or a cycle. */
export function errorFormatter(labels: Pick<BomsLabels, "errors">) {
  return (error: { code: string; message: string }): string => {
    const text = errorMessage(labels.errors, error);
    const colon = error.message.indexOf(": ");
    if (!DETAILED_CODES.has(error.code) || colon < 0 || text === error.message) return text;
    return `${text} ${error.message.slice(colon + 2)}`;
  };
}

/** A field message from the shared schemas or the service in the reader's language; unknown ones pass through. */
export function fieldErrorFormatter(labels: BomsLabels) {
  const t = labels.fieldErrors;
  const known: Record<string, string> = {
    [OUTPUT_CHOICE_MESSAGE]: t.output,
    [PRIORITY_MESSAGE]: t.priority,
    [CALENDAR_DATE_MESSAGE]: t.date,
    [VALID_THROUGH_BEFORE_FROM_MESSAGE]: t.throughBeforeFrom,
    [COMPONENT_COUNT_MESSAGE]: t.components,
    [DUPLICATE_COMPONENT_MESSAGE]: t.duplicate,
    [MATERIAL_CHOICE_MESSAGE]: t.material,
    [POSITIVE_QUANTITY_MESSAGE]: t.quantity,
    [UNIT_FORMAT_MESSAGE]: t.unit,
    [RAW_OUTPUT_MESSAGE]: t.rawOutput,
    [FINISHED_COMPONENT_MESSAGE]: t.finishedComponent,
    [UNIT_NOT_CONVERTIBLE_MESSAGE]: t.unitNotConvertible,
    [QUANTITY_ROUNDS_TO_ZERO_MESSAGE]: t.roundsToZero,
    [QUANTITY_OUT_OF_RANGE_MESSAGE]: t.outOfRange,
  };
  return (message: string): string => known[message] ?? message;
}

/** A tenant's materials by ID, as the BOM screens look up descriptions, base units and Inactive badges. */
export type MaterialsById = Map<string, MaterialSummary>;

export function materialsById(materials: MaterialSummary[]): MaterialsById {
  return new Map(materials.map((material) => [material.id, material]));
}

/** A line as the list summarizes it: "24 each 00000002 Bolt M8" (base quantity and unit, then the material). */
export function lineSummary(line: BomComponentView, materials: MaterialsById): string {
  const material = materials.get(line.material)!;
  return `${shownQuantity(line.quantity)} ${material.baseUnit} ${material.id} ${material.description}`;
}

/**
 * How a line was entered, when not in the base unit: "2 case at 1 case = 12 each". Empty for a line
 * entered in the base unit, where it would only repeat the quantity.
 */
export function enteredAs(line: BomComponentView, materials: MaterialsById, labels: BomsLabels): string {
  const { baseUnit } = materials.get(line.material)!;
  if (line.enteredUnit === baseUnit) return "";
  const conversion = `${line.denominator} ${line.enteredUnit} = ${line.numerator} ${baseUnit}`;
  return fill(labels.recipe.enteredAs, { quantity: line.enteredQuantity, unit: line.enteredUnit, conversion });
}

/** A validity period as the screens show it: "2026-01-01 – 2026-12-31", or "2026-01-01 – " plus the no-end word. */
export function validityText({ validFrom, validThrough }: { validFrom: string; validThrough: string | null }, noEnd: string): string {
  return `${validFrom} – ${validThrough ?? noEnd}`;
}
