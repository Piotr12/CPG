"use client";

import { useId, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import type { ApiResult, FieldErrors } from "@cpg/ui/backend/api/result";
import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
import { toFieldErrors, type FormSchema } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Input } from "@cpg/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import { fieldControls } from "../purchasing/field-controls";
import { errorFormatter, fieldErrorFormatter, type ReceiptLineChoice, type ReceiptsLabels } from "./labels";

/** One receipt line as the form sends it; the server action adds the order and parses it with the shared schema. */
export interface ReceiptLineValues {
  line: number;
  quantity: string;
  unit: string;
}

export interface ReceiptValues {
  lines: ReceiptLineValues[];
}

export interface ReceiptFormProps<T> {
  labels: ReceiptsLabels;
  /** The order's lines, in order. */
  lines: ReceiptLineChoice[];
  /** The shared check of the lines (`receiptFormSchema`): the order is bound by the page. */
  schema: FormSchema;
  action: (values: ReceiptValues) => Promise<ApiResult<T>>;
  onSuccess: (data: T) => void;
  onCancel: () => void;
}

/** The field errors of what was sent (`lines.N.<field>`, N its index in the receipt) under the form's rows (`line.<number>.<field>`). */
function byRow(errors: FieldErrors, sent: readonly number[]): { rows: FieldErrors; other: string[] } {
  const rows: FieldErrors = {};
  const other: string[] = [];
  for (const [name, messages] of Object.entries(errors)) {
    const match = /^lines\.(\d+)\.(\w+)$/.exec(name);
    const line = match ? sent[Number(match[1])] : undefined;
    if (match && line !== undefined) rows[`line.${line}.${match[2]}`] = messages;
    else other.push(...messages);
  }
  return { rows, other };
}

/**
 * The Post goods receipt form (spec Q12): one row per order line with what is outstanding, a
 * quantity (left empty to skip the line) and a unit, the base unit first. Only the rows with a
 * quantity are sent. Not a `CrudForm`, whose fields are fixed, but it keeps its conventions: a
 * client-side check with the shared schema, field errors under their row, other errors above the
 * buttons, a pending state, `Cmd/Ctrl+Enter` to submit and `Escape` to cancel.
 */
export function ReceiptForm<T>({ labels, lines, schema, action, onSuccess, onCancel }: ReceiptFormProps<T>) {
  const id = useId();
  const t = labels.post;
  const [rows, setRows] = useState(() => lines.map(({ line, units }) => ({ line, quantity: "", unit: units[0] })));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formatError = errorFormatter(labels);
  const formatFieldError = fieldErrorFormatter(labels);
  const { control } = fieldControls(id, fieldErrors, formatFieldError);
  const setRow = (line: number, changes: Partial<ReceiptLineValues>) =>
    setRows((current) => current.map((row) => (row.line === line ? { ...row, ...changes } : row)));

  /** Shows `errors` of the receipt `sent`: a row's under it, any other above the buttons. */
  function show(errors: FieldErrors, sent: readonly number[], fallback: string | null) {
    const { rows: shown, other } = byRow(errors, sent);
    setFieldErrors(shown);
    setFormError(other.length > 0 ? formatFieldError(other[0]) : Object.keys(shown).length > 0 ? null : fallback);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values: ReceiptValues = {
      lines: rows.filter(({ quantity }) => quantity.trim() !== ""),
    };
    const sent = values.lines.map(({ line }) => line);
    if (sent.length === 0) {
      setFieldErrors({});
      setFormError(t.nothing);
      return;
    }
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

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} noValidate className="flex flex-col gap-4">
      {lines.map((choice) => {
        const row = rows.find(({ line }) => line === choice.line)!;
        const quantity = control(`line.${choice.line}.quantity`);
        const unit = control(`line.${choice.line}.unit`);
        return (
          <fieldset
            key={choice.line}
            className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-[2fr_1fr_1fr] sm:items-start"
            data-line={choice.line}
          >
            <legend className="sr-only">{choice.label}</legend>
            <div className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1" aria-hidden="true">
              <span className="wrap-anywhere">{choice.label}</span>
              <span className="text-xs text-muted-foreground">{choice.outstanding}</span>
            </div>
            <div className="flex flex-col gap-1">
              <Input
                aria-label={`${t.quantity}, ${choice.label}`}
                inputMode="decimal"
                value={row.quantity}
                onChange={(event) => setRow(choice.line, { quantity: event.target.value })}
                {...quantity.props}
              />
              {quantity.node}
            </div>
            <div className="flex flex-col gap-1">
              <NativeSelect
                className="w-full"
                aria-label={`${t.unit}, ${choice.label}`}
                value={row.unit}
                onChange={(event) => setRow(choice.line, { unit: event.target.value })}
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
