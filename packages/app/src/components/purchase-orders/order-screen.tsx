import Link from "next/link";
import type { Locale, MaterialSummary, NamedRecordView, OrderLineView, OrderView } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { Card, CardContent } from "@cpg/ui/components/card";
import type { Messages } from "../../i18n/messages/en";
import { byId, enteredAs, ordersLabels, shownQuantity } from "./labels";

interface OrderScreenProps {
  tenant: { code: string; name: string };
  order: OrderView;
  materials: MaterialSummary[];
  suppliers: NamedRecordView[];
  locations: NamedRecordView[];
  locale: Locale;
  messages: Messages;
}

/** The body of a purchase order's page: its supplier, location and status, and every line with its planned date and requisition. */
export function OrderScreen({ tenant, order, materials, suppliers, locations, locale, messages }: OrderScreenProps) {
  const labels = ordersLabels(messages);
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
    </div>
  );
}
