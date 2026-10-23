/** Field name → messages, as shown next to the matching form field. */
export type FieldErrors = Record<string, string[]>;

/** Public, non-sensitive context for translated error messages. */
export type ErrorParams = Record<string, string>;

/**
 * Base of every error a service throws on purpose. The server-action and route wrappers turn it
 * into the result envelope; anything that isn't an `AppError` becomes a generic internal error.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    /** HTTP status for route handlers (`apiHandler`). Server actions only use the code. */
    readonly status = 400,
    readonly messageParams?: ErrorParams,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The input failed its schema. `messageParams` name what a field message refers to, such as a missing record. */
export class ValidationError extends AppError {
  constructor(readonly fieldErrors: FieldErrors, messageParams?: ErrorParams) {
    super("VALIDATION_FAILED", "Some fields are invalid.", 400, messageParams);
  }
}

/** The caller is not (or no longer) signed in, or the credentials are wrong. */
export class UnauthorizedError extends AppError {
  constructor(message = "You need to sign in.") {
    super("UNAUTHORIZED", message, 401);
  }
}

/** Too many attempts in a short time; the caller has to wait. */
export class TooManyRequestsError extends AppError {
  constructor(message = "Too many attempts. Try again in a few minutes.") {
    super("TOO_MANY_ATTEMPTS", message, 429);
  }
}

/** The requested record (or tenant) doesn't exist, or isn't visible from this scope. */
export class NotFoundError extends AppError {
  constructor(code = "NOT_FOUND", message = "Not found.") {
    super(code, message, 404);
  }
}

/** Signed in, but this account may not do this (a normal user calling an admin-only action). */
export class ForbiddenError extends AppError {
  constructor(message = "You don't have access to this.") {
    super("FORBIDDEN", message, 403);
  }
}

/**
 * The write clashes with existing data: a taken unique name (`CONFLICT`), a stale version
 * (`VERSION_CONFLICT`), a reused idempotency key (`IDEMPOTENCY_KEY_REUSED`) or a stale tenant
 * generation (`GENERATION_STALE`).
 */
export class ConflictError extends AppError {
  constructor(message: string, code = "CONFLICT", messageParams?: ErrorParams) {
    super(code, message, 409, messageParams);
  }
}

/** What a stale edit says, whatever the record (AUD-024, AUD-025, API-029). */
export const VERSION_CONFLICT = "This record was changed since you loaded it. Reload and try again.";

/** An edit carried a version older than the record's: the newer change is kept. */
export function versionConflict(): ConflictError {
  return new ConflictError(VERSION_CONFLICT, "VERSION_CONFLICT");
}

/** A state-changing API request came without a usable `Idempotency-Key` header (API-019). */
export class IdempotencyKeyRequiredError extends AppError {
  constructor() {
    super(
      "IDEMPOTENCY_KEY_REQUIRED",
      "Send an Idempotency-Key header: 1–255 visible ASCII characters, unique per write.",
      400,
    );
  }
}

/** A write lacks a precondition it must carry, such as the Test tenant's generation (API-034). */
export class PreconditionRequiredError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 428);
  }
}
