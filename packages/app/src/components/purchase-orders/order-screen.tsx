import Link from "next/link";
import { stockLabels } from "../stock/labels";
import type { Locale, MaterialSummary, NamedRecordView, OrderLineView, OrderView, ReceiptView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { Card, CardContent } from "@cpg/ui/components/card";
import type { Messages } from "../../i18n/messages/en";
import { receiptLineChoices, receiptsLabels } from "../goods-receipts/labels";
import { ReceiptDialog } from "../goods-receipts/receipt-dialog";
import { ReceiptsTable } from "../goods-receipts/receipts-table";
import { byId, enteredAs, ordersLabels, shownQuantity } from "./labels";

interface OrderScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  order: OrderView;
  /** The order's goods receipts, newest first. */
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
 * planned date, requisition and what it has received (E09-S02), the Post goods receipt dialog (any
 * user, not while the tenant is read-only), and the order's receipts.
 */
export function OrderScreen({ tenant, order, receipts, materials, units, suppliers, locations, locale, messages }: OrderScreenProps) {
  const labels = ordersLabels(messages);
  const receiptLabels = receiptsLabels(messages);
  const materialsById = byId(materials);
  const supplier = byId(suppliers).get(order.supplier)!;
  const location = byId(locations).get(order.location)!;
  const t = labels.details;
  const c = labels.lines.columns;
  const details = [
    { label: t.supplier, value: `${supplier.id} ${supplier.name}` },
    { label: t.location, value: `${location.id} ${location.name}` },
    { label: t.status, value: <Badge variant="secondary">{labels.status[order.status as keyof typeof labels.status]}</Badge> },
    { label: t.created, value: order.createdAt.toISOString().slice(0, 10) },
  ];
  const columns: DataTableColumn<OrderLineView>[] = [
    { id: "line", header: c.line, cell: (line) => line.line, className: "text-right" },
    {
      id: "material",
      header: c.material,
      cell: (line) => {
        const material = materialsById.get(line.material)!;
        return (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/admin/${tenant.code}/materials/${material.id}`} className="font-mono underline underline-offset-4">
              {material.id}
            </Link>
            <span>{material.description}</span>
          </span>
        );
      },
      className: "whitespace-normal wrap-anywhere",
    },
    {
      id: "quantity",
      header: c.quantity,
      cell: (line) => `${shownQuantity(line.quantity)} ${materialsById.get(line.material)!.baseUnit}`,
      className: "text-right",
    },
    { id: "enteredAs", header: c.enteredAs, cell: (line) => enteredAs(line, materialsById, labels), className: "hidden whitespace-normal md:table-cell" },
    { id: "plannedDate", header: c.plannedDate, cell: (line) => line.plannedDate },
    {
      id: "requisition",
      header: c.requisition,
      cell: (line) =>
        line.requisition === null ? (
          labels.lines.noRequisition
        ) : (
          <Link href={`/admin/${tenant.code}/purchase-requisitions`} className="font-mono underline underline-offset-4">
            {line.requisition}
          </Link>
        ),
    },
    {
      id: "received",
      header: c.received,
      cell: (line) => `${shownQuantity(line.received)} ${materialsById.get(line.material)!.baseUnit}`,
      className: "text-right",
    },
    {
      id: "outstanding",
      header: c.outstanding,
      cell: (line) => `${shownQuantity(line.outstanding)} ${materialsById.get(line.material)!.baseUnit}`,
      className: "text-right",
    },
    {
      id: "status",
      header: c.status,
      cell: (line) => <Badge variant={line.status === "completed" ? "outline" : "secondary"}>{labels.lines.status[line.status]}</Badge>,
    },
  ];

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.purchaseOrders.detailHeading(order.id, supplier.name)}</h1>
      <p>
        <Link href={`/admin/${tenant.code}/purchase-orders`} className="text-sm underline underline-offset-4">
          {labels.allOrders}
        </Link>
      </p>
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
  );
}
