"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition, type ChangeEvent } from "react";
import type { ImportReport, ImportRowOutcome, ImportSheetSummary } from "@cpg/core";
import { IMPORT_FILE_MAX_BYTES, WORKBOOK_TOO_LARGE_MESSAGE } from "@cpg/core/validators/imports/import-request.schema";
import { STOCK_REASON_MAX } from "@cpg/core/validators/stock/stock-correction.schema";
import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
import { DataTable } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { Button } from "@cpg/ui/components/button";
import { Input } from "@cpg/ui/components/input";
import { Label } from "@cpg/ui/components/label";
import { commitImport, dryRunImport } from "../../app/admin/[tenant]/import/actions";
import { commitStockImport, dryRunStockImport } from "../../app/admin/[tenant]/stock-import/actions";
import { errorMessage } from "../../i18n/error-message";
import { fill } from "../forms/form-labels";
import { fileToBase64 } from "./base64";
import type { ImportLabels } from "./labels";
import { changeText, counted, createdText, problemText } from "./report-text";

/** Which import the screen runs: the admin's master data and BOMs, or physical stock (both roles). */
export type ImportKind = "masterData" | "stock";

interface ImportScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  labels: ImportLabels;
  kind?: ImportKind;
}

/** Where a master-data row's record is shown, when it has a page of its own or a list to find it in. */
const PAGES: Record<string, (record: string) => string> = {
  Materials: (record) => `materials/${record}`,
  "Unit conversions": (record) => `materials/${record.split("/")[0]}`,
  Locations: () => "locations",
  Customers: () => "customers",
  Suppliers: () => "suppliers",
  "Planning parameters": () => "planning-parameters",
  "Safety stock": () => "safety-stock",
  "BOM headers": (record) => `boms/${record}`,
};

/** What differs between the two imports: their actions, their template, their record links, and whether a commit takes a reason. */
const KINDS = {
  masterData: { dryRun: dryRunImport, commit: commitImport, template: "/api/import/template", pages: PAGES, withReason: false },
  stock: {
    dryRun: dryRunStockImport,
    commit: commitStockImport,
    template: "/api/stock-import/template",
    pages: {
      Stock: (record: string) => {
        const [material, location] = record.split("/");
        return `stock?material=${material}&location=${location}`;
      },
    } as Record<string, (record: string) => string>,
    withReason: true,
  },
} as const;

/**
 * The Import screen (spec 2026-10-20--0908UTC-master-data-bom-import, mockup 01): download the
 * template, upload a workbook for a dry run that lists every problem or what each row would do, then
 * commit an error-free dry run in one go. A read-only tenant blocks the upload and the commit (Q11).
 * The stock import (spec 2026-10-20--2225UTC-stock-import) runs on the same screen, with a reason
 * its commit needs and no Created column: a stock row never creates a record.
 */
export function ImportScreen({ tenant, labels, kind = "masterData" }: ImportScreenProps) {
  const id = useId();
  const config = KINDS[kind];
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [committed, setCommitted] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [running, setRunning] = useState<"dryRun" | "commit" | null>(null);
  const [, startTransition] = useTransition();
  /** The file chosen last: a slower read of an earlier choice must not replace its bytes. */
  const latest = useRef<File | null>(null);

  const blocked = tenant.readOnly;
  const busy = running !== null;
  const changed = report ? report.rows.filter((row) => row.action !== "unchanged") : [];
  const unchanged = report ? report.rows.length - changed.length : 0;
  const step = committed || report?.previewToken ? 3 : file ? 2 : 1;
  const reasonMissing = config.withReason && reason.trim() === "";

  const failure = (error: { code: string; message: string; fieldErrors?: Record<string, string[]> }) => {
    const field = Object.values(error.fieldErrors ?? {})[0]?.[0];
    return field ? (labels.fieldMessages[field] ?? field) : errorMessage(labels.errors, error);
  };

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    latest.current = chosen;
    setFile(null);
    setWorkbook(null);
    setReport(null);
    setCommitted(null);
    setError(null);
    if (!chosen) return;
    if (chosen.size > IMPORT_FILE_MAX_BYTES) {
      setError(labels.fieldMessages[WORKBOOK_TOO_LARGE_MESSAGE]);
      return;
    }
    setFile(chosen);
    const read = await fileToBase64(chosen);
    if (latest.current === chosen) setWorkbook(read);
  }

  function run(action: "dryRun" | "commit") {
    setRunning(action);
    setError(null);
    startTransition(async () => {
      const commitValues = { workbook, previewToken: report?.previewToken, ...(config.withReason && { reason }) };
      const result =
        action === "dryRun"
          ? await config.dryRun(tenant.code, tenant.generation, { workbook })
          : await config.commit(tenant.code, tenant.generation, commitValues);
      // Updates after an await leave the transition unless wrapped again (see CrudForm).
      startTransition(() => {
        setRunning(null);
        if (!result.ok) {
          setError(failure(result.error));
          // A stale commit goes back to step 2, with the file still chosen.
          if (result.error.code === "IMPORT_STALE") setReport(null);
          return;
        }
        if (action === "dryRun") setReport(result.data);
        else setCommitted(result.data);
        setShowUnchanged(false);
      });
    });
  }

  function restart() {
    setFile(null);
    setWorkbook(null);
    setReport(null);
    setCommitted(null);
    setError(null);
    setReason("");
  }

  const recordCell = (row: ImportRowOutcome, link: boolean) => {
    const text = row.reference ? `${row.label} (${row.reference})` : row.label;
    const page = config.pages[row.sheet]?.(row.record);
    return link && page ? (
      <Link href={`/admin/${tenant.code}/${page}`} className="underline underline-offset-4">
        {text}
      </Link>
    ) : (
      text
    );
  };
  const changesCell = (row: ImportRowOutcome) =>
    row.action === "create" ? (
      <span className="text-sm text-muted-foreground">{createdText(row.changes, labels)}</span>
    ) : (
      <ul className="text-sm">
        {row.changes.map((change) => (
          <li key={change.field}>{changeText(change, labels)}</li>
        ))}
      </ul>
    );
  const rowKey = (row: ImportRowOutcome) => `${row.sheet}:${row.row}`;
  const t = labels;

  return (
    <div className="flex flex-col gap-6">
      <ol className="grid gap-2 sm:grid-cols-3">
        {t.steps.map((name, index) => (
          <li
            key={name}
            aria-current={index + 1 === step ? "step" : undefined}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${index + 1 === step ? "border-foreground font-semibold" : "text-muted-foreground"}`}
          >
            <span aria-hidden className="flex size-6 items-center justify-center rounded-full border text-xs">
              {index + 1 < step ? "✓" : index + 1}
            </span>
            {name}
          </li>
        ))}
      </ol>

      <section aria-labelledby={`${id}-template`} className="flex flex-col gap-3 rounded-xl border p-5">
        <h2 id={`${id}-template`} className="text-lg font-semibold">
          {t.template.title}
        </h2>
        <p className="text-sm text-muted-foreground">{t.template.text}</p>
        <div>
          <Button asChild variant="outline">
            <a href={config.template} download>
              {t.template.download}
            </a>
          </Button>
        </div>
      </section>

      <section aria-labelledby={`${id}-upload`} className="flex flex-col gap-3 rounded-xl border p-5">
        <h2 id={`${id}-upload`} className="text-lg font-semibold">
          {t.upload.title}
        </h2>
        <p className="text-sm text-muted-foreground">{t.upload.text}</p>
        {blocked && <ErrorMessage>🔒 {fill(t.readOnly, { tenant: tenant.name })}</ErrorMessage>}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor={`${id}-file`}>{t.upload.file}</Label>
            <Input
              id={`${id}-file`}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={choose}
              disabled={blocked || busy}
            />
          </div>
          <Button type="button" onClick={() => run("dryRun")} disabled={blocked || busy || workbook === null}>
            {running === "dryRun" ? t.upload.running : t.upload.run}
          </Button>
        </div>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        {report && !committed && (
          <>
            <DataTable
              label={t.summary.sheet}
              rows={report.summary}
              rowKey={(row) => row.sheet}
              empty="—"
              columns={[
                { id: "sheet", header: t.summary.sheet, cell: (row) => row.sheet },
                ...(kind === "stock" ? [] : [{ id: "created", header: t.summary.created, cell: (row: ImportSheetSummary) => row.created, className: "text-right" }]),
                { id: "updated", header: t.summary.updated, cell: (row) => row.updated, className: "text-right" },
                { id: "unchanged", header: t.summary.unchanged, cell: (row) => row.unchanged, className: "text-right" },
                {
                  id: "errors",
                  header: t.summary.errors,
                  cell: (row) => (row.errors > 0 ? <Badge variant="destructive">{row.errors}</Badge> : 0),
                  className: "text-right",
                },
              ]}
            />
            {report.errors.length > 0 ? (
              <>
                <ErrorMessage>{counted(t.upload.problems, report.errors.length)}</ErrorMessage>
                <DataTable
                  label={t.problems.problem}
                  rows={report.errors.map((issue, index) => ({ issue, index }))}
                  rowKey={({ index }) => String(index)}
                  empty="—"
                  columns={[
                    { id: "sheet", header: t.problems.sheet, cell: ({ issue }) => issue.sheet ?? "—" },
                    { id: "row", header: t.problems.row, cell: ({ issue }) => issue.row ?? "—", className: "text-right" },
                    { id: "column", header: t.problems.column, cell: ({ issue }) => issue.column ?? "—" },
                    { id: "problem", header: t.problems.problem, cell: ({ issue }) => problemText(issue, labels, tenant.name), className: "whitespace-normal" },
                  ]}
                />
              </>
            ) : (
              <>
                <DataTable
                  label={t.preview.changes}
                  rows={showUnchanged ? report.rows : changed}
                  rowKey={rowKey}
                  empty={t.commit.nothing}
                  columns={[
                    { id: "sheet", header: t.preview.sheet, cell: (row) => row.sheet },
                    { id: "row", header: t.preview.row, cell: (row) => row.row, className: "text-right" },
                    { id: "action", header: t.preview.action, cell: (row) => <Badge variant="outline">{t.actions[row.action]}</Badge> },
                    { id: "record", header: t.preview.record, cell: (row) => recordCell(row, false), className: "whitespace-normal" },
                    { id: "changes", header: t.preview.changes, cell: changesCell, className: "whitespace-normal" },
                  ]}
                />
                {unchanged > 0 && !showUnchanged && (
                  <div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowUnchanged(true)}>
                      {counted(t.preview.showUnchanged, unchanged)}
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>

      <section aria-labelledby={`${id}-commit`} className="flex flex-col gap-3 rounded-xl border p-5">
        <h2 id={`${id}-commit`} className="text-lg font-semibold">
          {t.commit.title}
        </h2>
        {committed ? (
          <>
            <p role="status" className="rounded-lg border border-green-600/30 bg-green-600/10 px-3 py-2 text-sm">
              ✓{" "}
              {fill(t.commit.done, {
                tenant: tenant.name,
                reason: reason.trim(),
                ...Object.fromEntries(
                  (["create", "update", "unchanged"] as const).map((action) => [
                    { create: "created", update: "updated", unchanged: "unchanged" }[action],
                    String(committed.rows.filter((row) => row.action === action).length),
                  ]),
                ),
              })}
            </p>
            <DataTable
              label={t.commit.title}
              rows={committed.rows.filter((row) => row.action !== "unchanged")}
              rowKey={rowKey}
              empty={t.commit.nothing}
              columns={[
                { id: "sheet", header: t.preview.sheet, cell: (row) => row.sheet },
                { id: "row", header: t.preview.row, cell: (row) => row.row, className: "text-right" },
                { id: "result", header: t.preview.action, cell: (row) => <Badge variant="outline">{t.results[row.action]}</Badge> },
                { id: "record", header: t.preview.record, cell: (row) => recordCell(row, true), className: "whitespace-normal" },
              ]}
            />
            <div>
              <Button type="button" variant="outline" onClick={restart}>
                {t.commit.again}
              </Button>
            </div>
          </>
        ) : (
          <>
            {report?.previewToken && changed.length > 0 && (
              <p className="text-sm text-muted-foreground">{counted(t.commit.text, changed.length, { tenant: tenant.name })}</p>
            )}
            {report?.previewToken && changed.length === 0 && <p className="text-sm text-muted-foreground">{t.commit.nothing}</p>}
            {t.reason && (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${id}-reason`}>{t.reason.label}</Label>
                <Input
                  id={`${id}-reason`}
                  value={reason}
                  maxLength={STOCK_REASON_MAX}
                  placeholder={t.reason.placeholder}
                  aria-describedby={`${id}-reason-hint`}
                  onChange={(event) => setReason(event.target.value)}
                  disabled={blocked || busy}
                />
                <p id={`${id}-reason-hint`} className="text-xs text-muted-foreground">
                  {t.reason.hint}
                </p>
              </div>
            )}
            <div>
              <Button type="button" onClick={() => run("commit")} disabled={blocked || busy || !report?.previewToken || changed.length === 0 || reasonMissing}>
                {running === "commit" ? t.commit.committing : counted(t.commit.button, changed.length)}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
