import type { AutocompleteOption } from "@cpg/ui/backend/forms/autocomplete";
import { errorMessage } from "../../i18n/error-message";
import { fill } from "../../i18n/fill";

/** Which tenant and dataset generation a page rendered: every write it makes is bound to them. */
export interface TenantContext {
  tenant: string;
  generation: number;
}

export { fill };

/** An error envelope as a screen says it: its own `errors` by code, through the shared `errorMessage`. */
export function errorFormatter(labels: { errors: Record<string, string> }) {
  return (error: Parameters<typeof errorMessage>[1]): string => errorMessage(labels.errors, error);
}

/**
 * A stored six-decimal quantity as screens show it and forms prefill it: without trailing zeros
 * (`"50.000000"` → `"50"`, `"0.500000"` → `"0.5"`). Text only, so no binary float enters (R03).
 */
export function shownQuantity(quantity: string): string {
  return quantity.includes(".") ? quantity.replace(/\.?0+$/, "") : quantity;
}

/**
 * A stored six-decimal quantity in the reader's locale: `"-1234.500000"` is `-1,234.5` in English and
 * `-1234,5` in Polish, grouped as the locale groups. `Intl.NumberFormat` formats the decimal text itself,
 * every digit kept, so no binary float enters (R03). The MRP report uses it; other screens follow (#304).
 */
export function localeQuantity(quantity: string, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(quantity as `${number}`);
}

/** One choice of a form's select, such as a material or a location. */
export interface FormOption {
  value: string;
  label: string;
}

/**
 * For a dialog whose form can be taller than the window (six fields with hints): it scrolls inside
 * the window instead of hiding its title and buttons above and below it, where nobody can reach them.
 */
export const TALL_DIALOG = "max-h-[calc(100dvh-2rem)] overflow-y-auto";

/** A form's values in, the material's base unit out, or `undefined` while the form doesn't know it yet. */
export type BaseUnitOf = (values: Record<string, string>) => string | undefined;

/**
 * A quantity field's tooltip that names the material's base unit once the form knows it (UX-014,
 * #290): `named` with `{baseUnit}` filled, else `general`.
 */
export function baseUnitTip(named: string, general: string, baseUnit: BaseUnitOf) {
  return (values: Record<string, string>): string => {
    const unit = baseUnit(values);
    return unit === undefined ? general : fill(named, { baseUnit: unit });
  };
}

/** The chosen material's base unit, from a material picker's options, whose quiet `detail` it is (`materialOptions`). */
export function chosenBaseUnit(materials: AutocompleteOption[]): BaseUnitOf {
  return (values) => materials.find(({ value }) => value === values.material)?.detail;
}
