import { cancelCustomerOrder, closeEarlyCustomerOrder } from "../../app/admin/[tenant]/customer-orders/[id]/actions";
import { LifecycleControl } from "../document-lifecycle/lifecycle-control";
import Link from "next/link";
import { outstandingOf, type CustomerOrderView, type Locale, type MaterialSummary, type NamedRecordView, type ShipmentView, type TenantInfo } from "@cpg/core";
import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Highlight } from "@cpg/ui/backend/tables/highlight";
import { ORDER_PAGE_SIZE } from "@cpg/core/validators/customer-orders/customer-order.schema";
import { customerOrderSortSchema, type CustomerOrderSort } from "@cpg/core/validators/customer-orders/customer-order-list.schema";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import { documentStatusTone } from "../document-lifecycle/status-tone";
import type { Messages } from "../../i18n/messages/en";
import { fill, shownQuantity } from "../forms/form-labels";
import { PageLinks } from "../layout/page-links";
import { listLinks, type ListSearchState } from "../lists/list-params";
import { ListSearchBar, NoSearchResults } from "../lists/list-search-bar";
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
  /** The list's search and sort (#217); the list without either when left out. */
  search?: ListSearchState;
  sort?: { sort: CustomerOrderSort; dir: SortDirection };
}
/**
 * List and detail use the same master labels and choice policy; both roles may maintain demand. The
 * detail adds each line's outstanding quantity, the order's shipments and Create shipment (E08-S02).
 */
export function OrdersScreen({ tenant, orders, order, shipments = [], page = 1, total = 0, materials, customers, locations, units, messages, locale,
  search = { q: "", typed: "" }, sort = customerOrderSortSchema.parse({}) }: OrdersScreenProps) {
  const t = orderLabels(messages);
  const shipmentLabels = shipmentsLabels(messages);
  const path = `/admin/${tenant.code}/customer-orders`;
  const links = listLinks({ path, search: search.q, sort, defaults: customerOrderSortSchema.parse({}) });
  const pages = Math.ceil(total / ORDER_PAGE_SIZE);
  const byMaterial = new Map(materials.map((material) => [material.id, material]));
  const named = (records: NamedRecordView[], code: string) => `${code} ${records.find(({ id }) => id === code)!.name}`;
  const choice = ({ id, name, active }: NamedRecordView): OrderChoice => ({ value: id, label: `${id} ${name}${active ? "" : ` (${t.inactive})`}`, active, units: [] });
  const choices = {
    customers: customers.map(choice), locations: locations.map(choice),
    materials: materials.map(({ id, description, active, baseUnit }) => ({ value: id, code: id, name: `${description}${active ? "" : ` (${t.inactive})`}`, detail: baseUnit, active, units: units[id] ?? [baseUnit] })),
  };
  const shipmentChoices = order ? shipmentLineChoices(order, byMaterial, units, shipmentLabels) : [];
  const status = (value: CustomerOrderView["status"]) => <StatusBadge {...documentStatusTone(value)}>{t.states[value]}</StatusBadge>;
  const columns: DataTableColumn<CustomerOrderView>[] = [
    { id: "id", header: t.id, kind: "id", sortKey: "id", cell: (row) => <Link className="underline underline-offset-4" href={`${path}/${row.id}`}><Highlight text={row.id} query={search.q} /></Link> },
    { id: "customer", header: t.customer, kind: "longText", sortKey: "customer", cell: (row) => <Highlight text={named(customers, row.customer)} query={search.q} /> },
    { id: "location", header: t.location, kind: "longText", priority: 2, sortKey: "location", cell: (row) => named(locations, row.location) },
    { id: "lines", header: t.lines, kind: "quantity", priority: 2, cell: (row) => row.lines.length },
    { id: "status", header: t.status, kind: "status", sortKey: "status", cell: (row) => status(row.status) },
  ];
  const lineColumns: DataTableColumn<CustomerOrderView["lines"][number]>[] = [
    { id: "material", header: t.material, kind: "longText", cell: (line) => <Link className="underline underline-offset-4" href={`/admin/${tenant.code}/materials/${line.material}`}>{line.material} {byMaterial.get(line.material)!.description}</Link> },
    { id: "quantity", header: t.quantity, kind: "quantity", cell: (line) => `${shownQuantity(line.quantity)} ${byMaterial.get(line.material)!.baseUnit}` },
    { id: "entered", header: t.entered, kind: "longText", priority: 2, cell: (line) => `${line.enteredQuantity} ${line.enteredUnit} (${line.denominator} ${line.enteredUnit} = ${line.numerator} ${byMaterial.get(line.material)!.baseUnit})` },
    { id: "date", header: t.requiredDate, kind: "date", cell: (line) => line.requiredDate },
    { id: "fulfilled", header: t.fulfilled, kind: "quantity", priority: 2, cell: (line) => shownQuantity(line.fulfilled) },
    { id: "outstanding", header: t.outstanding, kind: "quantity", priority: 2, cell: (line) => shownQuantity(outstandingOf(line)) },
    { id: "status", header: t.status, kind: "status", cell: (line) => status(line.status) },
    { id: "abandoned", header: messages.lifecycle.abandoned, kind: "quantity", cell: (line) => shownQuantity(line.abandoned) },
    { id: "actions", header: messages.lifecycle.actions, kind: "actions", cell: (line) => order && <LifecycleControl kind="line"
      available={!tenant.readOnly && order.status === "open" && line.status === "open"} processed={line.posted || line.fulfilled !== "0.000000"}
      subject={`${t.link} ${order.id} — ${fill(messages.lifecycle.line, { line: String(order.lines.indexOf(line) + 1) })}`}
      version={order.version} lines={[line.id]} quantities={[`${shownQuantity(outstandingOf(line))} ${byMaterial.get(line.material)!.baseUnit}`]}
      labels={messages.lifecycle} errors={messages.errors}
      cancel={cancelCustomerOrder.bind(null, tenant.code, tenant.generation, order.id)} closeEarly={closeEarlyCustomerOrder.bind(null, tenant.code, tenant.generation, order.id)} /> },
  ];
  const actions = !tenant.readOnly && (!order || order.status === "open") && <>
    <OrderDialog context={{ tenant: tenant.code, generation: tenant.generation }} labels={t} choices={choices} order={order} locale={locale} />
    {order && <LifecycleControl kind="order" available processed={order.lines.some((line) => line.posted || line.fulfilled !== "0.000000")}
      subject={`${t.link} ${order.id}`} version={order.version}
      quantities={order.lines.filter((line) => line.status === "open").map((line) => `${byMaterial.get(line.material)!.description}: ${shownQuantity(outstandingOf(line))} ${byMaterial.get(line.material)!.baseUnit}`)}
      labels={messages.lifecycle} errors={messages.errors}
      cancel={cancelCustomerOrder.bind(null, tenant.code, tenant.generation, order.id)} closeEarly={closeEarlyCustomerOrder.bind(null, tenant.code, tenant.generation, order.id)} />}
  </>;
  return <div lang={locale}>
    <PageHeader title={order ? fill(t.detailHeading, { id: order.id }) : fill(t.heading, { tenant: tenant.name })}
      meta={order && status(order.status)} description={t.intro} actions={actions} />
    <div className="flex flex-col gap-8">
    {order ? <>
      <dl className="grid gap-4 rounded-md border p-4 text-sm sm:grid-cols-3">
        {[{ label: t.customer, value: named(customers, order.customer) }, { label: t.location, value: named(locations, order.location) }].map(({ label, value }) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 wrap-anywhere">{value}</dd></div>)}
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
    </> : <div>
      <ListSearchBar links={links} search={search} labels={t.search} lists={messages.lists} locale={locale} count={total} />
      <DataTable label={t.link} columns={columns} rows={orders} rowKey={(row) => row.id}
        sort={{ key: sort.sort, dir: sort.dir, href: links.sortHref, link: Link }}
        pagination={<PageLinks page={page} pages={pages} labels={t} href={links.pageHref} />}
        empty={search.q ? <NoSearchResults links={links} query={search.q} lists={messages.lists} /> : `${t.empty}${tenant.readOnly ? "" : ` ${t.emptyHint}`}`} />
    </div>}
    </div>
  </div>;
}
