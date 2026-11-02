import type { Locale, MaterialSummary, MrpAcceptanceView, MrpLatestView, MrpRunAnswer, MrpRunView, NamedRecordView, Result } from "@cpg/core";
import type { MrpReportPageQuery } from "@cpg/core/validators/mrp/mrp-latest.schema";
import { Callout } from "@cpg/ui/backend/feedback/callout";
import { EmptyState } from "@cpg/ui/backend/feedback/empty-state";
import { plural } from "@cpg/ui/lib/plural";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { fill } from "../../i18n/fill";
import type { Messages } from "../../i18n/messages/en";
import { localeQuantity } from "../forms/form-labels";
import { MrpReport } from "./mrp-report";
import { RunMrpButton, type RunMrpLabels, type RunMrpMode } from "./run-mrp-button";

interface MrpRunScreenProps {
  tenant: { code: string; name: string; readOnly: boolean };
  /** The latest run's report, one page of it read with `selected`, or null before the first run. */
  report: MrpLatestView | null;
  selected: MrpReportPageQuery;
  /** The tenant's materials and locations, for the report's filters. */
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  /** Runs MRP in the dialog's mode: the page's server action, bound to its tenant and generation. */
  action: (raw: { mode: RunMrpMode }) => Promise<Result<MrpRunAnswer>>;
  /** Accepts a proposal: the page's server action, bound to its tenant and generation (E19-S01). */
  accept: (raw: { run: string; proposal: string }) => Promise<Result<MrpAcceptanceView>>;
  /** The server's UTC date: proposals of a run from an earlier day can't be accepted. */
  today: string;
  locale: Locale;
  messages: Messages;
}

/** A moment as the page shows it: UTC, to the minute, as the other screens do. */
const minute = (date: Date) => `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/**
 * The body of the MRP page (E14-S02, E18-S01): Run MRP while the tenant is writable, the latest run,
 * its ID, time and account (RUN-002), and its report, until a newer run supersedes it. A read-only
 * tenant shows both without the Run and Accept buttons (RUN-021, TEN-019, TEN-018); the read-only
 * banner says why.
 */
export function MrpRunScreen({ tenant, report, selected, materials, locations, action, accept, today, locale, messages }: MrpRunScreenProps) {
  const t = messages.mrp;
  const writable = !tenant.readOnly;

  return (
    <div lang={locale} className="min-w-0">
      <PageHeader
        title={fill(t.heading, { tenant: tenant.name })}
        description={t.intro}
        actions={
          writable ? (
            <RunMrpButton action={action} labels={runMrpLabels(messages, tenant.name)} />
          ) : undefined
        }
      />
      {report ? (
        <>
          <RunCard run={report.run} labels={t} locale={locale} />
          <MrpReport
            tenant={tenant}
            report={report}
            selected={selected}
            materials={materials}
            locations={locations}
            today={today}
            accept={writable ? accept : undefined}
            locale={locale}
            messages={messages}
          />
        </>
      ) : (
        <EmptyState title={t.empty}>{writable && t.emptyWritable}</EmptyState>
      )}
    </div>
  );
}

/** The Run MRP dialog's labels: plain strings, the tenant filled in, so they can cross to the client component (lesson 2026-10-24). */
export function runMrpLabels(messages: Messages, tenantName: string): RunMrpLabels {
  const t = messages.mrp;
  return { run: t.run, running: t.running, ...t.dialog, description: fill(t.dialog.description, { tenant: tenantName }), errors: { ...messages.errors, ...t.errors } };
}

/** The latest run's header: its ID, time, account and channel, horizon, pair count and creation mode (E19-S03). */
function RunCard({ run, labels: t, locale }: { run: MrpRunView; labels: Messages["mrp"]; locale: Locale }) {
  const details = [
    { key: "id", label: t.fields.id, value: run.id },
    { key: "time", label: t.fields.time, value: minute(run.createdAt) },
    { key: "account", label: t.fields.account, value: `${run.account} · ${t.channels[run.channel]}` },
    { key: "days", label: t.fields.days, value: fill(t.days, { start: run.startDate, end: run.endDate, count: String(run.horizonDays) }) },
    { key: "pairs", label: t.fields.pairs, value: String(run.pairs) },
    { key: "creation", label: t.fields.creation, value: creationText(run, t, locale) },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.latest}</CardTitle>
        <CardDescription>{t.latestDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {details.map(({ key, label, value }) => (
            <div key={key} className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{label}</dt>
              <dd data-mrp-field={key} className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {run.creation?.status === "failed" && <CreationFailure creation={run.creation} labels={t} locale={locale} />}
      </CardContent>
    </Card>
  );
}

/** The Creation field: Manual, or what the automatic batch did. A run stored before E19-S03 has no creation and was manual. */
function creationText({ creation }: MrpRunView, t: Messages["mrp"], locale: Locale): string {
  if (!creation) return t.creation.manual;
  if (creation.status === "failed") return t.creation.failed;
  return creation.documents === 0 ? t.creation.none : plural(locale, creation.documents, t.creation.created);
}

type FailedCreation = Extract<NonNullable<MrpRunView["creation"]>, { status: "failed" }>;

/**
 * Why a failed batch created nothing (RUN-023): the cause, in the reader's language by code, and the candidate it
 * failed on. A standing note, not an alert: it stays as long as the run is the latest, so it must not take focus.
 */
function CreationFailure({ creation, labels: t, locale }: { creation: FailedCreation; labels: Messages["mrp"]; locale: Locale }) {
  const { candidate } = creation;
  return (
    <div data-mrp-creation-failure>
      <Callout tone="danger" title={t.creation.failureTitle}>
        <p>{failureCause(creation, t)}</p>
        {candidate && (
          <p>
            {fill(t.creation.candidate, {
              kind: (t.proposals.kinds[candidate.kind] ?? candidate.kind).toLocaleLowerCase(locale),
              material: candidate.material,
              location: candidate.location,
              quantity: localeQuantity(candidate.quantity, locale),
              date: candidate.needDate,
            })}
          </p>
        )}
      </Callout>
    </div>
  );
}

/** The cause by code; a quantity above the entry limit from its field errors; any other code keeps the server's English text. */
function failureCause({ code, message, params, fieldErrors }: FailedCreation, t: Messages["mrp"]): string {
  const causes = t.creation.causes;
  if (code === "MATERIAL_INACTIVE" || code === "LOCATION_INACTIVE") return causes[code];
  if (code === "MRP_BATCH_TOO_LARGE") return fill(causes.MRP_BATCH_TOO_LARGE, { candidates: String(params?.candidates), limit: String(params?.limit) });
  if (code === "VALIDATION_FAILED" && fieldErrors?.quantity) return causes.quantity;
  return message;
}
