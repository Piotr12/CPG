import { randomBytes } from "node:crypto";
import { hashSessionToken } from "./session-token";

/** Marks a CPG API token, so a leaked one is recognisable to secret scanners and in logs. */
export const API_TOKEN_PREFIX = "cpg_";
/** 256 bits, like session tokens: far beyond guessing, so a fast hash is enough to store it. */
const SECRET_BYTES = 32;

/** A fresh API token secret: the prefix and 32 random bytes in base64url (47 characters). */
export function generateApiTokenSecret(): string {
  return API_TOKEN_PREFIX + randomBytes(SECRET_BYTES).toString("base64url");
}

/** What the database stores instead of the secret: its hex SHA-256, the same digest as sessions. */
export function hashApiTokenSecret(secret: string): string {
  return hashSessionToken(secret);
}
