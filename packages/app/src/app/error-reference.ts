/**
 * The reference an unexpected-error page quotes: the digest Next.js gives a server error, which the
 * server log carries too, or `—` when there is none (a value thrown in a client component).
 */
export function errorReference(error: unknown): string {
  return error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : "—";
}
