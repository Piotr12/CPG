import { createHash, randomBytes } from "node:crypto";

/** 256 bits: far beyond guessing, the length session-token guidance recommends. */
const TOKEN_BYTES = 32;

/** A fresh random session token, URL-safe so it fits a cookie as-is. */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** What the database stores instead of the token: its SHA-256, hex-encoded (64 characters). */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
