import { describe, expect, it } from "vitest";
import { AppError, NotFoundError, TooManyRequestsError, UnauthorizedError, ValidationError } from "./errors";

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
});
