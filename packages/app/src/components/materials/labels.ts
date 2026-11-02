import type { ConversionView, Locale } from "@cpg/core";
import {
  DESCRIPTION_REQUIRED_MESSAGE,
  DESCRIPTION_TOO_LONG_MESSAGE,
  FACTOR_MESSAGE,
  TYPE_MESSAGE,
  UNIT_FORMAT_MESSAGE,
} from "@cpg/core/validators/materials/material-fields.schema";
import { STATISTICAL_BASE_UNIT_MESSAGE, UNIT_NOT_REGISTERED_MESSAGE } from "@cpg/core/validators/units/unit-registry";
import { errorFormatter, fill, localeQuantity, type TenantContext } from "../forms/form-labels";
import type { Messages } from "../../i18n/messages/en";

/**
 * The materials screens' strings in the reader's language: plain strings, so they can reach client
 * components (the server-side `heading` stays behind). `errors` holds every code the screens can show.
 */
export type MaterialsLabels = Omit<Messages["materials"], "heading" | "errors"> & {
  errors: Record<string, string>;
  /** A field's info button name, `{field}` for its label (UX-014). */
  infoLabel: string;
};

/** Builds the materials screens' labels from a dictionary (server side, where `messages` is available). */
export function materialsLabels(messages: Messages): MaterialsLabels {
  const labels: Partial<Messages["materials"]> = { ...messages.materials };
  delete labels.heading;
  return {
    ...(labels as Omit<Messages["materials"], "heading">),
    errors: { ...messages.errors, ...messages.materials.errors },
    infoLabel: messages.forms.infoLabel,
  };
}

/** The shared form helpers, re-exported for the materials components (`components/forms/`). */
export { errorFormatter, fill, type TenantContext };

/** A field message from the shared schemas in the reader's language; unknown messages pass through. */
export function fieldErrorFormatter(labels: MaterialsLabels) {
  const t = labels.fieldErrors;
  const known: Record<string, string> = {
    [TYPE_MESSAGE]: t.type,
    [DESCRIPTION_REQUIRED_MESSAGE]: t.descriptionRequired,
    [DESCRIPTION_TOO_LONG_MESSAGE]: t.descriptionTooLong,
    [UNIT_FORMAT_MESSAGE]: t.unitFormat,
    [UNIT_NOT_REGISTERED_MESSAGE]: t.unitNotRegistered,
    [STATISTICAL_BASE_UNIT_MESSAGE]: t.statisticalBaseUnit,
    [FACTOR_MESSAGE]: t.factor,
  };
  return (message: string): string => known[message] ?? message;
}

/**
 * A conversion as people read it, both sides in the reader's locale (#304): "1 case = 12 each", or
 * "2 half = 1 each" for a factor of 1/2; "1 box = 1,234.5 kg" in English and "1 box = 1234,5 kg" in Polish.
 */
export function conversionText({ unit, numerator, denominator }: ConversionView, baseUnit: string, locale: Locale): string {
  return `${localeQuantity(denominator, locale)} ${unit} = ${localeQuantity(numerator, locale)} ${baseUnit}`;
}

/**
 * The indicative inverse (MAT-021) in the reader's locale: "1 each = 0.083333 case", or "0,083333" in
 * Polish. An inverse that rounds to zero at six decimals reads "< 0.000001" (Polish "< 0,000001")
 * rather than a misleading 0; the zero test reads the stored text, never the localized one.
 */
export function inverseText({ unit, inverse }: ConversionView, baseUnit: string, locale: Locale): string {
  return `1 ${baseUnit} = ${inverse === "0" ? `< ${localeQuantity("0.000001", locale)}` : localeQuantity(inverse, locale)} ${unit}`;
}
