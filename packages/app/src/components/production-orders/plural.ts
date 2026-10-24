import { fill } from "../forms/form-labels";

/**
 * A counted phrase's forms, as plain data (a client component can't take a function label). `few` is
 * Polish's 2–4 form ("2 składniki"); English repeats `other` there.
 */
export interface PluralForms {
  one: string;
  few: string;
  other: string;
}

/** Polish's rule, which covers English too: 1 → `one`; 2–4, 22–24, … but not 12–14 → `few`; else `other`. */
export function pluralForm(count: number): keyof PluralForms {
  if (count === 1) return "one";
  const units = count % 10;
  const tens = count % 100;
  return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? "few" : "other";
}

/** The form for `count`, with `{count}` filled in: "3 components short", "5 składników z niedoborem". */
export function plural(forms: PluralForms, count: number): string {
  return fill(forms[pluralForm(count)], { count: String(count) });
}
