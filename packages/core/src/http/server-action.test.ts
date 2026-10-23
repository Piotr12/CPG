import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ConflictError, UnauthorizedError, ValidationError } from "./errors";
import { INTERNAL_ERROR, serverAction } from "./server-action";

const schema = z.object({ name: z.string().min(1, "Required.") });

describe("serverAction", () => {
  afterEach(() => vi.restoreAllMocks());

  it("passes the parsed input to the handler and returns its data", async () => {
    const handler = vi.fn(async ({ name }: { name: string }) => `hello ${name}`);

    await expect(serverAction(schema, handler)({ name: "caveman", extra: "dropped" })).resolves.toEqual({
      ok: true,
      data: "hello caveman",
    });
    expect(handler).toHaveBeenCalledWith({ name: "caveman" });
  });

  it("returns field errors without calling the handler when the input is invalid", async () => {
    const handler = vi.fn();

    await expect(serverAction(schema, handler)({ name: "" })).resolves.toEqual({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Some fields are invalid.", fieldErrors: { name: ["Required."] } },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("maps an AppError to its code and message", async () => {
    const action = serverAction(schema, async () => {
      throw new UnauthorizedError("Invalid username or password.");
    });

    await expect(action({ name: "x" })).resolves.toEqual({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Invalid username or password." },
    });
  });

  it("keeps the field errors of a ValidationError the handler throws, for the form to show by its field", async () => {
    const action = serverAction(z.object({}), async () => {
      throw new ValidationError({ procurement: ["A raw material is always bought: choose Buy."] });
    });

    expect(await action({})).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: expect.any(String),
        fieldErrors: { procurement: ["A raw material is always bought: choose Buy."] },
      },
    });
  });

  it("keeps the parameters of a ValidationError the handler throws, for the form to name what is missing", async () => {
    const action = serverAction(z.object({}), async () => {
      throw new ValidationError({ components: ["Missing."] }, { material: "00000006" });
    });

    expect(await action({})).toEqual({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: expect.any(String), fieldErrors: { components: ["Missing."] }, params: { material: "00000006" } },
    });
  });

  it("logs anything else and returns a generic internal error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("database is locked at /secret/path");
    const action = serverAction(schema, async () => {
      throw boom;
    });

    await expect(action({ name: "x" })).resolves.toEqual({ ok: false, error: INTERNAL_ERROR });
    expect(log).toHaveBeenCalledWith("Server action failed:", boom);
  });
  it("preserves public interpolation context without exposing other error properties", async () => {
    const action = serverAction(schema, async () => { throw new ConflictError("Not enough.", "INSUFFICIENT_STOCK", { available: "2.000000" }); });
    expect(await action({ name: "x" })).toEqual({ ok: false, error: { code: "INSUFFICIENT_STOCK", message: "Not enough.", params: { available: "2.000000" } } });
  });
});
