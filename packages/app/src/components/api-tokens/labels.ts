import {
  TOKEN_NAME_REQUIRED_MESSAGE,
  TOKEN_NAME_TOO_LONG_MESSAGE,
} from "@cpg/core/validators/api-tokens/create-api-token.schema";
import { errorMessage } from "../../i18n/error-message";
import type { Messages } from "../../i18n/messages/en";

/**
 * The tokens screen's strings in the reader's language: plain strings, so they can reach client
 * components. `errors` holds every code the screen can show: the shared ones plus its own.
 */
export type TokensLabels = Omit<Messages["tokens"], "errors"> & { errors: Record<string, string> };

/** Builds the tokens screen's labels from a dictionary (server side, where `messages` is available). */
export function tokensLabels(messages: Messages): TokensLabels {
  return { ...messages.tokens, errors: { ...messages.errors, ...messages.tokens.errors } };
}

/** Fills the `{name}` placeholder of a tokens-screen string. */
export function withName(template: string, name: string): string {
  return template.replaceAll("{name}", name);
}

/** A moment as the tokens screen shows it: UTC, to the minute ("Last used" is kept to the minute). */
export function formatMinute(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** An error envelope as the tokens screen says it, through the shared `errorMessage`. */
export function errorFormatter(labels: TokensLabels) {
  return (error: { code: string; message: string }): string => errorMessage(labels.errors, error);
}

/** A field message from the shared schema in the reader's language; unknown messages pass through. */
export function fieldErrorFormatter(labels: TokensLabels) {
  const known: Record<string, string> = {
    [TOKEN_NAME_REQUIRED_MESSAGE]: labels.fieldErrors.nameRequired,
    [TOKEN_NAME_TOO_LONG_MESSAGE]: labels.fieldErrors.nameTooLong,
  };
  return (message: string): string => known[message] ?? message;
}
