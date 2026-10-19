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
    super("UNAUTHORIZED", message);
  }
}

/** Too many attempts in a short time; the caller has to wait. */
export class TooManyRequestsError extends AppError {
  constructor(message = "Too many attempts. Try again in a few minutes.") {
    super("TOO_MANY_ATTEMPTS", message);
  }
}

/** Signed in, but this account may not do this (a normal user calling an admin-only action). */
export class ForbiddenError extends AppError {
  constructor(message = "You don't have access to this.") {
    super("FORBIDDEN", message);
  }
}

/** The record doesn't exist, or the caller may not know it exists. */
export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super("NOT_FOUND", message);
  }
}

/** The write clashes with existing data, such as a taken unique name. */
export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message);
  }
}
