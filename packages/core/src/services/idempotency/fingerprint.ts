import { createHash } from "node:crypto";
import { hashPassword, verifyPassword } from "../auth/password-hash";

/** What identifies a write: the method and path it was sent to, and its parsed JSON body. */
export interface WriteRequest {
  method: string;
  path: string;
  body: unknown;
}

/** A request's fingerprint: the SHA-256 to compare with, and the form to store. */
export interface Fingerprint {
  sha256: string;
  /** The SHA-256 itself, or its argon2id hash when the body carries a password (spec Q4). */
  stored: string;
}

/** `METHOD /path`, as a stored key names the request it was first used for. */
export function operationOf({ method, path }: Pick<WriteRequest, "method" | "path">): string {
  return `${method.toUpperCase()} ${path}`;
}

/** JSON with object keys sorted at every level, so key order never changes a fingerprint. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item,
  );
}

/**
 * The fingerprint of a write. With `secret`, the stored form is an argon2id hash: a plain SHA-256 of
 * a body holding a password would be a fast-hash copy of it, weaker than the account's own hash.
 * Computed before the write's transaction, so the argon2 work holds no database lock.
 */
export async function fingerprintOf(request: WriteRequest, { secret = false } = {}): Promise<Fingerprint> {
  const sha256 = createHash("sha256")
    .update(canonicalJson({ operation: operationOf(request), body: request.body ?? null }))
    .digest("hex");
  return { sha256, stored: secret ? await hashPassword(sha256) : sha256 };
}

/** Whether a stored fingerprint, plain or argon2id, belongs to the request with this SHA-256. */
export async function fingerprintMatches(stored: string, sha256: string): Promise<boolean> {
  return stored.startsWith("$argon2id$") ? verifyPassword(sha256, stored) : stored === sha256;
}
