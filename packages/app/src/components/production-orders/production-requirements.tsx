import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { MaterialSummary, ProductionComponent } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { shownQuantity } from "../forms/form-labels";
import type { ProductionLabels } from "./labels";

const isShort = (row: ProductionComponent) => shownQuantity(row.shortage) !== "0";

/** Direct pinned quantities compared with current physical stock, never projected or reserved inventory. A short row is marked in the warning tone. */
export function ProductionRequirements({ components, labels: t, materials, tenant }: { components: ProductionComponent[]; labels: ProductionLabels; materials: MaterialSummary[]; tenant: string }) {
  const columns: DataTableColumn<ProductionComponent>[] = [
    { id: "material", header: t.component, kind: "longText", cell: (row) => <Link className="underline" href={`/admin/${tenant}/materials/${row.material}`}>{row.material} {materials.find(({ id }) => id === row.material)!.description}</Link> },
    { id: "required", header: t.required, kind: "quantity", cell: (row) => `${shownQuantity(row.required)} ${row.baseUnit}` },
    { id: "available", header: t.available, kind: "quantity", priority: 2, cell: (row) => `${shownQuantity(row.available)} ${row.baseUnit}` },
    {
      id: "shortage", header: t.shortage, kind: "quantity",
      cell: (row) => isShort(row)
        ? <span className="inline-flex items-center gap-1 text-warning" data-shortage><TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />{shownQuantity(row.shortage)} {row.baseUnit}</span>
        : `${shownQuantity(row.shortage)} ${row.baseUnit}`,
    },
  ];
  return <DataTable label={t.components} columns={columns} rows={components} rowKey={(row) => row.material} rowTone={(row) => (isShort(row) ? "warning" : undefined)} empty={t.empty} />;
}
