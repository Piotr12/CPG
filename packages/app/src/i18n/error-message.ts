import type { Messages } from "./messages/en";

/** An error envelope in the reader's language: known codes are translated, others keep the server's text. */
export function errorMessage(messages: Messages, error: { code: string; message: string }): string {
  const { errors } = messages;
  return Object.hasOwn(errors, error.code) ? errors[error.code as keyof typeof errors] : error.message;
}
