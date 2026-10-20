import { Location, type EntityManager } from "@cpg/db";
import { findNamedRecord, type NamedRecordLookup } from "../named-records/find-named-record";

/** How a location is found and named in errors; `LocationService` builds its kind on it. */
export const LOCATION_LOOKUP = { entity: Location, noun: "location", codePrefix: "LOCATION" } satisfies NamedRecordLookup;

/** The location with business ID `id` in `em`'s tenant, or `LOCATION_NOT_FOUND`. */
export async function findLocation(em: EntityManager, id: string): Promise<Location> {
  return (await findNamedRecord(em, LOCATION_LOOKUP, id)) as Location;
}
