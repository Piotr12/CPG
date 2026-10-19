export interface ApiResponse {
  status: number;
  /** The `Idempotent-Replayed` header, or null. */
  replayed: string | null;
  text: string;
}

/**
 * Calls the API as an external tool does: the bearer token, and the given headers only. Writes need
 * an `Idempotency-Key` (`key`); user writes also need the `version` the caller loaded in the body.
 */
export async function callApi(
  baseUrl: string,
  method: string,
  path: string,
  secret: string,
  { key, body }: { key?: string; body?: unknown } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = { authorization: `Bearer ${secret}`, "content-type": "application/json" };
  if (key) headers["idempotency-key"] = key;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, replayed: response.headers.get("idempotent-replayed"), text: await response.text() };
}

export const json = (response: { text: string }) => JSON.parse(response.text);

/** A row of `GET /api/users`. */
export interface UserRow {
  id: string;
  username: string;
  active: boolean;
  version: number;
}
