/** Field name → messages, as shown next to the matching form field. */
export type FieldErrors = Record<string, string[]>;

/**
 * The result envelope of every server action and API route, mirrored from `@cpg/core`'s
 * `Result` because `ui` must not import `core`. Keep the two shapes identical.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fieldErrors?: FieldErrors; params?: Record<string, string> } };
