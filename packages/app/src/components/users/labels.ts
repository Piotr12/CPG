import {
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  USERNAME_FORMAT_MESSAGE,
} from "@cpg/core/validators/users/create-user.schema";
import type { Messages } from "../../i18n/messages/en";

/** The users screen's strings in the reader's language: plain strings, so they can reach client components. */
export type UsersLabels = Messages["users"];

/** Fills the `{username}` placeholder of a users-screen string. */
export function withUsername(template: string, username: string): string {
  return template.replaceAll("{username}", username);
}

/** An error envelope as the users screen says it; codes it doesn't know keep the server's text. */
export function errorFormatter(labels: UsersLabels) {
  const { errors } = labels;
  return (error: { code: string; message: string }): string =>
    Object.hasOwn(errors, error.code) ? errors[error.code as keyof typeof errors] : error.message;
}

/** A field message from the shared schema in the reader's language; unknown messages pass through. */
export function fieldErrorFormatter(labels: UsersLabels) {
  const known: Record<string, string> = {
    [USERNAME_FORMAT_MESSAGE]: labels.fieldErrors.usernameFormat,
    [PASSWORD_TOO_SHORT_MESSAGE]: labels.fieldErrors.passwordTooShort,
    [PASSWORD_TOO_LONG_MESSAGE]: labels.fieldErrors.passwordTooLong,
  };
  return (message: string): string => known[message] ?? message;
}
