import { randomUUID } from "node:crypto";
import { p } from "@mikro-orm/core";

/** Longest `Idempotency-Key` header value a client may send (spec Q2). */
export const IDEMPOTENCY_KEY_MAX = 255;

/**
 * The columns both idempotency stores share: one successful API write, the key it came with and the
 * result it answered, kept for 24 hours so a retry gets that result instead of a second write. The
 * account is a copied id, not a foreign key: users are never deleted and a row lives one day.
 */
export function idempotencyKeyProperties() {
  return {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    userId: p.string().length(36),
    key: p.string().length(IDEMPOTENCY_KEY_MAX),
    /** `METHOD /path` of the first request, for the "used for another request" message. */
    operation: p.string(),
    /** Hex SHA-256 of the request, or an argon2id PHC string when its body carried a password. */
    fingerprint: p.string(),
    /** The `data` of the first, successful response. Never a secret: no API route returns one. */
    response: p.json<unknown>().nullable(),
    /** Start of the 24-hour window. */
    createdAt: p.datetime().onCreate(() => new Date()),
  };
}
