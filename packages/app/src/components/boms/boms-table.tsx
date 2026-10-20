import Link from "next/link";
import type { BomView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
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
      cell: (bom) => (
        <Link href={`/admin/${tenant.code}/boms/${bom.id}`} className="font-mono underline underline-offset-4">
          {bom.id}
        </Link>
      ),
    },
    {
      id: "output",
      header: t.output,
      cell: (bom) => {
        const output = materials.get(bom.output)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/admin/${tenant.code}/materials/${output.id}`} className="font-mono underline underline-offset-4">
              {output.id}
            </Link>
            <span>{output.description}</span>
            {!output.active && <Badge variant="destructive">{labels.inactive}</Badge>}
          </span>
        );
      },
      className: "whitespace-normal wrap-anywhere",
    },
    { id: "priority", header: t.priority, cell: (bom) => bom.priority, className: "text-right" },
    { id: "revision", header: t.revision, cell: (bom) => fill(labels.revisionShort, { number: String(bom.revision) }) },
    { id: "validFrom", header: t.validFrom, cell: (bom) => bom.validFrom, className: "hidden sm:table-cell" },
    { id: "validThrough", header: t.validThrough, cell: (bom) => bom.validThrough ?? labels.noEnd, className: "hidden sm:table-cell" },
    {
      id: "components",
      header: t.components,
      cell: (bom) => {
        const summary = bom.components.map((line) => lineSummary(line, materials)).join(", ");
        return (
          <span title={summary} className="line-clamp-2 text-muted-foreground">
            {summary}
          </span>
        );
      },
      className: "hidden whitespace-normal md:table-cell",
    },
    {
      id: "status",
      header: t.status,
      cell: (bom) =>
        bom.active ? <Badge variant="secondary">{labels.status.active}</Badge> : <Badge variant="destructive">{labels.status.inactive}</Badge>,
    },
  ];

  return (
    <DataTable
      label={labels.link}
      columns={columns}
      rows={boms}
      rowKey={(bom) => bom.id}
      empty={[fill(labels.empty, { tenant: tenant.name }), ...(editable ? [labels.emptyHint] : [])].join(" ")}
    />
  );
}
