import { cancelPurchaseOrder, closeEarlyPurchaseOrder, setPurchaseOrderLineDate } from "../../app/admin/[tenant]/purchase-orders/[id]/actions";
import { LifecycleControl } from "../document-lifecycle/lifecycle-control";
import { ChangeDateDialog } from "../purchasing/change-date-dialog";
import { fill } from "../forms/form-labels";
import Link from "next/link";
import { stockLabels } from "../stock/labels";
import type { Locale, MaterialSummary, NamedRecordView, OrderLineView, OrderView, ReceiptView } from "@cpg/core";
import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Card, CardContent } from "@cpg/ui/components/card";
import type { Messages } from "../../i18n/messages/en";
import { documentStatusTone, type DocumentStatus } from "../document-lifecycle/status-tone";
import { receiptLineChoices, receiptsLabels } from "../goods-receipts/labels";
import { ReceiptDialog } from "../goods-receipts/receipt-dialog";
import { ReceiptsTable } from "../goods-receipts/receipts-table";
import { requisitionHref } from "../purchase-requisitions/requisition-link";
import { byId, enteredAs, ordersLabels, shownQuantity } from "./labels";

interface OrderScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  order: OrderView;
  /** The order's newest goods receipts (one page), newest first; the lifecycle actions read each line's `posted` instead (#138). */
  receipts: ReceiptView[];
  materials: MaterialSummary[];
  /** The units each material's quantities may be entered in, its base unit first. */
  units: Record<string, string[]>;
  suppliers: NamedRecordView[];
  locations: NamedRecordView[];
  locale: Locale;
  messages: Messages;
}

/**
 * The body of a purchase order's page: its supplier, location and status, every line with its
 * planned date, requisition and what it has received (E09-S02), an Open line's Change date and
 * lifecycle actions, the Post goods receipt dialog (any user, not while the tenant is read-only), and
 * the order's receipts.
 */
export function OrderScreen({ tenant, order, receipts, materials, units, suppliers, locations, locale, messages }: OrderScreenProps) {
  const labels = ordersLabels(messages);
  const receiptLabels = receiptsLabels(messages);
  const materialsById = byId(materials);
  const supplier = byId(suppliers).get(order.supplier)!;
  const location = byId(locations).get(order.location)!;
  const t = labels.details;
  const c = labels.lines.columns;
  const lineEditable = (line: OrderLineView) => !tenant.readOnly && order.status === "open" && line.status === "open";
  const lineSubject = (line: OrderLineView) => `${labels.link} ${order.id} — ${fill(messages.lifecycle.line, { line: String(line.line) })}`;
  const dateLabels = { ...labels.changeDate, field: labels.form.plannedDate, cancel: labels.cancel, date: labels.fieldErrors.date };
  // The shared wording: the order screen's own VERSION_CONFLICT and PURCHASE_ORDER_NOT_OPEN are written for creating an order.
  const dateErrors = { ...messages.errors, GENERATION_STALE: messages.purchaseOrders.errors.GENERATION_STALE };
  const details = [
    { label: t.supplier, value: `${supplier.id} ${supplier.name}` },
    { label: t.location, value: `${location.id} ${location.name}` },
    { label: t.created, value: order.createdAt.toISOString().slice(0, 10) },
  ];
  const columns: DataTableColumn<OrderLineView>[] = [
    { id: "line", header: c.line, kind: "id", cell: (line) => line.line },
    {
      id: "material",
      header: c.material,
      kind: "longText",
      cell: (line) => {
        const material = materialsById.get(line.material)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/admin/${tenant.code}/materials/${material.id}`} className="font-mono whitespace-nowrap underline underline-offset-4">
              {material.id}
            </Link>
            <span>{material.description}</span>
          </span>
        );
      },
    },
    {
      id: "quantity",
      header: c.quantity,
      kind: "quantity",
      cell: (line) => `${shownQuantity(line.quantity)} ${materialsById.get(line.material)!.baseUnit}`,
    },
    { id: "enteredAs", header: c.enteredAs, kind: "longText", priority: 2, cell: (line) => enteredAs(line, materialsById, labels) },
    { id: "plannedDate", header: c.plannedDate, kind: "date", cell: (line) => line.plannedDate },
    {
      id: "requisition",
      header: c.requisition,
      kind: "text",
      priority: 2,
      cell: (line) =>
        line.requisition === null ? (
          labels.lines.noRequisition
        ) : (
          <Link href={requisitionHref(tenant.code, line.requisition)} className="font-mono whitespace-nowrap underline underline-offset-4">
            {line.requisition}
          </Link>
        ),
    },
    {
      id: "received",
      header: c.received,
      kind: "quantity",
      cell: (line) => `${shownQuantity(line.received)} ${materialsById.get(line.material)!.baseUnit}`,
    },
    {
      id: "outstanding",
      header: c.outstanding,
      kind: "quantity",
      cell: (line) => `${shownQuantity(line.outstanding)} ${materialsById.get(line.material)!.baseUnit}`,
    },
    {
      id: "status",
      header: c.status,
      kind: "status",
      cell: (line) => <StatusBadge {...documentStatusTone(line.status)}>{labels.lines.status[line.status]}</StatusBadge>,
    },
    { id: "abandoned", header: messages.lifecycle.abandoned, kind: "quantity", priority: 2, cell: (line) => `${shownQuantity(line.abandoned)} ${materialsById.get(line.material)!.baseUnit}` },
    { id: "actions", header: messages.lifecycle.actions, kind: "actions", cell: (line) => <div className="flex flex-col items-start gap-2">
      <ChangeDateDialog kind="orderLine" available={lineEditable(line)} subject={lineSubject(line)} value={line.plannedDate} version={order.version}
        save={setPurchaseOrderLineDate.bind(null, tenant.code, tenant.generation, order.id, line.line)} labels={dateLabels} errors={dateErrors} />
      <LifecycleControl kind="line"
        available={lineEditable(line)} processed={line.posted}
        subject={lineSubject(line)}
        version={order.version} lines={[line.line]} quantities={[`${shownQuantity(line.outstanding)} ${materialsById.get(line.material)!.baseUnit}`]}
        labels={messages.lifecycle} errors={messages.errors}
        cancel={cancelPurchaseOrder.bind(null, tenant.code, tenant.generation, order.id)} closeEarly={closeEarlyPurchaseOrder.bind(null, tenant.code, tenant.generation, order.id)} />
    </div> },
  ];

  return (
    <div lang={locale}>
      <p className="mb-4">
        <Link href={`/admin/${tenant.code}/purchase-orders`} className="text-sm underline underline-offset-4">
          {labels.allOrders}
        </Link>
      </p>
      <PageHeader
        title={messages.purchaseOrders.detailHeading(order.id, supplier.name)}
        meta={<StatusBadge {...documentStatusTone(order.status as DocumentStatus)}>{labels.status[order.status as keyof typeof labels.status]}</StatusBadge>}
        actions={!tenant.readOnly && order.status === "open" && <LifecycleControl kind="order" available processed={order.lines.some((line) => line.posted)}
          subject={`${labels.link} ${order.id}`} version={order.version}
          quantities={order.lines.filter((line) => line.status === "open").map((line) => `${materialsById.get(line.material)!.description}: ${shownQuantity(line.outstanding)} ${materialsById.get(line.material)!.baseUnit}`)}
          labels={messages.lifecycle} errors={messages.errors}
          cancel={cancelPurchaseOrder.bind(null, tenant.code, tenant.generation, order.id)} closeEarly={closeEarlyPurchaseOrder.bind(null, tenant.code, tenant.generation, order.id)} />}
      />
      <div className="flex flex-col gap-8">
      <Card>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {details.map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-1">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{labels.lines.heading}</h2>
        <p className="text-sm text-muted-foreground">{labels.lines.intro}</p>
        <DataTable label={labels.lines.heading} columns={columns} rows={order.lines} rowKey={(line) => String(line.line)} empty={labels.lines.noRequisition} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{receiptLabels.heading}</h2>
        <p className="text-sm text-muted-foreground">{receiptLabels.intro}</p>
        {!tenant.readOnly && (
          <ReceiptDialog
            context={{ tenant: tenant.code, generation: tenant.generation }}
            purchaseOrder={order.id}
            location={`${location.id} ${location.name}`}
            labels={receiptLabels}
            lines={receiptLineChoices(order, materialsById, units, receiptLabels)}
            baseUnits={Object.fromEntries(order.lines.map(({ line, material }) => [line, materialsById.get(material)!.baseUnit]))}
            canPost={order.status === "open"}
          />
        )}
        <ReceiptsTable tenant={tenant} reversalLabels={stockLabels(messages)} receipts={receipts} materials={materialsById} labels={receiptLabels} />
      </section>
      </div>
    </div>
  );
}
