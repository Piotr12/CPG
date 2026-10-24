export interface ApiResponse {
  status: number;
  /** The `Idempotent-Replayed` header, or null. */
  replayed: string | null;
  text: string;
}

/**
 * Calls the API as an external tool does: the bearer token, and the given headers only. Writes need
 * an `Idempotency-Key` (`key`); user writes also need the `version` the caller loaded in the body,
 * and Test writes the tenant's `Dataset-Generation` (`generation`).
 */
export async function callApi(
  baseUrl: string,
  method: string,
  path: string,
  secret: string,
  { key, body, generation }: { key?: string; body?: unknown; generation?: number } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = { authorization: `Bearer ${secret}`, "content-type": "application/json" };
  if (key) headers["idempotency-key"] = key;
  if (generation !== undefined) headers["dataset-generation"] = String(generation);
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, replayed: response.headers.get("idempotent-replayed"), text: await response.text() };
}

export const json = (response: { text: string }) => JSON.parse(response.text);

/** How many rows one page of a paged tenant list holds (`?page=N`): `DOCUMENT_PAGE_SIZE` and its siblings in `@cpg/core`. */
export const LIST_PAGE_SIZE = 100;

/**
 * Every row of a paged list: `readPage` is asked for page 1, 2, … until a page comes back short of
 * `LIST_PAGE_SIZE`, so a list that has grown past one page is read whole (#201).
 */
export async function allPages<T>(readPage: (page: number) => Promise<T[]>): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page += 1) {
    const rows = await readPage(page);
    all.push(...rows);
    if (rows.length < LIST_PAGE_SIZE) return all;
  }
}

/** A row of `GET /api/users`. */
export interface UserRow {
  id: string;
  username: string;
  active: boolean;
  version: number;
}
