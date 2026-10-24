import Link from "next/link";
import type { MaterialSummary } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { ActiveStatus } from "../master-data/active-status";
import { EmptyText } from "../master-data/empty-text";
import type { MaterialsLabels } from "./labels";

interface MaterialsTableProps {
  tenant: { code: string; name: string };
  materials: MaterialSummary[];
  labels: MaterialsLabels;
  /** The admin's empty state also says how to start. */
  editable: boolean;
}

/** A tenant's materials by ID; each ID opens the material's page. */
export function MaterialsTable({ tenant, materials, labels, editable }: MaterialsTableProps) {
  const t = labels.columns;
  const columns: DataTableColumn<MaterialSummary>[] = [
    {
      id: "id",
      header: t.id,
      kind: "id",
      cell: (material) => (
        <Link href={`/admin/${tenant.code}/materials/${material.id}`} className="underline underline-offset-4">
          {material.id}
        </Link>
      ),
    },
    {
      id: "description",
      header: t.description,
      kind: "longText",
      cell: (material) => (
        <span className={material.active ? "font-medium" : "text-muted-foreground"}>{material.description}</span>
      ),
    },
    { id: "type", header: t.type, kind: "text", priority: 2, cell: (material) => <Badge variant="outline">{labels.types[material.type]}</Badge> },
    { id: "baseUnit", header: t.baseUnit, kind: "text", priority: 2, cell: (material) => material.baseUnit },
    { id: "status", header: t.status, kind: "status", cell: (material) => <ActiveStatus active={material.active} labels={labels.status} /> },
  ];

  return (
    <DataTable
      label={labels.link}
      columns={columns}
      rows={materials}
      rowKey={(material) => material.id}
      empty={<EmptyText labels={labels} tenant={tenant.name} editable={editable} />}
    />
  );
}
