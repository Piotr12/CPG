import { afterEach, describe, expect, it, vi } from "vitest";
import { apiHandler } from "./api-handler";
import { AppError, NotFoundError, TooManyRequestsError, UnauthorizedError, ValidationError } from "./errors";
import { INTERNAL_ERROR } from "./server-action";

const request = new Request("http://cpg.test/api/x");
const call = async (handler: () => Promise<unknown>) => {
  const response = await apiHandler(handler)(request, undefined);
  return { status: response.status, cacheControl: response.headers.get("Cache-Control"), body: await response.json() };
};

describe("apiHandler", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the handler's data in the envelope, uncached", async () => {
    const handler = vi.fn(async (_request: Request, context: { id: number }) => ({ id: context.id }));

    const response = await apiHandler(handler)(request, { id: 7 });

    expect(handler).toHaveBeenCalledWith(request, { id: 7 });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, data: { id: 7 } });
  });

  it.each([
    [new UnauthorizedError(), 401, { code: "UNAUTHORIZED", message: "You need to sign in." }],
    [new NotFoundError("TENANT_NOT_FOUND", "Unknown tenant."), 404, { code: "TENANT_NOT_FOUND", message: "Unknown tenant." }],
    [new TooManyRequestsError(), 429, { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Try again in a few minutes." }],
    [new AppError("CONFLICT", "Changed meanwhile.", 409), 409, { code: "CONFLICT", message: "Changed meanwhile." }],
    [new AppError("ODD", "Odd."), 400, { code: "ODD", message: "Odd." }],
  ])("maps %s to its status and code", async (error, status, body) => {
    const result = await call(async () => {
      throw error;
    });

    expect(result).toEqual({ status, cacheControl: "no-store", body: { ok: false, error: body } });
  });

  it("keeps the field errors of a validation failure", async () => {
    const result = await call(async () => {
      throw new ValidationError({ name: ["Required."] });
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toEqual({ code: "VALIDATION_FAILED", message: "Some fields are invalid.", fieldErrors: { name: ["Required."] } });
  });

  it("hides anything unexpected behind INTERNAL and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await call(async () => {
      throw new Error("disk on fire");
    });

    expect(result).toEqual({ status: 500, cacheControl: "no-store", body: { ok: false, error: INTERNAL_ERROR } });
    expect(log).toHaveBeenCalledWith("Route handler failed:", expect.any(Error));
  });
});
