import { IDEMPOTENCY_KEY_MAX } from "@cpg/db";
import { IdempotencyKeyRequiredError, PreconditionRequiredError } from "./errors";

/** The request header that makes a write safe to retry (R07). */
export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
/** The request header carrying the tenant's dataset generation a write was prepared against. */
export const GENERATION_HEADER = "Dataset-Generation";
/** The response header that marks a stored result answered again instead of a new write. */
export const REPLAYED_HEADER = "Idempotent-Replayed";

/** 1–255 visible ASCII characters, `!` to `~`: no spaces, no control or non-ASCII characters. */
const KEY_PATTERN = new RegExp(`^[\\x21-\\x7e]{1,${IDEMPOTENCY_KEY_MAX}}$`);
/** A whole number from 1, without sign, leading zeros or exponent. */
const GENERATION_PATTERN = /^[1-9][0-9]{0,8}$/;

/**
 * The request's `Idempotency-Key`, compared case-sensitively and never trimmed: a key is an opaque
 * value the client chose. Missing or malformed is `IDEMPOTENCY_KEY_REQUIRED` (spec Q2).
 */
export function readIdempotencyKey(request: Request): string {
  const key = request.headers.get(IDEMPOTENCY_KEY_HEADER);
  if (key === null || !KEY_PATTERN.test(key)) throw new IdempotencyKeyRequiredError();
  return key;
}

/**
 * The `Dataset-Generation` the client sent, or null when it sent none. A value that isn't a whole
 * number from 1 is `GENERATION_REQUIRED`, in either tenant: a client that sends one means to.
 */
export function readGeneration(request: Request): number | null {
  const raw = request.headers.get(GENERATION_HEADER);
  if (raw === null) return null;
  const value = raw.trim();
  if (!GENERATION_PATTERN.test(value)) throw generationRequired();
  return Number(value);
}

/** The error for a tenant write without a usable generation (API-034: HTTP 428). */
export function generationRequired(): PreconditionRequiredError {
  return new PreconditionRequiredError(
    "GENERATION_REQUIRED",
    "Send the Dataset-Generation header with the tenant's current generation, from GET /api/tenants/{tenant}.",
  );
}
