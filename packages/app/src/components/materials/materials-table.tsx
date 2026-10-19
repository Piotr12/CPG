import Link from "next/link";
import type { MaterialSummary } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import type { MaterialsLabels } from "./labels";

/** A tenant's materials by ID; each ID opens the material's page. */
export function MaterialsTable({ tenant, materials, labels }: { tenant: string; materials: MaterialSummary[]; labels: MaterialsLabels }) {
  const t = labels.columns;
  const columns: DataTableColumn<MaterialSummary>[] = [
    {
      id: "id",
      header: t.id,
      cell: (material) => (
        <Link href={`/admin/${tenant}/materials/${material.id}`} className="font-mono underline underline-offset-4">
          {material.id}
        </Link>
      ),
    },
    {
      id: "description",
      header: t.description,
      cell: (material) => (
        <span className={material.active ? "font-medium" : "text-muted-foreground"}>{material.description}</span>
      ),
      // A long description wraps instead of widening the row (shadcn cells never wrap otherwise).
      className: "whitespace-normal wrap-anywhere",
    },
    { id: "type", header: t.type, cell: (material) => <Badge variant="outline">{labels.types[material.type]}</Badge> },
    { id: "baseUnit", header: t.baseUnit, cell: (material) => material.baseUnit, className: "hidden sm:table-cell" },
    {
      id: "status",
      header: t.status,
      cell: (material) =>
        material.active ? (
          <Badge variant="secondary">{labels.status.active}</Badge>
        ) : (
          <Badge variant="destructive">{labels.status.inactive}</Badge>
        ),
    },
  ];

  return (
    <DataTable
      label={labels.link}
      columns={columns}
      rows={materials}
      rowKey={(material) => material.id}
      empty={labels.empty}
    />
  );
}
