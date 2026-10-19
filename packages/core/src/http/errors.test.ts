import { describe, expect, it } from "vitest";
import { AppError, TooManyRequestsError, UnauthorizedError, ValidationError } from "./errors";

describe("AppError hierarchy", () => {
  it("carries a code, a message and the subclass name", () => {
    const error = new AppError("SOMETHING", "Something happened.");

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code: "SOMETHING", message: "Something happened.", name: "AppError" });
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
