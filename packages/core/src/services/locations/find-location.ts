import { Location, type EntityManager } from "@cpg/db";
import { ConflictError } from "../../http/errors";
import { findNamedRecord, type NamedRecordLookup } from "../named-records/find-named-record";

/** How a location is found and named in errors; `LocationService` builds its kind on it. */
export const LOCATION_LOOKUP = { entity: Location, noun: "location", codePrefix: "LOCATION" } satisfies NamedRecordLookup;

/** The location with business ID `id` in `em`'s tenant, or `LOCATION_NOT_FOUND`. */
export async function findLocation(em: EntityManager, id: string): Promise<Location> {
  return (await findNamedRecord(em, LOCATION_LOOKUP, id)) as Location;
}

/**
 * `findLocation` for a new entry that references the location: an inactive one can't be picked
 * (LFC-019, locations spec Q5), so it is `LOCATION_INACTIVE`. Entries made before stay valid.
 */
export async function findActiveLocation(em: EntityManager, id: string): Promise<Location> {
  const location = await findLocation(em, id);
  if (!location.active) {
    throw new ConflictError(`Location ${id} is inactive, so it can't be picked for new entries.`, "LOCATION_INACTIVE");
  }
  return location;
}
