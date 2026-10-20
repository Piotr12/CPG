import type { ErrorParams, FieldErrors } from "./errors";

export interface ErrorBody {
  code: string;
  message: string;
  fieldErrors?: FieldErrors;
  params?: ErrorParams;
}

/** The one envelope server actions and route handlers return. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorBody };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(error: ErrorBody): Result<never> {
  return { ok: false, error };
}
