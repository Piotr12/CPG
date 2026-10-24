import type { EntityManager, NamedRecord, NamedRecordEntity } from "@cpg/db";
import { NotFoundError } from "../../http/errors";

/** What finding a record of one kind needs: its entity and how its not-found error is named. */
export interface NamedRecordLookup {
  entity: NamedRecordEntity;
  /** The word in messages: `"location"`. */
  noun: string;
  /** The error-code prefix: `"LOCATION"` → `LOCATION_NOT_FOUND`. */
  codePrefix: string;
}

/**
 * The record of `kind` with business ID `id` in `em`'s tenant, or `{KIND}_NOT_FOUND`, another
 * tenant's ID included (TEN-014). A leaf module, so services that reference a location load it
 * without importing its service. `refresh` re-reads a row already in the identity map.
 */
export async function findNamedRecord(
  em: EntityManager,
  kind: NamedRecordLookup,
  id: string,
  options: { refresh?: boolean } = {},
): Promise<NamedRecord> {
  const record = await em.findOne(kind.entity, { code: id }, options);
  if (!record) throw namedRecordNotFound(kind, id);
  return record;
}

/** `{KIND}_NOT_FOUND`: this tenant has no record of `kind` with business ID `id`. */
export function namedRecordNotFound(kind: NamedRecordLookup, id: string): NotFoundError {
  return new NotFoundError(`${kind.codePrefix}_NOT_FOUND`, `There is no ${kind.noun} ${id} in this tenant.`);
}
