/**
 * An error envelope in the reader's language: known codes are translated, others keep the server's text.
 * Pass `messages.errors`, or a screen's own map merged over it when a code means something specific there.
 */
export function errorMessage(errors: Record<string, string>, error: { code: string; message: string }): string {
  const text = Object.hasOwn(errors, error.code) ? errors[error.code] : error.message;
  if (!text.includes("{order}")) return text;
  const order = /\b\d{8}\b/.exec(error.message)?.[0];
  return order ? text.replace("{order}", order) : error.message;
}
