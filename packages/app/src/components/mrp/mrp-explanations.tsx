import Link from "next/link";
import { CircleAlert, CircleDashed, TriangleAlert } from "lucide-react";
import type { Locale, MrpExceptionView, MrpPlanView, MrpProvisionalView, NamedRecordView } from "@cpg/core";
import { Callout } from "@cpg/ui/backend/feedback/callout";
import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import type { Messages } from "../../i18n/messages/en";
import { fill, localeQuantity } from "../forms/form-labels";
import { MrpBomRejections, WhyBom, type MaterialsByCode } from "./mrp-bom-rejections";
import { exceptionText } from "./mrp-exception-text";

/** The code an at-risk order is raised under (E17-S03): it gets its own list, never the exceptions list (spec Q5). */
const AT_RISK = "AT_RISK_PRODUCTION";
/** A date-less exception's date cell. */
const NO_DATE = "—";

interface MrpExplanationsProps {
  tenant: { code: string };
  /** The page's plans: the lists explain these pairs only, so the report's filters narrow them (spec Q4). */
  plans: MrpPlanView[];
  materials: MaterialsByCode;
  locations: NamedRecordView[];
  /** The report's view parameters, kept on a component's link. */
  view: Record<string, string>;
  locale: Locale;
  messages: Messages;
}

type Provisional = { plan: MrpPlanView; action: MrpProvisionalView };
type Explained = { plan: MrpPlanView; exception: MrpExceptionView; index: number };
/** An exception row with its label and text worked out once (`exceptionText`). */
type Described = Explained & { described: { label: string; text: string } };

/**
 * The report's Explanations part (E18-S03, PRD §07), after everything else on the page: the provisional plans
 * of the page's pairs under a "not executable" callout, with no action and never as supply (MRP-047); their
 * at-risk production orders (MRP-051, LFC-027); and every other planning exception, translated by code. A
 * list with no rows is left out; with none at all, one sentence says so.
 */
export function MrpExplanations({ tenant, plans, materials, locations, view, locale, messages }: MrpExplanationsProps) {
  const t = messages.mrp.explanations;
  const names = new Map(locations.map((location) => [location.id, location.name]));
  const material = (code: string) => {
    const found = materials.get(code);
    return found ? `${code} ${found.description}` : code;
  };
  const location = (code: string) => (names.has(code) ? `${code} ${names.get(code)}` : code);
  const amount = (quantity: string, unit: string) => `${localeQuantity(quantity, locale)} ${unit}`;
  const pair = (plan: MrpPlanView) => (
    <>
      {`${plan.material} ${plan.materialDescription}`}
      <span className="block text-xs text-muted-foreground">{`${plan.location} ${plan.locationName}`}</span>
    </>
  );
  const rejections = { materials, locale, labels: t.rejections };

  const provisional: Provisional[] = plans.flatMap((plan) => plan.provisional.map((action) => ({ plan, action })));
  const atRisk: Explained[] = [];
  const exceptions: Described[] = [];
  for (const plan of plans) {
    for (const [index, exception] of plan.exceptions.entries()) {
      if (exception.code === AT_RISK) atRisk.push({ plan, exception, index });
      else exceptions.push({ plan, exception, index, described: exceptionText(exception, { unit: plan.baseUnit, locale, location }, t.exceptions) });
    }
  }

  const p = t.provisional;
  const provisionalColumns: DataTableColumn<Provisional>[] = [
    { id: "pair", header: p.columns.pair, kind: "text", className: "whitespace-normal", cell: ({ plan }) => (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge tone="neutral" icon={CircleDashed} dashed>{p.badge}</StatusBadge>
        <span>{pair(plan)}</span>
      </div>
    ) },
    { id: "needDate", header: p.columns.needDate, kind: "date", cell: ({ action }) => (
      <>
        {action.needDate}
        <span className="block text-xs text-muted-foreground">{fill(p.planned, { start: action.plannedStart, finish: action.plannedFinish })}</span>
      </>
    ) },
    { id: "quantity", header: p.columns.quantity, kind: "quantity", cell: ({ plan, action }) => <span data-mrp-provisional-quantity>{amount(action.quantity, plan.baseUnit)}</span> },
    { id: "bom", header: p.columns.bom, kind: "text", cell: ({ action }) => fill(messages.mrp.proposals.bom, { bom: action.bom, revision: String(action.bomRevision) }) },
    { id: "components", header: p.columns.components, kind: "text", className: "whitespace-normal", cell: ({ plan, action }) => (
      <ul className="flex flex-col gap-1">
        {action.components.map((component) => (
          <li key={component.material} data-mrp-provisional-component={component.material}>
            {/* A chain stays walkable when a filter leaves only its parent here: each component opens its own pair (spec Q4). */}
            <Link
              className="underline"
              href={`/admin/${tenant.code}/mrp?${new URLSearchParams({ material: component.material, location: plan.location, ...view })}`}
              aria-label={fill(p.component, { material: material(component.material), location: location(plan.location) })}
            >
              {material(component.material)}
            </Link>
            {` ${amount(component.quantity, materials.get(component.material)?.baseUnit ?? "")}`.trimEnd()}
          </li>
        ))}
      </ul>
    ) },
    { id: "blockers", header: p.columns.blockers, kind: "text", className: "whitespace-normal", cell: ({ action }) => (
      <div className="flex flex-col items-start gap-1">
        <div className="flex flex-wrap gap-1">
          {action.blockers.map((blocker) => <StatusBadge key={blocker} tone="warning" icon={TriangleAlert}>{p.blockers[blocker]}</StatusBadge>)}
        </div>
        <WhyBom rejections={action.rejectedBoms} {...rejections} />
      </div>
    ) },
  ];

  const r = t.atRisk;
  const atRiskColumns: DataTableColumn<Explained>[] = [
    { id: "order", header: r.columns.order, kind: "id", cell: ({ exception }) => (
      <Link
        className="font-medium underline"
        href={`/admin/${tenant.code}/production-orders?${new URLSearchParams({ q: exception.params.order })}`}
        aria-label={fill(r.order, { order: exception.params.order })}
      >
        {exception.params.order}
      </Link>
    ) },
    { id: "pair", header: r.columns.pair, kind: "text", className: "whitespace-normal", cell: ({ plan }) => pair(plan) },
    { id: "finish", header: r.columns.finish, kind: "date", cell: ({ exception }) => exception.params.date },
    { id: "unproduced", header: r.columns.unproduced, kind: "quantity", cell: ({ plan, exception }) => <span data-mrp-at-risk-quantity>{amount(exception.params.quantity, plan.baseUnit)}</span> },
    { id: "inactive", header: r.columns.inactive, kind: "text", className: "whitespace-normal", cell: ({ exception }) => (
      <span data-mrp-at-risk-inactive>{exception.params.inactiveComponents.split(", ").map(material).join(", ")}</span>
    ) },
    { id: "status", header: r.columns.status, kind: "status", cell: () => <StatusBadge tone="warning" icon={TriangleAlert}>{r.status}</StatusBadge> },
  ];

  const e = t.exceptions;
  const exceptionColumns: DataTableColumn<Described>[] = [
    { id: "type", header: e.columns.type, kind: "status", cell: ({ exception, described }) => (
      <span data-mrp-exception-code={exception.code}>
        <StatusBadge tone="warning" icon={CircleAlert}>{described.label}</StatusBadge>
      </span>
    ) },
    { id: "material", header: e.columns.material, kind: "text", className: "whitespace-normal", cell: ({ plan }) => `${plan.material} ${plan.materialDescription}` },
    { id: "location", header: e.columns.location, kind: "text", className: "whitespace-normal", cell: ({ plan }) => `${plan.location} ${plan.locationName}` },
    { id: "date", header: e.columns.date, kind: "date", cell: ({ exception }) => exception.params.date ?? NO_DATE },
    { id: "explanation", header: e.columns.explanation, kind: "text", className: "min-w-64 whitespace-normal", cell: ({ exception, described }) => (
      <div className="flex flex-col gap-1" data-mrp-exception-text>
        <span>{described.text}</span>
        {exception.rejectedBoms && exception.rejectedBoms.length > 0 && <MrpBomRejections rejections={exception.rejectedBoms} {...rejections} />}
      </div>
    ) },
  ];

  const key = ({ plan, index }: Explained) => `${plan.material}/${plan.location}/${index}`;
  return (
    <section aria-labelledby="mrp-explanations-heading" className="flex min-w-0 flex-col gap-4" data-mrp-explanations>
      <div className="flex flex-col gap-1">
        <h3 id="mrp-explanations-heading" className="font-semibold">{t.heading}</h3>
        <p className="text-sm text-muted-foreground">{t.intro}</p>
      </div>
      {provisional.length === 0 && atRisk.length === 0 && exceptions.length === 0 && <p className="text-sm" data-mrp-explanations-empty>{t.empty}</p>}
      {provisional.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2" data-mrp-provisional>
          <h4 className="text-sm font-semibold">{p.heading}</h4>
          <Callout tone="warning" title={p.calloutTitle}>{p.callout}</Callout>
          <DataTable
            label={p.label}
            columns={provisionalColumns}
            rows={provisional}
            rowKey={({ plan, action }) => `${plan.material}/${plan.location}/${action.needDate}/${action.blockers.join(",")}`}
            empty={p.heading}
          />
        </div>
      )}
      {atRisk.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2" data-mrp-at-risk>
          <h4 className="text-sm font-semibold">{r.heading}</h4>
          <DataTable label={r.label} columns={atRiskColumns} rows={atRisk} rowKey={key} empty={r.heading} />
        </div>
      )}
      {exceptions.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2" data-mrp-exceptions>
          <h4 className="text-sm font-semibold">{e.heading}</h4>
          <DataTable label={e.label} columns={exceptionColumns} rows={exceptions} rowKey={key} empty={e.heading} />
        </div>
      )}
    </section>
  );
}
