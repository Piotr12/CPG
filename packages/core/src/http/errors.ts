/** Field name → messages, as shown next to the matching form field. */
export type FieldErrors = Record<string, string[]>;

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
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The input failed its schema. */
export class ValidationError extends AppError {
  constructor(readonly fieldErrors: FieldErrors) {
    super("VALIDATION_FAILED", "Some fields are invalid.");
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
