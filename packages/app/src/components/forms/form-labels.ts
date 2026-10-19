import { errorMessage } from "../../i18n/error-message";

/** Which tenant and dataset generation a page rendered: every write it makes is bound to them. */
export interface TenantContext {
  tenant: string;
  generation: number;
}

/** Fills `{name}` placeholders: `fill("Edit {id}", { id: "00000001" })`. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name] ?? placeholder);
}

/** An error envelope as a screen says it: its own `errors` by code, through the shared `errorMessage`. */
export function errorFormatter(labels: { errors: Record<string, string> }) {
  return (error: { code: string; message: string }): string => errorMessage(labels.errors, error);
}
