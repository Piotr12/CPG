import { cancelCustomerOrder, closeEarlyCustomerOrder } from "../../app/admin/[tenant]/customer-orders/[id]/actions";
import { LifecycleControl } from "../document-lifecycle/lifecycle-control";
import Link from "next/link";
import { outstandingOf, type CustomerOrderView, type Locale, type MaterialSummary, type NamedRecordView, type ShipmentView, type TenantInfo } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { ORDER_PAGE_SIZE } from "@cpg/core/validators/customer-orders/customer-order.schema";
import { Button } from "@cpg/ui/components/button";
import { Badge } from "@cpg/ui/components/badge";
import type { Messages } from "../../i18n/messages/en";
import { fill, shownQuantity } from "../forms/form-labels";
import { shipmentsLabels } from "../shipments/labels";
import { firstDueDate, shipmentLineChoices } from "../shipments/line-choices";
import { ShipmentDialog } from "../shipments/shipment-dialog";
import { ShipmentsTable } from "../shipments/shipments-table";
import { orderLabels } from "./labels";
import { OrderDialog } from "./order-dialog";
import type { OrderChoice } from "./order-form";

export interface OrdersScreenProps {
  tenant: TenantInfo;
  page?: number;
  total?: number;
  orders: CustomerOrderView[];
  order?: CustomerOrderView;
  /** The shown order's shipments, newest first. */
  shipments?: ShipmentView[];
  materials: MaterialSummary[];
  customers: NamedRecordView[];
  locations: NamedRecordView[];
  units: Record<string, string[]>;
  messages: Messages;
  locale: Locale;
}
/**
 * List and detail use the same master labels and choice policy; both roles may maintain demand. The
 * detail adds each line's outstanding quantity, the order's shipments and Create shipment (E08-S02).
 */
export function OrdersScreen({ tenant, orders, order, shipments = [], page = 1, total = 0, materials, customers, locations, units, messages, locale }: OrdersScreenProps) {
  const t = orderLabels(messages);
  const shipmentLabels = shipmentsLabels(messages);
  const path = `/admin/${tenant.code}/customer-orders`;
  const pages = Math.ceil(total / ORDER_PAGE_SIZE);
  const byMaterial = new Map(materials.map((material) => [material.id, material]));
  const named = (records: NamedRecordView[], code: string) => `${code} ${records.find(({ id }) => id === code)!.name}`;
  const choice = ({ id, name, active }: NamedRecordView): OrderChoice => ({ value: id, label: `${id} ${name}${active ? "" : ` (${t.inactive})`}`, active, units: [] });
  const choices = {
    customers: customers.map(choice), locations: locations.map(choice),
    materials: materials.map(({ id, description, active, baseUnit }) => ({ value: id, label: `${id} ${description}${active ? "" : ` (${t.inactive})`}`, active, units: units[id] ?? [baseUnit] })),
  };
  const shipmentChoices = order ? shipmentLineChoices(order, byMaterial, units, shipmentLabels) : [];
  const columns: DataTableColumn<CustomerOrderView>[] = [
    { id: "id", header: t.id, cell: (row) => <Link className="font-mono underline underline-offset-4" href={`${path}/${row.id}`}>{row.id}</Link> },
    { id: "customer", header: t.customer, cell: (row) => named(customers, row.customer), className: "whitespace-normal wrap-anywhere" },
    { id: "location", header: t.location, cell: (row) => named(locations, row.location), className: "hidden whitespace-normal sm:table-cell" },
    { id: "lines", header: t.lines, cell: (row) => row.lines.length, className: "hidden sm:table-cell" },
    { id: "status", header: t.status, cell: (row) => <Badge variant="secondary">{t.states[row.status]}</Badge> },
  ];
  const lineColumns: DataTableColumn<CustomerOrderView["lines"][number]>[] = [
    { id: "material", header: t.material, cell: (line) => <Link className="underline underline-offset-4" href={`/admin/${tenant.code}/materials/${line.material}`}>{line.material} {byMaterial.get(line.material)!.description}</Link>, className: "min-w-40 whitespace-normal wrap-anywhere" },
    { id: "quantity", header: t.quantity, cell: (line) => `${shownQuantity(line.quantity)} ${byMaterial.get(line.material)!.baseUnit}`, className: "whitespace-normal" },
    { id: "entered", header: t.entered, cell: (line) => `${line.enteredQuantity} ${line.enteredUnit} (${line.denominator} ${line.enteredUnit} = ${line.numerator} ${byMaterial.get(line.material)!.baseUnit})`, className: "hidden whitespace-normal md:table-cell" },
    { id: "date", header: t.requiredDate, cell: (line) => line.requiredDate },
    { id: "fulfilled", header: t.fulfilled, cell: (line) => shownQuantity(line.fulfilled), className: "hidden sm:table-cell" },
    { id: "outstanding", header: t.outstanding, cell: (line) => shownQuantity(outstandingOf(line)), className: "hidden sm:table-cell" },
    { id: "status", header: t.status, cell: (line) => t.states[line.status], className: "hidden sm:table-cell" },
    { id: "abandoned", header: messages.lifecycle.abandoned, cell: (line) => shownQuantity(line.abandoned), className: "text-right" },
    { id: "actions", header: messages.lifecycle.actions, cell: (line) => order && <LifecycleControl
      available={!tenant.readOnly && order.status === "open" && line.status === "open"} processed={line.posted || line.fulfilled !== "0.000000"}
      subject={`${t.link} ${order.id} — ${fill(messages.lifecycle.line, { line: String(order.lines.indexOf(line) + 1) })}`}
      version={order.version} lines={[line.id]} quantities={[`${shownQuantity(outstandingOf(line))} ${byMaterial.get(line.material)!.baseUnit}`]}
      labels={messages.lifecycle} errors={messages.errors}
      cancel={cancelCustomerOrder.bind(null, tenant.code, tenant.generation, order.id)} closeEarly={closeEarlyCustomerOrder.bind(null, tenant.code, tenant.generation, order.id)} /> },
  ];
  return <div lang={locale} className="flex flex-col gap-6">
    {order && <Link className="text-sm underline underline-offset-4" href={path}>{t.back}</Link>}
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <h1 className="text-2xl font-semibold tracking-tight">{order ? fill(t.detailHeading, { id: order.id }) : fill(t.heading, { tenant: tenant.name })}</h1>
      {!tenant.readOnly && (!order || order.status === "open") && <OrderDialog context={{ tenant: tenant.code, generation: tenant.generation }} labels={t} choices={choices} order={order} />}
    </div>
    <p className="text-sm text-muted-foreground">{t.intro}</p>
    {order ? <>
      <LifecycleControl available={!tenant.readOnly && order.status === "open"} processed={order.lines.some((line) => line.posted || line.fulfilled !== "0.000000")}
        subject={`${t.link} ${order.id}`} version={order.version}
        quantities={order.lines.filter((line) => line.status === "open").map((line) => `${byMaterial.get(line.material)!.description}: ${shownQuantity(outstandingOf(line))} ${byMaterial.get(line.material)!.baseUnit}`)}
        labels={messages.lifecycle} errors={messages.errors}
        cancel={cancelCustomerOrder.bind(null, tenant.code, tenant.generation, order.id)} closeEarly={closeEarlyCustomerOrder.bind(null, tenant.code, tenant.generation, order.id)} />
      <dl className="grid gap-4 rounded-md border p-4 text-sm sm:grid-cols-3">
        {[{ label: t.customer, value: named(customers, order.customer) }, { label: t.location, value: named(locations, order.location) }, { label: t.status, value: t.states[order.status] }].map(({ label, value }) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 wrap-anywhere">{value}</dd></div>)}
      </dl>
      <DataTable label={t.lines} columns={lineColumns} rows={order.lines} rowKey={(line) => line.id} empty={t.empty} />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{shipmentLabels.heading}</h2>
        <p className="text-sm text-muted-foreground">{shipmentLabels.intro}</p>
        {!tenant.readOnly && order.status === "open" && shipmentChoices.length > 0 && (
          <ShipmentDialog
            context={{ tenant: tenant.code, generation: tenant.generation }}
            customerOrder={order.id}
            location={named(locations, order.location)}
            labels={shipmentLabels}
            lines={shipmentChoices}
            plannedDate={firstDueDate(order)}
          />
        )}
        <ShipmentsTable tenant={tenant.code} shipments={shipments} materials={byMaterial} labels={shipmentLabels} />
      </section>
    </> : <DataTable label={t.link} columns={columns} rows={orders} rowKey={(row) => row.id} pagination={pages > 1 && <nav aria-label={t.pagination} className="flex flex-wrap items-center justify-end gap-3">
      {page > 1 && <Button asChild variant="outline"><Link href={`${path}?page=${page - 1}`}>{t.previous}</Link></Button>}
      <span className="text-sm">{fill(t.page, { page: String(page), pages: String(pages) })}</span>
      {page < pages && <Button asChild variant="outline"><Link href={`${path}?page=${page + 1}`}>{t.next}</Link></Button>}
    </nav>} empty={`${t.empty}${tenant.readOnly ? "" : ` ${t.emptyHint}`}`} />}
  </div>;
}
