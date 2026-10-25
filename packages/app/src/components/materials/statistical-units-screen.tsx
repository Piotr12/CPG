import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { Locale, StatisticalFactorView } from "@cpg/core";
import { STATISTICAL_UNIT } from "@cpg/core/validators/units/unit-registry";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Button } from "@cpg/ui/components/button";
import type { Messages } from "../../i18n/messages/en";
import { fill } from "../forms/form-labels";

interface StatisticalUnitsScreenProps {
  tenant: { code: string; name: string };
  /** Every finished product, by ID, with its SU factor or `null`. */
  rows: StatisticalFactorView[];
  locale: Locale;
  messages: Messages;
}

/**
 * The body of the Statistical units page (#239): what SU is for, how many finished products have a
 * factor, and each one's factor or "Not set", linking to the product's page where the factor is set.
 * It writes nothing, so every account and a read-only tenant see it unchanged.
 */
export function StatisticalUnitsScreen({ tenant, rows, locale, messages }: StatisticalUnitsScreenProps) {
  const t = messages.statisticalUnits;
  const path = `/admin/${tenant.code}/materials`;
  const product = (row: StatisticalFactorView) => `${row.id} — ${row.description}${row.active ? "" : ` (${t.inactive})`}`;
  const columns: DataTableColumn<StatisticalFactorView>[] = [
    { id: "product", header: t.columns.product, kind: "longText", cell: product },
    {
      id: "factor",
      header: t.columns.factor,
      kind: "text",
      cell: (row) =>
        row.perBaseUnit === null ? (
          <span className="inline-flex items-center gap-1 text-warning" data-factor-missing>
            <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
            {t.notSet}
          </span>
        ) : (
          <span className="whitespace-nowrap">{`1 ${row.baseUnit} = ${row.perBaseUnit} ${STATISTICAL_UNIT}`}</span>
        ),
    },
    {
      id: "otherUnits",
      header: t.columns.otherUnits,
      kind: "longText",
      priority: 2,
      cell: (row) => row.otherUnits.map(({ unit, statisticalUnits }) => `1 ${unit} = ${statisticalUnits} ${STATISTICAL_UNIT}`).join(" · "),
    },
  ];
  const withFactor = rows.filter((row) => row.perBaseUnit !== null).length;

  return (
    <div lang={locale} className="min-w-0">
      <PageHeader title={fill(t.heading, { tenant: tenant.name })} description={t.intro} />
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-sm text-muted-foreground" data-factor-count>
          {fill(t.count, { count: String(withFactor), total: String(rows.length) })}
        </p>
        <DataTable
          label={t.label}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          rowActions={(row) => (
            <Button asChild variant="outline" size="sm">
              <Link href={`${path}/${row.id}`} aria-label={fill(t.changeOf, { product: `${row.id} ${row.description}` })}>
                {t.change}
              </Link>
            </Button>
          )}
          actionsLabel={t.actions}
          empty={fill(t.empty, { tenant: tenant.name })}
        />
      </div>
    </div>
  );
}
