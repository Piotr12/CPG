import type { ConversionView } from "@cpg/core";
import {
  DESCRIPTION_REQUIRED_MESSAGE,
  DESCRIPTION_TOO_LONG_MESSAGE,
  FACTOR_MESSAGE,
  TYPE_MESSAGE,
  UNIT_FORMAT_MESSAGE,
} from "@cpg/core/validators/materials/material-fields.schema";
import { errorMessage } from "../../i18n/error-message";
import type { Messages } from "../../i18n/messages/en";

/**
 * The materials screens' strings in the reader's language: plain strings, so they can reach client
 * components (the server-side `heading` stays behind). `errors` holds every code the screens can show.
 */
export type MaterialsLabels = Omit<Messages["materials"], "heading" | "errors"> & { errors: Record<string, string> };

/** Which tenant and dataset generation a page rendered: every write it makes is bound to them. */
export interface TenantContext {
  tenant: string;
  generation: number;
}

/** Builds the materials screens' labels from a dictionary (server side, where `messages` is available). */
export function materialsLabels(messages: Messages): MaterialsLabels {
  const labels: Partial<Messages["materials"]> = { ...messages.materials };
  delete labels.heading;
  return { ...(labels as Omit<Messages["materials"], "heading">), errors: { ...messages.errors, ...messages.materials.errors } };
}

/** Fills `{name}` placeholders: `fill("Edit {id}", { id: "00000001" })`. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name] ?? placeholder);
}

/** An error envelope as the materials screens say it, through the shared `errorMessage`. */
export function errorFormatter(labels: MaterialsLabels) {
  return (error: { code: string; message: string }): string => errorMessage(labels.errors, error);
}

/** A field message from the shared schemas in the reader's language; unknown messages pass through. */
export function fieldErrorFormatter(labels: MaterialsLabels) {
  const t = labels.fieldErrors;
  const known: Record<string, string> = {
    [TYPE_MESSAGE]: t.type,
    [DESCRIPTION_REQUIRED_MESSAGE]: t.descriptionRequired,
    [DESCRIPTION_TOO_LONG_MESSAGE]: t.descriptionTooLong,
    [UNIT_FORMAT_MESSAGE]: t.unitFormat,
    [FACTOR_MESSAGE]: t.factor,
  };
  return (message: string): string => known[message] ?? message;
}

/** A conversion as people read it: "1 case = 12 each", or "2 half = 1 each" for a factor of 1/2. */
export function conversionText({ unit, numerator, denominator }: ConversionView, baseUnit: string): string {
  return `${denominator} ${unit} = ${numerator} ${baseUnit}`;
}

/**
 * The indicative inverse (MAT-021): "1 each = 0.083333 case". An inverse that rounds to zero at six
 * decimals reads "< 0.000001" rather than a misleading 0.
 */
export function inverseText({ unit, inverse }: ConversionView, baseUnit: string, labels: MaterialsLabels): string {
  return `1 ${baseUnit} = ${inverse === "0" ? labels.conversions.tiny : inverse} ${unit}`;
}
