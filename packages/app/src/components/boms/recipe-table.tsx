import Link from "next/link";
import type { BomComponentView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { InactiveMark } from "../master-data/active-status";
import { enteredAs, shownQuantity, type BomsLabels, type MaterialsById } from "./labels";

interface RecipeTableProps {
  tenant: string;
  lines: BomComponentView[];
  materials: MaterialsById;
  labels: BomsLabels;
  /** The table's accessible name, such as the recipe heading. */
  label: string;
}

/** A revision's lines: each component, its quantity in its base unit, and how it was entered (MAT-019). */
export function RecipeTable({ tenant, lines, materials, labels, label }: RecipeTableProps) {
  const t = labels.recipe.columns;
  const columns: DataTableColumn<BomComponentView>[] = [
    {
      id: "material",
      header: t.material,
      kind: "longText",
      cell: (line) => {
        const material = materials.get(line.material)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/admin/${tenant}/materials/${material.id}`} className="font-mono underline underline-offset-4">
              {material.id}
            </Link>
            <span>{material.description}</span>
            <InactiveMark active={material.active} label={labels.inactive} />
          </span>
        );
      },
    },
    {
      id: "quantity",
      header: t.quantity,
      kind: "quantity",
      cell: (line) => `${shownQuantity(line.quantity)} ${materials.get(line.material)!.baseUnit}`,
    },
    {
      id: "enteredAs",
      header: t.enteredAs,
      kind: "longText",
      priority: 2,
      cell: (line) => <span className="text-muted-foreground">{enteredAs(line, materials, labels)}</span>,
    },
  ];

  return <DataTable label={label} columns={columns} rows={lines} rowKey={(line) => line.material} empty="" />;
}
