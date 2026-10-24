import { cancelProductionOrder, closeEarlyProductionOrder } from "../../app/admin/[tenant]/production-orders/actions";
import { LifecycleControl } from "../document-lifecycle/lifecycle-control";
import Link from "next/link";
import type { CompletionView, Locale, MaterialSummary, NamedRecordView, ProductionOrderDetail, ProductionOrderView, TenantInfo } from "@cpg/core";
import { Callout } from "@cpg/ui/backend/feedback/callout";
import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { PRODUCTION_PAGE_SIZE } from "@cpg/core/validators/production-orders/production-order.schema";
import type { Messages } from "../../i18n/messages/en";
import { fill, shownQuantity } from "../forms/form-labels";
import { documentStatusTone } from "../document-lifecycle/status-tone";
import { PageLinks } from "../layout/page-links";
import { CompletionDialog } from "./completion-dialog";
import { CompletionHistory } from "./completion-history";
import { completionInputs } from "./completion-inputs";
import { productionLabels } from "./labels";
import { plural } from "./plural";
import { ProductionDialog } from "./production-dialog";
import { ProductionRequirements } from "./production-requirements";

interface Props { tenant: TenantInfo; orders: ProductionOrderView[]; order?: ProductionOrderDetail; materials: MaterialSummary[]; locations: NamedRecordView[];
  total: number; page: number; messages: Messages; locale: Locale;
  /** A detail page's completions (one page of them) and the units every material's quantities may be entered in. */
  completions?: CompletionView[]; completionsPage?: number; units?: Record<string, string[]> }
export function ProductionScreen({ tenant, orders, order, materials, locations, total, page, messages, locale, completions = [], completionsPage = 1, units = {} }: Props) {
  const t = productionLabels(messages);
  const path = `/admin/${tenant.code}/production-orders`;
  const byMaterial = new Map(materials.map((m) => [m.id, m]));
  const location = (code: string) => `${code} ${locations.find((l) => l.id === code)!.name}`;
  const output = (row: ProductionOrderView) => `${row.output} ${byMaterial.get(row.output)!.description}`;
  const quantity = (row: ProductionOrderView) => `${shownQuantity(row.quantity)} ${byMaterial.get(row.output)!.baseUnit}`;
  const recipe = (row: ProductionOrderView) => <Link className="underline" href={`/admin/${tenant.code}/boms/${row.bom}?revision=${row.revision}`}>{row.bom} / {row.revision}</Link>;
  const status = (value: ProductionOrderView["status"]) => <StatusBadge {...documentStatusTone(value)}>{t.states[value]}</StatusBadge>;
  const columns: DataTableColumn<ProductionOrderView>[] = [
    { id: "id", header: t.id, kind: "id", cell: (row) => <Link className="underline" href={`${path}/${row.id}`}>{row.id}</Link> },
    { id: "output", header: t.output, kind: "longText", cell: output },
    { id: "quantity", header: t.quantity, kind: "quantity", cell: quantity },
    { id: "location", header: t.location, kind: "longText", priority: 2, cell: (row) => location(row.location) },
    { id: "finish", header: t.finish, kind: "date", priority: 2, cell: (row) => row.plannedFinish },
    { id: "start", header: t.start, kind: "date", priority: 3, cell: (row) => row.plannedStart },
    { id: "recipe", header: t.recipe, kind: "text", priority: 3, cell: recipe },
    { id: "status", header: t.status, kind: "status", cell: (row) => status(row.status) },
  ];
  const pages = Math.ceil(total / PRODUCTION_PAGE_SIZE);
  const actions = !tenant.readOnly && <>
    {(!order || order.status === "open") && <ProductionDialog context={{ tenant: tenant.code, generation: tenant.generation }} labels={t} materials={materials} locations={locations} order={order} />}
    {order && <CompletionDialog context={{ tenant: tenant.code, generation: tenant.generation }} labels={t} order={order}
      outputUnits={units[order.output] ?? [byMaterial.get(order.output)!.baseUnit]} locationLabel={location(order.location)}
      inputs={completionInputs(order, materials, units)}
      canPost={order.status === "open"} />}
    {order && <LifecycleControl kind="productionOrder" available={order.status === "open"} processed={order.hasProcessing}
      subject={`${t.title} ${order.id}`} version={order.version} quantities={[`${shownQuantity(order.outstanding)} ${byMaterial.get(order.output)!.baseUnit}`]}
      labels={messages.lifecycle} errors={messages.errors}
      cancel={cancelProductionOrder.bind(null, tenant.code, tenant.generation, order.id)} closeEarly={closeEarlyProductionOrder.bind(null, tenant.code, tenant.generation, order.id)} />}
  </>;
  const shortages = order?.shortages.length ?? 0;
  return <div lang={locale}>
    <PageHeader title={order ? fill(t.detailHeading, { id: order.id }) : fill(t.heading, { tenant: tenant.name })}
      meta={order && status(order.status)} description={t.intro} actions={actions} />
    <div className="flex flex-col gap-8">
    {order ? <>
      <dl className="grid gap-4 rounded-md border p-4 text-sm sm:grid-cols-3">
        {[{ label: t.output, value: output(order) }, { label: t.location, value: location(order.location) }, { label: t.quantity, value: quantity(order) },
          { label: messages.lifecycle.abandoned, value: `${shownQuantity(order.abandoned)} ${byMaterial.get(order.output)!.baseUnit}` },
          { label: t.produced, value: `${shownQuantity(order.produced)} ${byMaterial.get(order.output)!.baseUnit}` },
          { label: t.outstanding, value: `${shownQuantity(order.outstanding)} ${byMaterial.get(order.output)!.baseUnit}` },
          { label: t.entered, value: `${order.enteredQuantity} ${order.enteredUnit} (${order.denominator} ${order.enteredUnit} = ${order.numerator} ${byMaterial.get(order.output)!.baseUnit})` },
          { label: t.finish, value: order.plannedFinish }, { label: t.start, value: order.plannedStart },
          { label: t.leadTime, value: fill(t.leadTimeDays, { days: String(order.leadTimeDays) }) }, { label: t.recipe, value: recipe(order) }].map(({ label, value }) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 wrap-anywhere">{value}</dd></div>)}
      </dl>
      {order.status !== "open" ? <Callout tone="neutral">{fill(t.resolved, { status: t.states[order.status] })}</Callout>
        : shortages ? <Callout tone="warning" title={plural(t.shortageTitle, shortages)}>{t.shortageBody}</Callout>
        : <Callout tone="neutral">{t.sufficient}</Callout>}
      <ProductionRequirements labels={t} components={order.components} materials={materials} tenant={tenant.code} />
      <CompletionHistory completions={completions} page={completionsPage} materials={materials} labels={t} path={`${path}/${order.id}`}
        reversible={tenant.readOnly ? undefined : { context: { tenant: tenant.code, generation: tenant.generation },
          order: { id: order.id, output: order.output, location: location(order.location), produced: order.produced } }} />
    </> : <DataTable label={t.title} columns={columns} rows={orders} rowKey={(row) => row.id} empty={t.empty}
      pagination={<PageLinks page={page} pages={pages} labels={t} href={(target) => `${path}?page=${target}`} />} />}
    </div>
  </div>;
}
