"use client";

import { useId, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import type { CompletionPreview, CompletionResult } from "@cpg/core";
import { productionCompletionCreateSchema } from "@cpg/core/validators/production-orders/production-completion.schema";
import type { ApiResult, FieldErrors } from "@cpg/ui/backend/api/result";
import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
import { toFieldErrors } from "@cpg/ui/backend/forms/crud-form";
import { Badge } from "@cpg/ui/components/badge";
import { Button } from "@cpg/ui/components/button";
import { Checkbox } from "@cpg/ui/components/checkbox";
import { Input } from "@cpg/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import { fill, shownQuantity } from "../forms/form-labels";
import { fieldControls } from "../purchasing/field-controls";
import type { MaterialChoice } from "../purchase-requisitions/requisition-form";
import type { ProductionLabels } from "./labels";

/** A material the form offers as an added input: an active raw or intermediate one outside the recipe, with its units. */
export type CompletionInputChoice = MaterialChoice;

/** What the form sends: the output it was opened for, every material used and, past the target, the acknowledgement. */
export interface CompletionValues {
  quantity: string;
  unit: string;
  components: { material: string; quantity: string; unit: string }[];
  acceptOverproduction?: boolean;
}

export interface CompletionFormProps {
  labels: ProductionLabels;
  preview: CompletionPreview;
  /** The output's unit as entered on the first step; the preview carries its quantity. */
  unit: string;
  inputs: CompletionInputChoice[];
  formatError: (error: Extract<ApiResult<unknown>, { ok: false }>["error"]) => string;
  /** Translates a field message; `params` are the refusal's, for a message about no single row. */
  formatFieldError: (message: string, params?: Record<string, string>) => string;
  action: (values: CompletionValues) => Promise<ApiResult<CompletionResult>>;
  onSuccess: (result: CompletionResult) => void;
  onBack: () => void;
  onCancel: () => void;
}

/** What the overproduction warning says: the preview's figures, or the server's when another completion got there first. */
type Overproduction = { produced: string; target: string; output: string; unit: string };

interface AddedRow {
  key: number;
  material: string;
  quantity: string;
  unit: string;
}

/**
 * The consumption step of Post completion (spec UI/UX): one row per pinned component, its actual
 * pre-filled with what the recipe expects (PRD-010), then any added raw or intermediate inputs
 * (PRD-015/016). Not a `CrudForm`, whose fields are fixed, but it keeps its conventions: a client-side
 * check with the shared schema, field errors under their row (`components.N.<field>`, N the row's place
 * in what was sent), other errors above the buttons, a pending state, `Cmd/Ctrl+Enter` and `Escape`.
 */
export function CompletionForm({ labels, preview, unit, inputs, formatError, formatFieldError, action, onSuccess, onBack, onCancel }: CompletionFormProps) {
  const t = labels.completion;
  const id = useId();
  const [pinned, setPinned] = useState(() => preview.components.map(({ material, expected, baseUnit }) => ({ material, quantity: shownQuantity(expected), unit: baseUnit })));
  const [added, setAdded] = useState<AddedRow[]>([]);
  const [nextKey, setNextKey] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [raced, setRaced] = useState<Overproduction | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { control } = fieldControls(id, fieldErrors, formatFieldError);
  const over: Overproduction | null =
    raced ?? (preview.exceedsTarget ? { produced: preview.produced, target: preview.target, output: preview.baseQuantity, unit: preview.baseUnit } : null);

  const setPinnedRow = (index: number, changes: { quantity?: string; unit?: string }) =>
    setPinned((rows) => rows.map((row, at) => (at === index ? { ...row, ...changes } : row)));
  const setAddedRow = (key: number, changes: Partial<AddedRow>) => setAdded((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  const addRow = () => {
    setAdded((rows) => [...rows, { key: nextKey, material: "", quantity: "", unit: "" }]);
    setNextKey((key) => key + 1);
  };

  /** Removing a row shifts the rows after it, so row errors keyed by position no longer fit: they are cleared. */
  const removeRow = (key: number) => {
    setAdded((rows) => rows.filter((row) => row.key !== key));
    setFieldErrors({});
  };

  function show(errors: FieldErrors, fallback: string | null, params?: Record<string, string>) {
    const rows = Object.fromEntries(Object.entries(errors).filter(([name]) => /^components\.\d+\.(material|quantity|unit)$/.test(name)));
    const other = Object.entries(errors).filter(([name]) => !Object.hasOwn(rows, name)).flatMap(([, messages]) => messages);
    setFieldErrors(rows);
    setFormError(other.length > 0 ? formatFieldError(other[0], params) : Object.keys(rows).length > 0 ? null : fallback);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (over && !accepted) {
      setFieldErrors({});
      setFormError(t.acceptRequired);
      return;
    }
    const values: CompletionValues = {
      quantity: preview.quantity,
      unit,
      components: [...pinned, ...added.map(({ material, quantity, unit: entered }) => ({ material, quantity, unit: entered }))],
      ...(over ? { acceptOverproduction: true } : {}),
    };
    const parsed = productionCompletionCreateSchema.safeParse(values);
    if (!parsed.success) {
      show(toFieldErrors(parsed.error.issues), null);
      return;
    }
    startTransition(async () => {
      const result = await action(values);
      // Updates after an await leave the transition unless wrapped again (see CrudForm).
      startTransition(() => {
        if (result.ok) {
          onSuccess(result.data);
          return;
        }
        if (result.error.code === "PRODUCTION_OVERPRODUCTION") {
          // Another completion took the order past its target after the preview: warn with the server's figures.
          const { produced, target, output, unit: base } = result.error.params!;
          setRaced({ produced, target, output, unit: base });
          setAccepted(false);
        }
        show(result.error.fieldErrors ?? {}, formatError(result.error), result.error.params);
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

  const unitsOf = (material: string) => inputs.find((choice) => choice.value === material)?.units ?? [];
  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t.prefilled}</p>
      {over && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-500 bg-amber-50 p-3 text-sm dark:bg-amber-950" role="alert">
          <p>
            <strong>{t.overTitle}</strong>{" "}
            {fill(t.over, { produced: shownQuantity(over.produced), target: shownQuantity(over.target), output: shownQuantity(over.output), unit: over.unit })}
          </p>
          <label className="flex items-center gap-2">
            <Checkbox checked={accepted} onCheckedChange={(checked) => setAccepted(checked === true)} />
            {t.accept}
          </label>
        </div>
      )}
      {preview.components.map((component, index) => {
        const row = pinned[index];
        const quantity = control(`components.${index}.quantity`);
        const units = control(`components.${index}.unit`);
        const name = `${component.material} ${component.description}`;
        const hint = `${id}-components-${index}-hint`;
        // The expected and available figures (and the inactive flag) describe the Actual field to screen readers.
        const described = [hint, quantity.props["aria-describedby"]].filter(Boolean).join(" ");
        return (
          <fieldset key={component.material} className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-[2fr_1fr_1fr] sm:items-start" data-component={component.material}>
            <legend className="sr-only">{name}</legend>
            <div className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1" aria-hidden="true">
              <span className="wrap-anywhere">{name}</span>
              <span id={hint} className="text-xs text-muted-foreground">
                {!component.active && <Badge variant="outline" className="mr-2">{t.inactive}</Badge>}
                {t.expected}: {shownQuantity(component.expected)} {component.baseUnit} · {t.available}: {shownQuantity(component.available)} {component.baseUnit}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <Input aria-label={`${t.actual}, ${name}`} inputMode="decimal" value={row.quantity} onChange={(event) => setPinnedRow(index, { quantity: event.target.value })} {...quantity.props} aria-describedby={described} />
              {quantity.node}
            </div>
            <div className="flex flex-col gap-1">
              <NativeSelect className="w-full" aria-label={`${t.unit}, ${name}`} value={row.unit} onChange={(event) => setPinnedRow(index, { unit: event.target.value })} {...units.props}>
                {component.units.map((each) => (
                  <NativeSelectOption key={each} value={each}>
                    {each}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {units.node}
            </div>
          </fieldset>
        );
      })}
      {added.map((row, position) => {
        const index = pinned.length + position;
        const label = fill(t.inputLine, { number: String(position + 1) });
        const material = control(`components.${index}.material`);
        const quantity = control(`components.${index}.quantity`);
        const units = control(`components.${index}.unit`);
        return (
          <fieldset key={row.key} className="grid grid-cols-2 gap-2 rounded-md border border-dashed p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-start" data-added={position + 1}>
            <legend className="sr-only">{label}</legend>
            <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
              <NativeSelect
                className="w-full"
                aria-label={`${t.material}, ${label}`}
                value={row.material}
                onChange={(event) => setAddedRow(row.key, { material: event.target.value, unit: unitsOf(event.target.value)[0] ?? "" })}
                {...material.props}
              >
                <NativeSelectOption value="">{t.choose}</NativeSelectOption>
                {inputs.map((choice) => (
                  <NativeSelectOption key={choice.value} value={choice.value}>
                    {choice.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {material.node}
            </div>
            <div className="flex flex-col gap-1">
              <Input aria-label={`${t.actual}, ${label}`} inputMode="decimal" value={row.quantity} onChange={(event) => setAddedRow(row.key, { quantity: event.target.value })} {...quantity.props} />
              {quantity.node}
            </div>
            <div className="flex flex-col gap-1">
              <NativeSelect className="w-full" aria-label={`${t.unit}, ${label}`} value={row.unit} onChange={(event) => setAddedRow(row.key, { unit: event.target.value })} {...units.props}>
                {unitsOf(row.material).map((each) => (
                  <NativeSelectOption key={each} value={each}>
                    {each}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {units.node}
            </div>
            <Button type="button" variant="outline" onClick={() => removeRow(row.key)}>
              {fill(t.removeInput, { number: String(position + 1) })}
            </Button>
          </fieldset>
        );
      })}
      <div>
        <Button type="button" variant="outline" onClick={addRow}>
          {t.addInput}
        </Button>
      </div>
      {formError && <ErrorMessage>{formError}</ErrorMessage>}
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          {t.back}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t.cancel}
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? t.pending : t.submit}
          </Button>
        </div>
      </div>
    </form>
  );
}
