"use client";

import type { ConversionView, MaterialSummary } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { ConversionActions } from "./conversion-actions";
import { conversionText, inverseText, type MaterialsLabels, type TenantContext } from "./labels";

interface ConversionsTableProps {
  material: MaterialSummary;
  conversions: ConversionView[];
  context: TenantContext;
  labels: MaterialsLabels;
  /** Shows each row's menu: only the admin maintains master data (TEN-004). */
  editable: boolean;
}

/** A material's unit conversions, as "1 case = 12 each" with the indicative inverse (MAT-021). */
export function ConversionsTable({ material, conversions, context, labels, editable }: ConversionsTableProps) {
  const t = labels.conversions;
  const columns: DataTableColumn<ConversionView>[] = [
    { id: "unit", header: t.columns.unit, kind: "text", cell: (row) => <span className="font-medium">{row.unit}</span> },
    { id: "conversion", header: t.columns.conversion, kind: "text", cell: (row) => conversionText(row, material.baseUnit) },
    {
      id: "inverse",
      header: t.columns.inverse,
      kind: "text",
      priority: 2,
      cell: (row) => <span className="text-muted-foreground">{inverseText(row, material.baseUnit, labels)}</span>,
    },
  ];

  return (
    <DataTable
      label={t.heading}
      actionsLabel={t.columns.actions}
      columns={columns}
      rows={conversions}
      rowKey={(row) => row.unit}
      rowActions={
        editable
          ? (row) => <ConversionActions material={material} conversion={row} context={context} labels={labels} />
          : undefined
      }
      empty={t.empty}
    />
  );
}
