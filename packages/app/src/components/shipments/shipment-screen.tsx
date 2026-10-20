import Link from "next/link";
import { isNothing, type IssueView, type Locale, type MaterialSummary, type NamedRecordView, type ShipmentLineView, type ShipmentView, type TenantInfo } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import type { Messages } from "../../i18n/messages/en";
import type { LineQuantityChoice } from "../forms/line-quantities-form";
import { IssueDialog } from "../goods-issues/issue-dialog";
import { issuesLabels } from "../goods-issues/labels";
import { IssuesTable } from "../goods-issues/issues-table";
import { byId } from "../purchase-requisitions/labels";
import { fill, shipmentsLabels, shownQuantity } from "./labels";

interface ShipmentScreenProps {
  tenant: TenantInfo;
  shipment: ShipmentView;
  /** The shipment's goods issues, newest first. */
  issues: IssueView[];
  materials: MaterialSummary[];
  /** The units each material's quantities may be entered in, its base unit first. */
  units: Record<string, string[]>;
  customers: NamedRecordView[];
  locations: NamedRecordView[];
  locale: Locale;
  messages: Messages;
}

/**
 * The body of a shipment's page: its order, customer, location, planned date and status, every line
 * with what it planned, issued and still has to issue, the Post goods issue dialog (any user, not
 * while the tenant is read-only), and the shipment's goods issues.
 */
export function ShipmentScreen({ tenant, shipment, issues, materials, units, customers, locations, locale, messages }: ShipmentScreenProps) {
  const labels = shipmentsLabels(messages);
  const issueLabels = issuesLabels(messages);
  const materialsById = byId(materials);
  const customer = byId(customers).get(shipment.customer)!;
  const location = byId(locations).get(shipment.location)!;
  const orderPath = `/admin/${tenant.code}/customer-orders/${shipment.customerOrder}`;
  const t = labels.details;
  const c = labels.lineColumns;
  const baseUnit = (line: ShipmentLineView) => materialsById.get(line.material)!.baseUnit;
  const details = [
    { label: t.customerOrder, value: <Link className="font-mono underline underline-offset-4" href={orderPath}>{shipment.customerOrder}</Link> },
    { label: t.customer, value: `${customer.id} ${customer.name}` },
    { label: t.location, value: `${location.id} ${location.name}` },
    { label: t.plannedDate, value: shipment.plannedDate },
    { label: t.status, value: <Badge variant="secondary">{labels.states[shipment.status]}</Badge> },
  ];
  const columns: DataTableColumn<ShipmentLineView>[] = [
    { id: "line", header: c.line, cell: (line) => line.line, className: "text-right" },
    {
      id: "material",
      header: c.material,
      className: "whitespace-normal wrap-anywhere",
      cell: (line) => (
        <Link className="underline underline-offset-4" href={`/admin/${tenant.code}/materials/${line.material}`}>
          {line.material} {materialsById.get(line.material)!.description}
        </Link>
      ),
    },
    { id: "quantity", header: c.quantity, cell: (line) => `${shownQuantity(line.quantity)} ${baseUnit(line)}`, className: "hidden sm:table-cell" },
    { id: "issued", header: c.issued, cell: (line) => `${shownQuantity(line.issued)} ${baseUnit(line)}` },
    { id: "toIssue", header: c.toIssue, cell: (line) => `${shownQuantity(line.toIssue)} ${baseUnit(line)}` },
  ];
  const choices: LineQuantityChoice[] = shipment.lines
    .filter(({ toIssue }) => !isNothing(toIssue))
    .map((line) => {
      const material = materialsById.get(line.material)!;
      return {
        key: line.line,
        label: fill(issueLabels.post.line, { line: String(line.line), material: `${material.id} ${material.description}` }),
        hint: fill(issueLabels.post.toIssue, { toIssue: shownQuantity(line.toIssue), baseUnit: material.baseUnit }),
        units: units[line.material] ?? [material.baseUnit],
      };
    });

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <Link className="text-sm underline underline-offset-4" href={orderPath}>
        {fill(labels.back, { order: shipment.customerOrder })}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{fill(labels.detailHeading, { id: shipment.id })}</h1>
      <p className="text-sm text-muted-foreground">{labels.detailIntro}</p>
      <dl className="grid gap-4 rounded-md border p-4 text-sm sm:grid-cols-3">
        {details.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-1 wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>
      <DataTable label={labels.heading} columns={columns} rows={shipment.lines} rowKey={(line) => String(line.line)} empty={labels.empty} />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{issueLabels.heading}</h2>
        <p className="text-sm text-muted-foreground">{issueLabels.intro}</p>
        {!tenant.readOnly && (
          <IssueDialog
            context={{ tenant: tenant.code, generation: tenant.generation }}
            shipment={shipment.id}
            customerOrder={shipment.customerOrder}
            location={`${location.id} ${location.name}`}
            labels={issueLabels}
            lines={choices}
            canPost={shipment.status === "open" && choices.length > 0}
          />
        )}
        <IssuesTable issues={issues} materials={materialsById} labels={issueLabels} />
      </section>
    </div>
  );
}
