"use client";

import { useId, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { customerOrderCreateSchema, customerOrderUpdateSchema, ORDER_LINES_MAX, type CustomerOrderChanges } from "@cpg/core/validators/customer-orders/customer-order.schema";
import type { ApiResult, FieldErrors } from "@cpg/ui/backend/api/result";
import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
import { Autocomplete, type AutocompleteOption } from "@cpg/ui/backend/forms/autocomplete";
import { toFieldErrors } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Input } from "@cpg/ui/components/input";
import { Label } from "@cpg/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import { errorFormatter, fill } from "../forms/form-labels";
import { orderFieldError, type OrderLabels } from "./labels";

export interface OrderChoice { value: string; label: string; active: boolean; units: string[] }
/** A line's material, as the material picker offers it (#217), with the units it may be entered in. */
export type OrderMaterialChoice = AutocompleteOption & { active: boolean; units: string[] };
export interface OrderChoices { customers: OrderChoice[]; locations: OrderChoice[]; materials: OrderMaterialChoice[] }
interface Props<T> {
  labels: OrderLabels;
  choices: OrderChoices;
  initial?: CustomerOrderChanges;
  lockedLines?: string[];
  action: (values: CustomerOrderChanges) => Promise<ApiResult<T>>;
  onSuccess: (data: T) => void;
  onCancel: () => void;
  /** The reader's language, for the material picker's counts. */
  locale?: string;
}
const EMPTY_LINE = { material: "", quantity: "", unit: "", requiredDate: "" };

/** Aggregate array form, as for BOM recipes: CrudForm's string fields cannot hold editable line arrays. */
export function OrderForm<T>({ labels: t, choices, initial, action, onSuccess, onCancel, lockedLines = [], locale }: Props<T>) {
  const formId = useId();
  const [values, setValues] = useState<CustomerOrderChanges>(() => initial ?? { customer: "", location: "", lines: [EMPTY_LINE] });
  const [keys, setKeys] = useState(() => values.lines.map((_, index) => index));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (changes: Partial<CustomerOrderChanges>) => setValues((current) => ({ ...current, ...changes }));
  const setLine = (index: number, changes: Partial<CustomerOrderChanges["lines"][number]>) =>
    set({ lines: values.lines.map((line, at) => at === index ? { ...line, ...changes } : line) });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const schema = initial ? customerOrderUpdateSchema.omit({ version: true }) : customerOrderCreateSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) { setErrors(toFieldErrors(parsed.error.issues)); setFormError(null); return; }
    startTransition(async () => {
      const result = await action(values);
      startTransition(() => {
        if (result.ok) { setErrors({}); setFormError(null); onSuccess(result.data); return; }
        setErrors(result.error.fieldErrors ?? {});
        setFormError(result.error.fieldErrors && Object.keys(result.error.fieldErrors).length > 0 ? null : errorFormatter(t)(result.error));
      });
    });
  }
  function keyDown(event: KeyboardEvent<HTMLFormElement>) {
    // A control that handled the key itself (the material picker closing its list) keeps it.
    if (event.defaultPrevented) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.requestSubmit(); }
    else if (event.key === "Escape") { event.preventDefault(); onCancel(); }
  }
  function field(name: string, label: string, value: string, onChange: (value: string) => void, options?: { value: string; label: string }[] | { picker: AutocompleteOption[] }, type = "text", locked = false) {
    const id = `${formId}-${name}`;
    const props = { id, name, value, disabled: pending || locked, "aria-invalid": errors[name] ? true as const : undefined, "aria-describedby": errors[name] ? `${id}-error` : undefined };
    return <div key={name} className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {options && "picker" in options ? <Autocomplete id={id} value={value} onChange={onChange} options={options.picker} disabled={props.disabled}
        aria-invalid={props["aria-invalid"]} aria-describedby={props["aria-describedby"]} labels={t.picker.labels} placeholder={t.picker.placeholder} locale={locale} />
      : options ? <NativeSelect className="w-full" {...props} onChange={(event) => onChange(event.target.value)}>
        <NativeSelectOption value="" disabled>{t.choose}</NativeSelectOption>
        {options.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
      </NativeSelect> : <Input {...props} type={type} inputMode={type === "text" ? "decimal" : undefined} onChange={(event) => onChange(event.target.value)} />}
      {errors[name] && <p id={`${id}-error`} className="text-sm text-destructive">{orderFieldError(t, errors[name][0])}</p>}
    </div>;
  }
  return <form onSubmit={submit} onKeyDown={keyDown} noValidate className="flex flex-col gap-4">
    <div className="grid gap-4 sm:grid-cols-2">
      {field("customer", t.customer, values.customer, (customer) => set({ customer }), choices.customers.filter((choice) => choice.active || choice.value === initial?.customer), "text", lockedLines.length > 0)}
      {field("location", t.location, values.location, (location) => set({ location }), choices.locations.filter((choice) => choice.active || choice.value === initial?.location), "text", lockedLines.length > 0)}
    </div>
    {values.lines.map((line, index) => {
      const number = String(index + 1);
      const locked = line.id !== undefined && lockedLines.includes(line.id);
      const chosen = choices.materials.find(({ value }) => value === line.material);
      const original = initial?.lines.find(({ id }) => id === line.id);
      const units = [...(chosen?.units ?? [])];
      if (original?.material === line.material && !units.includes(original.unit)) units.push(original.unit);
      return <fieldset key={keys[index]} className="min-w-0 rounded-md border p-3" data-order-line={index}>
        <legend className="px-1 text-sm font-medium">{fill(t.line, { number })}</legend>
        {locked && <p className="mb-3 text-xs text-muted-foreground">{t.postedHint}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {field(`lines.${index}.material`, `${t.material}, ${fill(t.line, { number })}`, line.material, (material) => setLine(index, { material, unit: choices.materials.find(({ value }) => value === material)?.units[0] ?? "" }),
            { picker: choices.materials.filter((choice) => choice.active || choice.value === original?.material) }, "text", locked)}
          {field(`lines.${index}.quantity`, `${t.quantity}, ${fill(t.line, { number })}`, line.quantity, (quantity) => setLine(index, { quantity }))}
          {field(`lines.${index}.unit`, `${t.unit}, ${fill(t.line, { number })}`, line.unit, (unit) => setLine(index, { unit }), units.map((unit) => ({ value: unit, label: unit })), "text", locked)}
          {field(`lines.${index}.requiredDate`, `${t.requiredDate}, ${fill(t.line, { number })}`, line.requiredDate, (requiredDate) => setLine(index, { requiredDate }), undefined, "date", locked)}
        </div>
        <Button type="button" variant="outline" className="mt-3" disabled={pending || locked} onClick={() => {
          set({ lines: values.lines.filter((_, at) => at !== index) }); setKeys(keys.filter((_, at) => at !== index)); setErrors({});
        }}>{fill(t.removeLine, { number })}</Button>
      </fieldset>;
    })}
    {errors.lines && <ErrorMessage>{orderFieldError(t, errors.lines[0])}</ErrorMessage>}
    <div><Button type="button" variant="outline" disabled={pending || values.lines.length >= ORDER_LINES_MAX} onClick={() => {
      set({ lines: [...values.lines, EMPTY_LINE] }); setKeys([...keys, Math.max(-1, ...keys) + 1]);
    }}>{t.addLine}</Button></div>
    {formError && <ErrorMessage>{formError}</ErrorMessage>}
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>{t.cancel}</Button>
      <Button type="submit" disabled={pending}>{pending ? t.saving : t.save}</Button>
    </div>
  </form>;
}
