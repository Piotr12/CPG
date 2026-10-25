import Link from "next/link";
import type { MaterialSummary, NamedRecordView } from "@cpg/core";
import { Highlight } from "@cpg/ui/backend/tables/highlight";
import { InactiveMark } from "./active-status";

/*
 * What the planning parameters and safety stock screens share: both list rows keyed by a material
 * and a location, so both show the material's description and base unit and the location's name,
 * and offer only active ones for a new row (MAT-029, LFC-019).
 */

/** What a row shows about its material and location, beside their business IDs. */
export interface ReferenceDetails {
  materialDescription: string;
  materialActive: boolean;
  baseUnit: string;
  locationName: string;
  locationActive: boolean;
}

/** `rows` with their material's and location's details, from the tenant's full lists. */
export function withReferences<T extends { material: string; location: string }>(
  rows: T[],
  materials: MaterialSummary[],
  locations: NamedRecordView[],
): (T & ReferenceDetails)[] {
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const locationById = new Map(locations.map((location) => [location.id, location]));
  return rows.map((row) => {
    // Rows reference only records of the same tenant, which are never deleted.
    const material = materialById.get(row.material)!;
    const location = locationById.get(row.location)!;
    return {
      ...row,
      materialDescription: material.description,
      materialActive: material.active,
      baseUnit: material.baseUnit,
      locationName: location.name,
      locationActive: location.active,
    };
  });
}

interface CellProps {
  row: { material: string; location: string } & ReferenceDetails;
  inactive: string;
  /** A list's search, whose words are marked in the ID and the description or name (#217). */
  query?: string;
}

/** A row's material: its ID linking to its page, its description, and Inactive when it is. */
export function MaterialCell({ tenant, row, inactive, query = "" }: CellProps & { tenant: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Link href={`/admin/${tenant}/materials/${row.material}`} className="font-mono underline underline-offset-4">
        <Highlight text={row.material} query={query} />
      </Link>
      <span>
        <Highlight text={row.materialDescription} query={query} />
      </span>
      <InactiveMark active={row.materialActive} label={inactive} />
    </span>
  );
}

/** A row's location: its ID and name, and Inactive when it is. */
export function LocationCell({ row, inactive, query = "" }: CellProps) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-mono">
        <Highlight text={row.location} query={query} />
      </span>
      <span className="text-muted-foreground">
        <Highlight text={row.locationName} query={query} />
      </span>
      <InactiveMark active={row.locationActive} label={inactive} />
    </span>
  );
}
