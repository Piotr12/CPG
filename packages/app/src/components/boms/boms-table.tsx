import Link from "next/link";
import type { BomView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { ActiveStatus, InactiveMark } from "../master-data/active-status";
import { EmptyText } from "../master-data/empty-text";
import { fill, lineSummary, type BomsLabels, type MaterialsById } from "./labels";

interface BomsTableProps {
  tenant: { code: string; name: string };
  boms: BomView[];
  materials: MaterialsById;
  labels: BomsLabels;
  /** The admin's empty state also says how to start. */
  editable: boolean;
}

/** A tenant's BOMs with their current recipes, by output, then priority (BOM-008); each ID opens the BOM. */
export function BomsTable({ tenant, boms, materials, labels, editable }: BomsTableProps) {
  const t = labels.columns;
  const columns: DataTableColumn<BomView>[] = [
    {
      id: "id",
      header: t.id,
      kind: "id",
      cell: (bom) => (
        <Link href={`/admin/${tenant.code}/boms/${bom.id}`} className="underline underline-offset-4">
          {bom.id}
        </Link>
      ),
    },
    {
      id: "output",
      header: t.output,
      kind: "longText",
      cell: (bom) => {
        const output = materials.get(bom.output)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/admin/${tenant.code}/materials/${output.id}`} className="font-mono underline underline-offset-4">
              {output.id}
            </Link>
            <span>{output.description}</span>
            <InactiveMark active={output.active} label={labels.inactive} />
          </span>
        );
      },
    },
    { id: "priority", header: t.priority, kind: "quantity", cell: (bom) => bom.priority },
    { id: "revision", header: t.revision, kind: "text", priority: 2, cell: (bom) => fill(labels.revisionShort, { number: String(bom.revision) }) },
    { id: "validFrom", header: t.validFrom, kind: "date", priority: 2, cell: (bom) => bom.validFrom },
    { id: "validThrough", header: t.validThrough, kind: "date", priority: 2, cell: (bom) => bom.validThrough ?? labels.noEnd },
    {
      id: "components",
      header: t.components,
      kind: "longText",
      priority: 3,
      cell: (bom) => {
        const summary = bom.components.map((line) => lineSummary(line, materials)).join(", ");
        return (
          <span title={summary} className="line-clamp-2 text-muted-foreground">
            {summary}
          </span>
        );
      },
    },
    { id: "status", header: t.status, kind: "status", cell: (bom) => <ActiveStatus active={bom.active} labels={labels.status} /> },
  ];

  return (
    <DataTable
      label={labels.link}
      columns={columns}
      rows={boms}
      rowKey={(bom) => bom.id}
      empty={<EmptyText labels={labels} tenant={tenant.name} editable={editable} />}
    />
  );
}
