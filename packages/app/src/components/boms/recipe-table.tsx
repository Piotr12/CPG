import Link from "next/link";
import type { BomComponentView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
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
      cell: (line) => {
        const material = materials.get(line.material)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/admin/${tenant}/materials/${material.id}`} className="font-mono underline underline-offset-4">
              {material.id}
            </Link>
            <span>{material.description}</span>
            {!material.active && <Badge variant="destructive">{labels.inactive}</Badge>}
          </span>
        );
      },
      className: "whitespace-normal wrap-anywhere",
    },
    {
      id: "quantity",
      header: t.quantity,
      cell: (line) => `${shownQuantity(line.quantity)} ${materials.get(line.material)!.baseUnit}`,
      className: "text-right",
    },
    {
      id: "enteredAs",
      header: t.enteredAs,
      cell: (line) => <span className="text-muted-foreground">{enteredAs(line, materials, labels)}</span>,
      className: "whitespace-normal",
    },
  ];

  return <DataTable label={label} columns={columns} rows={lines} rowKey={(line) => line.material} empty="" />;
}
