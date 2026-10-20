import { errorMessage } from "../../i18n/error-message";

/** Which tenant and dataset generation a page rendered: every write it makes is bound to them. */
export interface TenantContext {
  tenant: string;
  generation: number;
}

export { fill } from "../../i18n/fill";

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
