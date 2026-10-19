import { describe, expect, it, vi } from "vitest";
import { AppError } from "@cpg/core";
import { orNotFound } from "./or-not-found";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

describe("orNotFound", () => {
  it("passes a result through", async () => {
    await expect(orNotFound(Promise.resolve("scope"), ["TENANT_NOT_FOUND"])).resolves.toBe("scope");
  });

  it("renders not-found for the listed codes", async () => {
    const missing = Promise.reject(new AppError("MATERIAL_NOT_FOUND", "No such material."));

    await expect(orNotFound(missing, ["TENANT_NOT_FOUND", "MATERIAL_NOT_FOUND"])).rejects.toThrow("404");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("lets any other failure through", async () => {
    const broken = new AppError("SOMETHING_ELSE", "Broken.");

    await expect(orNotFound(Promise.reject(broken), ["TENANT_NOT_FOUND"])).rejects.toBe(broken);
    await expect(orNotFound(Promise.reject(new Error("disk")), ["TENANT_NOT_FOUND"])).rejects.toThrow("disk");
  });
});
