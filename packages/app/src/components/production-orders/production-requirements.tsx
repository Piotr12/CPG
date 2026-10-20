import Link from "next/link";
import type { MaterialSummary, ProductionComponent } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { shownQuantity } from "../forms/form-labels";
import type { ProductionLabels } from "./labels";

/** Direct pinned quantities compared with current physical stock, never projected or reserved inventory. */
export function ProductionRequirements({ components, labels: t, materials, tenant }: { components: ProductionComponent[]; labels: ProductionLabels; materials: MaterialSummary[]; tenant: string }) {
  const columns: DataTableColumn<ProductionComponent>[] = [
    { id: "material", header: t.component, cell: (row) => <Link className="underline" href={`/admin/${tenant}/materials/${row.material}`}>{row.material} {materials.find(({ id }) => id === row.material)!.description}</Link>, className: "whitespace-normal wrap-anywhere" },
    { id: "required", header: t.required, cell: (row) => `${shownQuantity(row.required)} ${row.baseUnit}`, className: "whitespace-normal" },
    { id: "available", header: t.available, cell: (row) => `${shownQuantity(row.available)} ${row.baseUnit}`, className: "hidden whitespace-normal sm:table-cell" },
    { id: "shortage", header: t.shortage, cell: (row) => `${shownQuantity(row.shortage)} ${row.baseUnit}`, className: "whitespace-normal" },
  ];
  return <DataTable label={t.components} columns={columns} rows={components} rowKey={(row) => row.material} empty={t.empty} />;
}
