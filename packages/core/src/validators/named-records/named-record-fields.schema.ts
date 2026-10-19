import { z } from "zod";

/**
 * Longest name of a location, customer or supplier (spec Q3). Re-declared here (equal to `@cpg/db`'s,
 * which a test asserts) so client code importing this subpath never pulls the ORM into the browser.
 */
export const NAME_MAX = 100;

/** The English messages; screens translate them by matching these constants. */
export const NAME_REQUIRED_MESSAGE = "Enter a name.";
export const NAME_TOO_LONG_MESSAGE = `Use at most ${NAME_MAX} characters.`;
export const ID_IMMUTABLE_MESSAGE = "A record's ID can't be changed.";
export const NOTHING_TO_CHANGE_MESSAGE = "Send at least one of name or active.";

/** A name: trimmed, 1–100 characters, not unique (spec Q3). */
export const nameSchema = z
  .string({ error: NAME_REQUIRED_MESSAGE })
  .trim()
  .min(1, NAME_REQUIRED_MESSAGE)
  .max(NAME_MAX, NAME_TOO_LONG_MESSAGE);
