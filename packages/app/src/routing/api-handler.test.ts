import { notFound, redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@cpg/core";
import { apiHandler } from "./api-handler";

const request = new Request("http://cpg.test/api/tenants");
const failing = (error: unknown) =>
  apiHandler(async () => {
    throw error;
  })(request, undefined);

/** Shaped like the errors Next.js throws while prerendering a `GET` handler at build time (#38). */
const prerenderError = (message: string, digest: string) => Object.assign(new Error(message), { digest });

describe("apiHandler", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    [
      "the prerender bail-out on request.headers",
      prerenderError(
        "Route /api/tenants needs to bail out of prerendering at this point because it used request.headers.",
        "NEXT_PRERENDER_INTERRUPTED",
      ),
    ],
    [
      "the rejection of cookies() once the prerender is complete",
      prerenderError("During prerendering, `cookies()` rejects when the prerender is complete.", "HANGING_PROMISE_REJECTION"),
    ],
  ])("lets %s through to Next.js without logging it", async (_name, error) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(failing(error)).rejects.toBe(error);
    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    ["redirect()", () => redirect("/login")],
    ["notFound()", () => notFound()],
  ])("lets %s through instead of answering 500", async (_name, control) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(apiHandler(async () => control())(request, undefined)).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_/),
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("still maps an AppError to its status", async () => {
    const response = await failing(new NotFoundError("TENANT_NOT_FOUND", "Unknown tenant."));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("TENANT_NOT_FOUND");
  });

  it("still logs anything else and answers 500", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await failing(new Error("disk on fire"));

    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledWith("Route handler failed:", expect.any(Error));
  });
});
