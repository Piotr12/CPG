import { cancelProductionOrder, closeEarlyProductionOrder } from "../../app/admin/[tenant]/production-orders/actions";
import { LifecycleControl } from "../document-lifecycle/lifecycle-control";
import Link from "next/link";
import type { CompletionView, Locale, MaterialSummary, NamedRecordView, ProductionOrderDetail, ProductionOrderView, TenantInfo } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { PRODUCTION_PAGE_SIZE } from "@cpg/core/validators/production-orders/production-order.schema";
import type { Messages } from "../../i18n/messages/en";
import { fill, shownQuantity } from "../forms/form-labels";
import { PageLinks } from "../layout/page-links";
import { CompletionDialog } from "./completion-dialog";
import { CompletionHistory } from "./completion-history";
import { completionInputs } from "./completion-inputs";
import { productionLabels } from "./labels";
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
  const columns: DataTableColumn<ProductionOrderView>[] = [
    { id: "id", header: t.id, cell: (row) => <Link className="font-mono underline" href={`${path}/${row.id}`}>{row.id}</Link> },
    { id: "output", header: t.output, cell: output, className: "whitespace-normal wrap-anywhere" },
    { id: "quantity", header: t.quantity, cell: quantity, className: "whitespace-normal" },
    { id: "location", header: t.location, cell: (row) => location(row.location), className: "hidden whitespace-normal md:table-cell" },
    { id: "finish", header: t.finish, cell: (row) => row.plannedFinish, className: "hidden sm:table-cell" },
    { id: "start", header: t.start, cell: (row) => row.plannedStart, className: "hidden lg:table-cell" },
    { id: "recipe", header: t.recipe, cell: recipe, className: "hidden lg:table-cell" },
    { id: "status", header: t.status, cell: (row) => <Badge variant="secondary">{t.states[row.status]}</Badge>, className: "hidden sm:table-cell" },
  ];
  const pages = Math.ceil(total / PRODUCTION_PAGE_SIZE);
  return <div lang={locale} className="flex flex-col gap-6">
    {order && <Link className="text-sm underline" href={path}>{t.backList}</Link>}
    <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
      <h1 className="text-2xl font-semibold">{order ? fill(t.detailHeading, { id: order.id }) : fill(t.heading, { tenant: tenant.name })}</h1>
      <div className="flex flex-wrap items-start gap-2">
        {!tenant.readOnly && (!order || order.status === "open") && <ProductionDialog context={{ tenant: tenant.code, generation: tenant.generation }} labels={t} materials={materials} locations={locations} order={order} />}
        {!tenant.readOnly && order && <CompletionDialog context={{ tenant: tenant.code, generation: tenant.generation }} labels={t} order={order}
          outputUnits={units[order.output] ?? [byMaterial.get(order.output)!.baseUnit]} locationLabel={location(order.location)}
          inputs={completionInputs(order, materials, units)}
          canPost={order.status === "open"} />}
      </div>
    </div>
    <p className="text-sm text-muted-foreground">{t.intro}</p>
    {order ? <>
      <LifecycleControl available={!tenant.readOnly && order.status === "open"} processed={order.hasProcessing}
        subject={`${t.title} ${order.id}`} version={order.version} quantities={[`${shownQuantity(order.outstanding)} ${byMaterial.get(order.output)!.baseUnit}`]}
        labels={messages.lifecycle} errors={messages.errors}
        cancel={cancelProductionOrder.bind(null, tenant.code, tenant.generation, order.id)} closeEarly={closeEarlyProductionOrder.bind(null, tenant.code, tenant.generation, order.id)} />
      <dl className="grid gap-4 rounded-md border p-4 text-sm sm:grid-cols-3">
        {[{ label: t.output, value: output(order) }, { label: t.location, value: location(order.location) }, { label: t.quantity, value: quantity(order) },
          { label: messages.lifecycle.abandoned, value: `${shownQuantity(order.abandoned)} ${byMaterial.get(order.output)!.baseUnit}` },
          { label: t.produced, value: `${shownQuantity(order.produced)} ${byMaterial.get(order.output)!.baseUnit}` },
          { label: t.outstanding, value: `${shownQuantity(order.outstanding)} ${byMaterial.get(order.output)!.baseUnit}` },
          { label: t.entered, value: `${order.enteredQuantity} ${order.enteredUnit} (${order.denominator} ${order.enteredUnit} = ${order.numerator} ${byMaterial.get(order.output)!.baseUnit})` },
          { label: t.finish, value: order.plannedFinish }, { label: t.start, value: order.plannedStart },
          { label: t.leadTime, value: fill(t.leadTimeDays, { days: String(order.leadTimeDays) }) }, { label: t.recipe, value: recipe(order) },
          { label: t.status, value: t.states[order.status] }].map(({ label, value }) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 wrap-anywhere">{value}</dd></div>)}
      </dl>
      <p className="rounded-md border p-3 text-sm" role="status">{order.status !== "open" ? fill(t.resolved, { status: t.states[order.status] }) : order.shortages.length ? t.warning : t.sufficient}</p>
      <ProductionRequirements labels={t} components={order.components} materials={materials} tenant={tenant.code} />
      <CompletionHistory completions={completions} page={completionsPage} materials={materials} labels={t} path={`${path}/${order.id}`}
        reversible={tenant.readOnly ? undefined : { context: { tenant: tenant.code, generation: tenant.generation },
          order: { id: order.id, output: order.output, location: location(order.location), produced: order.produced } }} />
    </> : <DataTable label={t.title} columns={columns} rows={orders} rowKey={(row) => row.id} empty={t.empty}
      pagination={<PageLinks page={page} pages={pages} labels={t} href={(target) => `${path}?page=${target}`} />} />}
  </div>;
}
