/** A phrase's plural forms; `other` is the fallback. Plain strings, so they can cross to a client component. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

/** The form of `forms` the locale uses for `count`, with `{count}` filled in. */
export function plural(locale: string, count: number, forms: PluralForms): string {
  const form = forms[new Intl.PluralRules(locale).select(count)] ?? forms.other;
  return form.replaceAll("{count}", String(count));
}
