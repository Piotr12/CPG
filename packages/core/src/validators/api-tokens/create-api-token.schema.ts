import { z } from "zod";

/**
 * Longest token name. The `api_token.name` column has the same length (`API_TOKEN_NAME_MAX` in
 * `@cpg/db`, which client code can't import); a test keeps the two equal.
 */
export const MAX_TOKEN_NAME_LENGTH = 64;

/** The English messages; screens translate them by matching these constants. */
export const TOKEN_NAME_REQUIRED_MESSAGE = "Enter a name.";
export const TOKEN_NAME_TOO_LONG_MESSAGE = `Use at most ${MAX_TOKEN_NAME_LENGTH} characters.`;

/** A label the user picks: trimmed, stored as typed, unique per account and case-sensitive. */
export const tokenNameSchema = z
  .string()
  .trim()
  .min(1, TOKEN_NAME_REQUIRED_MESSAGE)
  .max(MAX_TOKEN_NAME_LENGTH, TOKEN_NAME_TOO_LONG_MESSAGE);

/** The Create token form and the `createApiToken` action share this schema. */
export const createApiTokenSchema = z.object({ name: tokenNameSchema });

export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;
