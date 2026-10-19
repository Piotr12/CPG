import { z } from "zod";

/** Every password in CPG, the admin's environment one included, is at least this long. */
export const MIN_PASSWORD_LENGTH = 12;
/** Upper bound keeps a hostile request from making the server hash megabytes. */
export const MAX_PASSWORD_LENGTH = 256;

/** The English messages; screens translate them by matching these constants. */
export const USERNAME_FORMAT_MESSAGE = "Use 3–32 lowercase letters, digits, dots, dashes or underscores.";
export const PASSWORD_TOO_SHORT_MESSAGE = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
export const PASSWORD_TOO_LONG_MESSAGE = `Use at most ${MAX_PASSWORD_LENGTH} characters.`;

/** Lowercase letters, digits, `.`, `_` and `-`, starting with a letter or digit: 3–32 characters. */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** Trimmed and lowercased first, so `Alice` and `alice` are one account. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, USERNAME_FORMAT_MESSAGE);

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT_MESSAGE)
  .max(MAX_PASSWORD_LENGTH, PASSWORD_TOO_LONG_MESSAGE);

/** The admin's Create user form and the `createUser` action share this schema. */
export const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
