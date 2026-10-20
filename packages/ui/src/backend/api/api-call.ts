import type { ApiResult } from "./result";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const invalid = (): ApiResult<never> => ({ ok: false, error: { code: "INVALID_RESPONSE", message: "The server returned an invalid response. Try again." } });

/** The shared client boundary preserves public error context and refuses malformed envelopes. */
export async function apiCall<T>(url: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    const body: unknown = await response.json();
    if (!record(body)) return invalid();
    if (body.ok === true && response.ok && "data" in body) return { ok: true, data: body.data as T };
    if (body.ok !== false || !record(body.error)) return invalid();
    const { code, message, params, fieldErrors } = body.error;
    if (typeof code !== "string" || typeof message !== "string") return invalid();
    if (params !== undefined && (!record(params) || !Object.values(params).every((value) => typeof value === "string"))) return invalid();
    if (fieldErrors !== undefined && (!record(fieldErrors) || !Object.values(fieldErrors).every((value) => Array.isArray(value) && value.every((item) => typeof item === "string")))) return invalid();
    return { ok: false, error: { code, message, ...(params === undefined ? {} : { params: params as Record<string, string> }),
      ...(fieldErrors === undefined ? {} : { fieldErrors: fieldErrors as Record<string, string[]> }) } };
  } catch {
    return { ok: false, error: { code: "NETWORK_ERROR", message: "The request failed. Try again." } };
  }
}
