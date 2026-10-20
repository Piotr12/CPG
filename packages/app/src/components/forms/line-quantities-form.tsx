"use client";

import { useId, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import type { ApiResult, FieldErrors } from "@cpg/ui/backend/api/result";
import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
import { toFieldErrors, type FormSchema } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Input } from "@cpg/ui/components/input";
import { Label } from "@cpg/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import { fieldControls } from "../purchasing/field-controls";

/** One line a document's form offers: what a sent row names it by, what it is, a hint (what is left) and the units it takes. */
export interface LineQuantityChoice {
  /** A line number (a purchase-order or shipment line) or a stable line ID (a customer-order line). */
  key: number | string;
  label: string;
  hint: string;
  /** The material's base unit first, then the units it converts. */
  units: string[];
}

/** The form's own strings, in the reader's language. */
export interface LineQuantitiesLabels {
  quantity: string;
  unit: string;
  submit: string;
  submitting: string;
  cancel: string;
  /** Said when every row is empty. */
  nothing: string;
}

/** What the form sends: the rows with a quantity, each naming its line under `keyName`, and the date when it has one. */
export type LineQuantitiesValues = { plannedDate?: string; lines: Record<string, number | string>[] };

export interface LineQuantitiesFormProps<T> {
  labels: LineQuantitiesLabels;
  /** The field each sent row names its line by: `line` (a number) or `orderLine` (an ID). */
  keyName: "line" | "orderLine";
  lines: LineQuantityChoice[];
  /** A date above the rows, sent as `plannedDate` (a shipment's planned date). */
  date?: { label: string; initial: string };
  /** The shared check of what is sent: the document it is against is bound by the page. */
  schema: FormSchema;
  formatError: (error: Extract<ApiResult<unknown>, { ok: false }>["error"]) => string;
  formatFieldError: (message: string) => string;
  action: (values: LineQuantitiesValues) => Promise<ApiResult<T>>;
  onSuccess: (data: T) => void;
  onCancel: () => void;
}

/**
 * The field errors of what was sent (`lines.N.<field>`, N its index among the sent rows) under the
 * form's rows (`line.<key>.<field>`), for the fields a row has a control for, and the date's under
 * the date; any other is the form's.
 */
function byRow(errors: FieldErrors, sent: readonly (number | string)[]): { rows: FieldErrors; other: string[] } {
  const rows: FieldErrors = {};
  const other: string[] = [];
  for (const [name, messages] of Object.entries(errors)) {
    const match = /^lines\.(\d+)\.(quantity|unit)$/.exec(name);
    const key = match ? sent[Number(match[1])] : undefined;
    if (match && key !== undefined) rows[`line.${key}.${match[2]}`] = messages;
    else if (name === "plannedDate") rows.plannedDate = messages;
    else other.push(...messages);
  }
  return { rows, other };
}

/**
 * The quantity-per-line form of a document against another (a goods receipt against a purchase
 * order, a shipment against a customer order, a goods issue against a shipment): one row per line
 * with its hint, a quantity (left empty to skip the line) and a unit, the base unit first, and
 * optionally a date. Only the rows with a quantity are sent. Not a `CrudForm`, whose fields are fixed,
 * but it keeps its conventions: a client-side check with the shared schema, field errors under their
 * row, other errors above the buttons, a pending state, `Cmd/Ctrl+Enter` to submit and `Escape` to cancel.
 */
export function LineQuantitiesForm<T>({ labels: t, keyName, lines, date, schema, formatError, formatFieldError, action, onSuccess, onCancel }: LineQuantitiesFormProps<T>) {
  const id = useId();
  const [rows, setRows] = useState(() => lines.map(({ key, units }) => ({ key, quantity: "", unit: units[0] })));
  const [plannedDate, setPlannedDate] = useState(date?.initial ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { control } = fieldControls(id, fieldErrors, formatFieldError);
  const setRow = (key: number | string, changes: { quantity?: string; unit?: string }) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));

  /** Shows `errors` of the rows `sent`: a row's under it, any other above the buttons. */
  function show(errors: FieldErrors, sent: readonly (number | string)[], fallback: string | null) {
    const { rows: shown, other } = byRow(errors, sent);
    setFieldErrors(shown);
    setFormError(other.length > 0 ? formatFieldError(other[0]) : Object.keys(shown).length > 0 ? null : fallback);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const filled = rows.filter(({ quantity }) => quantity.trim() !== "");
    const sent = filled.map(({ key }) => key);
    if (sent.length === 0) {
      setFieldErrors({});
      setFormError(t.nothing);
      return;
    }
    const values: LineQuantitiesValues = {
      ...(date ? { plannedDate } : {}),
      lines: filled.map(({ key, quantity, unit }) => ({ [keyName]: key, quantity, unit })),
    };
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      show(toFieldErrors(parsed.error.issues), sent, null);
      return;
    }
    startTransition(async () => {
      const result = await action(values);
      // Updates after an await leave the transition unless wrapped again (see CrudForm).
      startTransition(() => {
        if (result.ok) {
          setFieldErrors({});
          setFormError(null);
          onSuccess(result.data);
          return;
        }
        show(result.error.fieldErrors ?? {}, sent, formatError(result.error));
      });
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  const dateControl = control("plannedDate");
  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} noValidate className="flex flex-col gap-4">
      {date && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={dateControl.props.id}>{date.label}</Label>
          <Input type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} {...dateControl.props} />
          {dateControl.node}
        </div>
      )}
      {lines.map((choice) => {
        const row = rows.find(({ key }) => key === choice.key)!;
        const quantity = control(`line.${choice.key}.quantity`);
        const unit = control(`line.${choice.key}.unit`);
        return (
          <fieldset
            key={choice.key}
            className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-[2fr_1fr_1fr] sm:items-start"
            data-line={choice.key}
          >
            <legend className="sr-only">{choice.label}</legend>
            <div className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1" aria-hidden="true">
              <span className="wrap-anywhere">{choice.label}</span>
              <span className="text-xs text-muted-foreground">{choice.hint}</span>
            </div>
            <div className="flex flex-col gap-1">
              <Input
                aria-label={`${t.quantity}, ${choice.label}`}
                inputMode="decimal"
                value={row.quantity}
                onChange={(event) => setRow(choice.key, { quantity: event.target.value })}
                {...quantity.props}
              />
              {quantity.node}
            </div>
            <div className="flex flex-col gap-1">
              <NativeSelect
                className="w-full"
                aria-label={`${t.unit}, ${choice.label}`}
                value={row.unit}
                onChange={(event) => setRow(choice.key, { unit: event.target.value })}
                {...unit.props}
              >
                {choice.units.map((each) => (
                  <NativeSelectOption key={each} value={each}>
                    {each}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {unit.node}
            </div>
          </fieldset>
        );
      })}
      {formError && <ErrorMessage>{formError}</ErrorMessage>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t.cancel}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? t.submitting : t.submit}
        </Button>
      </div>
    </form>
  );
}
