import type { ImportChange, ImportIssue } from "@cpg/core";
import { errorFormatter } from "../boms/labels";
import { fill } from "../forms/form-labels";
import type { ImportLabels } from "./labels";

/*
 * The import report in the reader's language. Pure, so the client screen and its tests share it.
 * Sheet and column names stay as they are: they are the workbook's own English names (spec Q16).
 */

/**
 * A row's problem: the import's own codes from their templates and params, a cell's error by its
 * field message, and a service's refusal by its code (with a BOM clash's or cycle's details).
 */
export function problemText(issue: ImportIssue, labels: ImportLabels, tenant: string): string {
  const params = Object.fromEntries(Object.entries(issue.params ?? {}).map(([key, value]) => [key, String(value)]));
  const template = (labels.issues as Record<string, string>)[issue.code];
  if (template) {
    const record = (labels.records as Record<string, string>)[params.record] ?? params.record;
    return fill(template, { ...params, record, tenant });
  }
  if (issue.code === "VALIDATION_FAILED") return labels.fieldMessages[issue.message] ?? issue.message;
  return errorFormatter(labels)({ ...issue, params });
}

/** One value in a change: `—` for none, yes/no for a flag. */
function shown(value: ImportChange["before"], labels: ImportLabels): string {
  if (value === null) return labels.change.empty;
  if (typeof value === "boolean") return value ? labels.change.yes : labels.change.no;
  return String(value);
}

/** `Description: Steel sheet → Steel sheet 2 mm`; a component `added` or `removed` (XLS-021, XLS-025). */
export function changeText({ field, before, after }: ImportChange, labels: ImportLabels): string {
  const component = field.startsWith("Component ");
  const was = component && before === null ? labels.change.added : shown(before, labels);
  const is = component && after === null ? labels.change.removed : shown(after, labels);
  return `${field}: ${was} → ${is}`;
}

/** A new record's values in one line: `raw · Steel sheet · kg · yes`. */
export function createdText(changes: ImportChange[], labels: ImportLabels): string {
  return changes
    .filter(({ after }) => after !== null)
    .map(({ field, after }) => (field.startsWith("Component ") ? `${field.slice("Component ".length)} ${String(after)}` : shown(after, labels)))
    .join(" · ");
}

/** A count's sentence: its `one` form for 1, its `other` form otherwise, with `{count}` and `values` filled. */
export function counted(forms: { one: string; other: string }, count: number, values: Record<string, string> = {}): string {
  return fill(count === 1 ? forms.one : forms.other, { ...values, count: String(count) });
}
