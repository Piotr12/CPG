import { fill } from "./fill";

/**
 * An error envelope in the reader's language: known codes are translated, others keep the server's text.
 * Pass `messages.errors`, or a screen's own map merged over it when a code means something specific there.
 */
export function errorMessage(errors: Record<string, string>, error: { code: string; message: string; params?: Record<string, string> }): string {
  const template = Object.hasOwn(errors, error.code) ? errors[error.code] : error.message;
  // A context-free adapter or an older server must retain actionable server text, never placeholders.
  const params = error.params ?? {};
  if ([...template.matchAll(/\{(\w+)\}/g)].some(([, key]) => !Object.hasOwn(params, key))) return error.message;
  return fill(template, params);
}
