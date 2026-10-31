import type { Locale, MaterialSummary, MrpLatestView, MrpRunView, NamedRecordView, Result } from "@cpg/core";
import type { MrpReportPageQuery } from "@cpg/core/validators/mrp/mrp-latest.schema";
import { EmptyState } from "@cpg/ui/backend/feedback/empty-state";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { fill } from "../../i18n/fill";
import type { Messages } from "../../i18n/messages/en";
import { MrpReport } from "./mrp-report";
import { RunMrpButton } from "./run-mrp-button";

interface MrpRunScreenProps {
  tenant: { code: string; name: string; readOnly: boolean };
  /** The latest run's report, one page of it read with `selected`, or null before the first run. */
  report: MrpLatestView | null;
  selected: MrpReportPageQuery;
  /** The tenant's materials and locations, for the report's filters. */
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  /** Runs MRP: the page's server action, bound to its tenant and generation. */
  action: () => Promise<Result<MrpRunView>>;
  locale: Locale;
  messages: Messages;
}

/** A moment as the page shows it: UTC, to the minute, as the other screens do. */
const minute = (date: Date) => `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/**
 * The body of the MRP page (E14-S02, E18-S01): Run MRP while the tenant is writable, the latest run,
 * its ID, time and account (RUN-002), and its report, until a newer run supersedes it. A read-only
 * tenant shows both without the button (RUN-021, TEN-019, TEN-018); the read-only banner says why.
 */
export function MrpRunScreen({ tenant, report, selected, materials, locations, action, locale, messages }: MrpRunScreenProps) {
  const t = messages.mrp;
  const writable = !tenant.readOnly;

  return (
    <div lang={locale} className="min-w-0">
      <PageHeader
        title={fill(t.heading, { tenant: tenant.name })}
        description={t.intro}
        actions={writable ? <RunMrpButton action={action} labels={{ run: t.run, running: t.running, errors: { ...messages.errors, ...t.errors } }} /> : undefined}
      />
      {report ? (
        <>
          <RunCard run={report.run} labels={t} />
          <MrpReport tenant={tenant} report={report} selected={selected} materials={materials} locations={locations} locale={locale} messages={messages} />
        </>
      ) : (
        <EmptyState title={t.empty}>{writable && t.emptyWritable}</EmptyState>
      )}
    </div>
  );
}

/** The latest run's header: its ID, time, account and channel, horizon and pair count. */
function RunCard({ run, labels: t }: { run: MrpRunView; labels: Messages["mrp"] }) {
  const details = [
    { key: "id", label: t.fields.id, value: run.id },
    { key: "time", label: t.fields.time, value: minute(run.createdAt) },
    { key: "account", label: t.fields.account, value: `${run.account} · ${t.channels[run.channel]}` },
    { key: "days", label: t.fields.days, value: fill(t.days, { start: run.startDate, end: run.endDate, count: String(run.horizonDays) }) },
    { key: "pairs", label: t.fields.pairs, value: String(run.pairs) },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.latest}</CardTitle>
        <CardDescription>{t.latestDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {details.map(({ key, label, value }) => (
            <div key={key} className="flex flex-col gap-1">
              <dt className="text-muted-foreground">{label}</dt>
              <dd data-mrp-field={key} className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
