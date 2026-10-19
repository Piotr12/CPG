import { describe, expect, it } from "vitest";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  IdempotencyKeyRequiredError,
  NotFoundError,
  PreconditionRequiredError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
  VERSION_CONFLICT,
  versionConflict,
} from "./errors";

describe("AppError hierarchy", () => {
  it("carries a code, a message and the subclass name", () => {
    const error = new AppError("SOMETHING", "Something happened.");

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code: "SOMETHING", message: "Something happened.", name: "AppError", status: 400 });
    expect(new AppError("TEAPOT", "I'm a teapot.", 418).status).toBe(418);
  });

  it("gives every subclass its HTTP status", () => {
    expect(new ValidationError({}).status).toBe(400);
    expect(new UnauthorizedError().status).toBe(401);
    expect(new NotFoundError().status).toBe(404);
    expect(new TooManyRequestsError().status).toBe(429);
  });

  it("names what wasn't found, generically by default", () => {
    expect(new NotFoundError()).toMatchObject({ code: "NOT_FOUND", message: "Not found.", name: "NotFoundError" });
    expect(new NotFoundError("TENANT_NOT_FOUND", "Unknown tenant.")).toMatchObject({
      code: "TENANT_NOT_FOUND",
      message: "Unknown tenant.",
    });
  });

  it("keeps the field errors of a validation failure", () => {
    const error = new ValidationError({ username: ["Enter your username."] });

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: "VALIDATION_FAILED",
      name: "ValidationError",
      fieldErrors: { username: ["Enter your username."] },
    });
  });

  it("defaults the unauthorized message and accepts a specific one", () => {
    expect(new UnauthorizedError()).toMatchObject({ code: "UNAUTHORIZED", message: "You need to sign in." });
    expect(new UnauthorizedError("Invalid username or password.").message).toBe("Invalid username or password.");
  });

  it("asks the caller to wait when throttled", () => {
    expect(new TooManyRequestsError()).toMatchObject({
      code: "TOO_MANY_ATTEMPTS",
      message: "Too many attempts. Try again in a few minutes.",
      name: "TooManyRequestsError",
    });
    expect(new TooManyRequestsError("Slow down.").message).toBe("Slow down.");
  });

  it("refuses a signed-in account that lacks the right", () => {
    expect(new ForbiddenError()).toMatchObject({ code: "FORBIDDEN", message: "You don't have access to this.", status: 403 });
    expect(new ForbiddenError("Admins only.").message).toBe("Admins only.");
  });

  it("reports a clash with existing data", () => {
    expect(new ConflictError("That username is taken.")).toMatchObject({
      code: "CONFLICT",
      message: "That username is taken.",
      name: "ConflictError",
      status: 409,
    });
  });

  it("has one stale-version error for every versioned record", () => {
    expect(versionConflict()).toMatchObject({ code: "VERSION_CONFLICT", message: VERSION_CONFLICT, status: 409 });
  });

  it("names the kind of clash when one is given", () => {
    expect(new ConflictError("Reload and try again.", "VERSION_CONFLICT")).toMatchObject({
      code: "VERSION_CONFLICT",
      status: 409,
    });
  });

  it("asks for an idempotency key with a 400", () => {
    expect(new IdempotencyKeyRequiredError()).toMatchObject({
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "Send an Idempotency-Key header: 1–255 visible ASCII characters, unique per write.",
      name: "IdempotencyKeyRequiredError",
      status: 400,
    });
  });

  it("asks for a missing precondition with a 428", () => {
    expect(new PreconditionRequiredError("GENERATION_REQUIRED", "Send it.")).toMatchObject({
      code: "GENERATION_REQUIRED",
      message: "Send it.",
      name: "PreconditionRequiredError",
      status: 428,
    });
  });
});
