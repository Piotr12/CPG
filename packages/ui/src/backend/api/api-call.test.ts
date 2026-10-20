import { afterEach, expect, it, vi } from "vitest";
import { apiCall } from "./api-call";
afterEach(() => vi.unstubAllGlobals());
it("reads a same-origin shared envelope without caching", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, data: { id: "one" } })); vi.stubGlobal("fetch", fetch);
  expect(await apiCall("/api/example")).toEqual({ ok: true, data: { id: "one" } });
  expect(fetch).toHaveBeenCalledWith("/api/example", { credentials: "same-origin", cache: "no-store" });
});
it("preserves intentional server refusal codes and messages", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: false, error: { code: "CONFLICT", message: "Reload" } }, { status: 409 })));
  expect(await apiCall("/api/example")).toEqual({ ok: false, error: { code: "CONFLICT", message: "Reload" } });
});
it("refuses malformed/contradictory envelopes and catches network or JSON failures", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  for (const value of [null, "text", {}, { ok: "yes" }, { ok: true }, { ok: false }, { ok: false, error: null }, { ok: false, error: "text" }, { ok: false, error: {} }, { ok: false, error: { code: 2 } }, { ok: false, error: { code: "X" } }, { ok: false, error: { code: "X", message: 1 } }]) {
    fetch.mockResolvedValueOnce(Response.json(value)); expect(await apiCall("/api/example")).toMatchObject({ ok: false, error: { code: "INVALID_RESPONSE" } });
  }
  fetch.mockResolvedValueOnce(Response.json({ ok: true, data: 1 }, { status: 500 }));
  expect(await apiCall("/api/example")).toMatchObject({ error: { code: "INVALID_RESPONSE" } });
  fetch.mockRejectedValueOnce(new Error("network")); expect(await apiCall("/api/example")).toMatchObject({ error: { code: "NETWORK_ERROR" } });
  fetch.mockResolvedValueOnce(new Response("broken json")); expect(await apiCall("/api/example")).toMatchObject({ error: { code: "NETWORK_ERROR" } });
});
it("preserves field refusals and interpolation parameters and refuses malformed public context", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const error = { code: "VALIDATION_FAILED", message: "Check fields", fieldErrors: { quantity: ["Too big"] }, params: { order: "00000001" } };
  fetch.mockResolvedValueOnce(Response.json({ ok: false, error }));
  expect(await apiCall("/api/example")).toEqual({ ok: false, error });
  for (const context of [{ params: null }, { params: [] }, { params: { count: 2 } }, { fieldErrors: null }, { fieldErrors: { quantity: "bad" } }, { fieldErrors: { quantity: [1] } }]) {
    fetch.mockResolvedValueOnce(Response.json({ ok: false, error: { ...error, ...context } }));
    expect(await apiCall("/api/example")).toMatchObject({ error: { code: "INVALID_RESPONSE" } });
  }
  fetch.mockResolvedValueOnce(Response.json([])); expect(await apiCall("/api/example")).toMatchObject({ error: { code: "INVALID_RESPONSE" } });
});
