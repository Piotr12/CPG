import { Location, type EntityManager } from "@cpg/db";
import { ConflictError } from "../../http/errors";
import { findNamedRecord, namedRecordNotFound, type NamedRecordLookup } from "../named-records/find-named-record";

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
  return assertLocationActive(await findLocation(em, id));
}

/** The locations with business IDs `ids` in `em`'s tenant, keyed by ID, in one query; an ID it doesn't have is absent. */
export async function locationsByCode(em: EntityManager, ids: readonly string[]): Promise<Map<string, Location>> {
  return new Map((await em.find(Location, { code: { $in: [...new Set(ids)] } })).map((location) => [location.code, location]));
}

/** `findActiveLocation` over locations loaded by `locationsByCode`, with the same errors. */
export function pickActiveLocation(locations: ReadonlyMap<string, Location>, id: string): Location {
  const location = locations.get(id);
  if (!location) throw namedRecordNotFound(LOCATION_LOOKUP, id);
  return assertLocationActive(location);
}

function assertLocationActive(location: Location): Location {
  if (!location.active) {
    throw new ConflictError(`Location ${location.code} is inactive, so it can't be picked for new entries.`, "LOCATION_INACTIVE");
  }
  return location;
}
