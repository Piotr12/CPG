import { notFound } from "next/navigation";
import { AppError } from "@cpg/core";

/**
 * What `pending` resolves to, or the route's not-found state when it fails with one of `codes`: a
 * tenant missing from the database (`TENANT_NOT_FOUND`), a material this tenant doesn't have
 * (`MATERIAL_NOT_FOUND`). Any other failure propagates.
 */
export async function orNotFound<T>(pending: Promise<T>, codes: readonly string[]): Promise<T> {
  try {
    return await pending;
  } catch (error) {
    if (error instanceof AppError && codes.includes(error.code)) notFound();
    throw error;
  }
}
