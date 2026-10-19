import {
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  USERNAME_FORMAT_MESSAGE,
} from "@cpg/core/validators/users/create-user.schema";
import { errorMessage } from "../../i18n/error-message";
import type { Messages } from "../../i18n/messages/en";

/**
 * The users screen's strings in the reader's language: plain strings, so they can reach client
 * components. `errors` holds every code the screen can show: the shared ones plus its own.
 */
export type UsersLabels = Omit<Messages["users"], "errors"> & { errors: Record<string, string> };

/** Builds the users screen's labels from a dictionary (server side, where `messages` is available). */
export function usersLabels(messages: Messages): UsersLabels {
  return { ...messages.users, errors: { ...messages.errors, ...messages.users.errors } };
}

/** Fills the `{username}` placeholder of a users-screen string. */
export function withUsername(template: string, username: string): string {
  return template.replaceAll("{username}", username);
}

/** An error envelope as the users screen says it, through the shared `errorMessage`. */
export function errorFormatter(labels: UsersLabels) {
  return (error: { code: string; message: string }): string => errorMessage(labels.errors, error);
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
