/**
 * An error envelope in the reader's language: known codes are translated, others keep the server's text.
 * Pass `messages.errors`, or a screen's own map merged over it when a code means something specific there.
 */
export function errorMessage(errors: Record<string, string>, error: { code: string; message: string }): string {
  return Object.hasOwn(errors, error.code) ? errors[error.code] : error.message;
}
