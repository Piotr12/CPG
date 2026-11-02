import Link from "next/link";
import type { Locale, MrpAcceptanceView, MrpPlanView, MrpProposalView, Result } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { fill } from "../../i18n/fill";
import type { Messages } from "../../i18n/messages/en";
import { localeQuantity } from "../forms/form-labels";
import { AcceptProposalButton } from "./accept-proposal-button";
import { WhyBom, type MaterialsByCode } from "./mrp-bom-rejections";
import { MrpMarks } from "./mrp-marks";

interface MrpProposalsProps {
  tenant: { code: string };
  /** The latest run's ID and first planned day. */
  run: { id: string; startDate: string };
  /** The one pair the filters leave, with its proposals by need date. */
  plan: MrpPlanView;
  /** The server's UTC date: a run that started earlier can't be accepted (spec Q7, Q13). */
  today: string;
  /** The tenant's materials by ID, for a rejected BOM's component descriptions and units (E18-S03). */
  materials: MaterialsByCode;
  /** Accepts a proposal: the page's bound server action, or absent on a read-only tenant (spec Q9). */
  accept?: (raw: { run: string; proposal: string }) => Promise<Result<MrpAcceptanceView>>;
  locale: Locale;
  messages: Messages;
}

/**
 * The one-pair view's proposals (E19-S01, spec Q8), above its days: what each would create (a production
 * order with the BOM and revision it plans through, E17-S01), its need
 * date (with its Late Supply or Beyond Horizon mark, E16-S02, E18-S02) and quantity, why MRP passed over
 * each higher-priority BOM (E18-S03, UX-020), and Accept for
 * one that can be accepted, or the document accepting it created.
 * A read-only tenant, or a run from an earlier day, shows no Accept.
 */
export function MrpProposals({ tenant, run, plan, today, materials, accept, locale, messages }: MrpProposalsProps) {
  const t = messages.mrp.proposals;
  const current = run.startDate === today;
  const pair = { material: `${plan.material} — ${plan.materialDescription}`, location: `${plan.location} — ${plan.locationName}` };
  const amount = (quantity: string) => `${localeQuantity(quantity, locale)} ${plan.baseUnit}`;
  const errors = { ...messages.errors, ...t.errors };
  const action = (proposal: MrpProposalView) => {
    if (proposal.document) {
      return (
        <Link className="font-medium underline" href={`/admin/${tenant.code}/purchase-requisitions?${new URLSearchParams({ q: proposal.document })}`} data-mrp-document>
          {fill(t.accepted, { document: t.kinds[proposal.kind], id: proposal.document })}
        </Link>
      );
    }
    if (!proposal.executable) return <span className="text-sm text-muted-foreground" data-mrp-not-executable>{t.notExecutable}</span>;
    if (!accept || !current) return null;
    const details = { ...pair, quantity: amount(proposal.quantity), date: proposal.needDate, run: run.id };
    return (
      <AcceptProposalButton
        run={run.id}
        proposal={proposal.id}
        action={accept}
        labels={{
          accept: t.accept,
          acceptLabel: fill(t.acceptLabel, { document: t.kinds[proposal.kind], ...details }),
          title: t.confirm.title,
          description: fill(t.confirm.description, details),
          confirm: t.confirm.confirm,
          pending: t.confirm.pending,
          cancel: t.confirm.cancel,
          errors,
        }}
      />
    );
  };
  // A late or Beyond Horizon proposal carries the same warning as its need date's day (E18-S02).
  const needDate = (proposal: MrpProposalView) => {
    const marks = plan.marks.filter((mark) => "proposal" in mark && mark.proposal === proposal.id);
    return (
      <div className="flex flex-col items-start gap-1">
        <span data-mrp-need-date>{proposal.needDate}</span>
        {marks.length > 0 && <div data-mrp-timing={marks[0].kind}><MrpMarks marks={marks} unit={plan.baseUnit} locale={locale} labels={messages.mrp.report.marks} /></div>}
      </div>
    );
  };
  /** What it would create; a production order also names the BOM it plans through (E17-S01, MRP-031). */
  const documentCell = (proposal: MrpProposalView) => (
    <>
      {t.kinds[proposal.kind]}
      {proposal.bom !== null && (
        <span className="block text-sm text-muted-foreground" data-mrp-proposal-bom>{fill(t.bom, { bom: proposal.bom, revision: String(proposal.bomRevision) })}</span>
      )}
      <WhyBom rejections={proposal.rejectedBoms} materials={materials} locale={locale} labels={messages.mrp.explanations.rejections} />
    </>
  );
  const columns: DataTableColumn<MrpProposalView>[] = [
    { id: "document", header: t.columns.document, kind: "text", className: "whitespace-normal", cell: documentCell },
    { id: "needDate", header: t.columns.needDate, kind: "date", cell: needDate },
    { id: "quantity", header: t.columns.quantity, kind: "quantity", cell: (proposal) => <span data-mrp-proposal-quantity>{amount(proposal.quantity)}</span> },
    { id: "action", header: t.columns.action, kind: "text", className: "whitespace-normal", cell: action },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-4" data-mrp-proposals>
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">{fill(t.heading, { material: `${plan.material} ${plan.materialDescription}`, location: `${plan.location} ${plan.locationName}` })}</h3>
        <p className="text-sm text-muted-foreground">{t.intro}</p>
        {!current && accept && plan.proposals.length > 0 && <p className="text-sm" data-mrp-earlier-day>{t.earlierDay}</p>}
      </div>
      <DataTable label={t.label} columns={columns} rows={plan.proposals} rowKey={(proposal) => proposal.id} empty={t.empty} />
    </div>
  );
}
