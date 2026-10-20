import Link from "next/link";
import type { MaterialSummary, NamedRecordView } from "@cpg/core";
import { Badge } from "@cpg/ui/components/badge";
import type { FormOption } from "../forms/form-labels";

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

/** The active materials a new row may pick, each with its base unit: a form hint can't follow the choice. */
export function materialOptions(materials: MaterialSummary[]): FormOption[] {
  return materials
    .filter(({ active }) => active)
    .map(({ id, description, baseUnit }) => ({ value: id, label: `${id} — ${description} (${baseUnit})` }));
}

/** The active locations a new row may pick. */
export function locationOptions(locations: NamedRecordView[]): FormOption[] {
  return locations.filter(({ active }) => active).map(({ id, name }) => ({ value: id, label: `${id} — ${name}` }));
}

/** A row's material: its ID linking to its page, its description, and Inactive when it is. */
export function MaterialCell({ tenant, row, inactive }: { tenant: string; row: { material: string } & ReferenceDetails; inactive: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Link href={`/admin/${tenant}/materials/${row.material}`} className="font-mono underline underline-offset-4">
        {row.material}
      </Link>
      <span>{row.materialDescription}</span>
      {!row.materialActive && <Badge variant="destructive">{inactive}</Badge>}
    </span>
  );
}

/** A row's location: its ID and name, and Inactive when it is. */
export function LocationCell({ row, inactive }: { row: { location: string } & ReferenceDetails; inactive: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-mono">{row.location}</span>
      <span className="text-muted-foreground">{row.locationName}</span>
      {!row.locationActive && <Badge variant="destructive">{inactive}</Badge>}
    </span>
  );
}
