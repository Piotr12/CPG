import type { Locale, MrpExceptionView } from "@cpg/core";
import type { Messages } from "../../i18n/messages/en";
import { fill, localeQuantity } from "../forms/form-labels";

type ExceptionLabels = Messages["mrp"]["explanations"]["exceptions"];

/** What an exception's text needs besides its params: the plan's unit and the reader's locale, and how to name a location. */
export interface ExceptionContext {
  unit: string;
  locale: Locale;
  location: (code: string) => string;
}

/** `template` with every placeholder filled, or null when `values` lacks one (a row an older or newer image wrote). */
function filled(template: string, values: Record<string, string | undefined>): string | null {
  const names = [...template.matchAll(/\{(\w+)\}/g)].map(([, name]) => name);
  return names.every((name) => values[name] !== undefined) ? fill(template, values as Record<string, string>) : null;
}

/**
 * An exception's label and text in the reader's language (E18-S03 spec, UI/UX): by its code, with IDs and
 * quantities from `params`, never from the API's English `message` (lesson 2026-10-23). A param it needs but
 * lacks gives the code's unparameterised text; a code this image doesn't know gives the fallback.
 */
export function exceptionText({ code, params }: MrpExceptionView, context: ExceptionContext, t: ExceptionLabels): { label: string; text: string } {
  const quantity = (value: string | undefined) => (value === undefined ? undefined : `${localeQuantity(value, context.locale)} ${context.unit}`);
  switch (code) {
    case "MISSING_PLANNING_PARAMETERS": {
      const labels = t.codes.MISSING_PLANNING_PARAMETERS;
      // Own keys only: a stored value like "constructor" must not reach an inherited property.
      const reason = params.reason;
      const known = reason !== undefined && Object.hasOwn(labels.reasons, reason);
      return { label: labels.label, text: known ? labels.reasons[reason as keyof typeof labels.reasons] : labels.plain };
    }
    case "MISSING_BOM":
    case "MISSING_USABLE_BOM":
    case "CYCLIC_BOM": {
      const labels = t.codes[code];
      return { label: labels.label, text: filled(labels.text, params) ?? labels.plain };
    }
    case "INVALID_UOM_CONVERSION": {
      const labels = t.codes.INVALID_UOM_CONVERSION;
      const record = params.record !== undefined && Object.hasOwn(labels.records, params.record) ? labels.records[params.record as keyof typeof labels.records] : undefined;
      const template = params.document === undefined ? labels.text : labels.document;
      return { label: labels.label, text: filled(template, { record, document: params.document }) ?? labels.plain };
    }
    case "NO_FEASIBLE_BOM":
      return { label: t.codes.NO_FEASIBLE_BOM.label, text: t.codes.NO_FEASIBLE_BOM.text };
    case "INSUFFICIENT_TRANSFER_STOCK": {
      const labels = t.codes.INSUFFICIENT_TRANSFER_STOCK;
      const values = {
        transfer: params.transfer,
        destination: params.destination === undefined ? undefined : context.location(params.destination),
        planned: quantity(params.planned),
        available: quantity(params.available),
      };
      return { label: labels.label, text: filled(labels.text, values) ?? labels.plain };
    }
    default:
      return { label: t.fallback.label, text: t.fallback.text };
  }
}
