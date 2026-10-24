"use client";

import { useId, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import type { ApiResult, FieldErrors } from "@cpg/ui/backend/api/result";
import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
import { Autocomplete } from "@cpg/ui/backend/forms/autocomplete";
import { toFieldErrors, type FormSchema } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Input } from "@cpg/ui/components/input";
import { Label } from "@cpg/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import type { FormOption } from "../forms/form-labels";
import { fieldControls } from "../purchasing/field-controls";
import type { MaterialPick } from "../purchase-requisitions/choices";
import { errorFormatter, fieldErrorFormatter, type TransfersLabels } from "./labels";

/** The form's fields as typed text; the server action parses them with the shared schema. */
export interface TransferValues {
  material: string;
  source: string;
  destination: string;
  quantity: string;
  unit: string;
  plannedDispatch: string;
  plannedArrival: string;
}

export interface TransferFormProps<T> {
  labels: TransfersLabels;
  /** The materials the autocomplete offers (#217). */
  materials: MaterialPick[];
  locations: FormOption[];
  /** The reader's language, for the autocomplete's counts. */
  locale: string;
  schema: FormSchema;
  action: (values: TransferValues) => Promise<ApiResult<T>>;
  onSuccess: (data: T) => void;
  onCancel: () => void;
}

const FIELDS = ["material", "source", "destination", "quantity", "unit", "plannedDispatch", "plannedArrival"];
const EMPTY: TransferValues = { material: "", source: "", destination: "", quantity: "", unit: "", plannedDispatch: "", plannedArrival: "" };

/**
 * The Create transfer form (spec Q13): a material, chosen in an autocomplete (#217), and its unit (the units depend on the material, so
 * this is not a `CrudForm`), the two locations, a quantity and the planned dates. It keeps
 * `CrudForm`'s conventions, like the requisition form: client-side checks with the shared schema,
 * server field errors under the field they name, other errors above the buttons, a pending state,
 * `Cmd/Ctrl+Enter` to submit, `Escape` to cancel.
 */
export function TransferForm<T>({ labels, materials, locations, locale, schema, action, onSuccess, onCancel }: TransferFormProps<T>) {
  const id = useId();
  const t = labels.form;
  const [values, setValues] = useState<TransferValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formatError = errorFormatter(labels);
  const { control } = fieldControls(id, fieldErrors, fieldErrorFormatter(labels));
  const units = materials.find(({ value }) => value === values.material)?.units ?? [];

  const set = (changes: Partial<TransferValues>) => setValues((current) => ({ ...current, ...changes }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error.issues));
      setFormError(null);
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
        const errors = result.error.fieldErrors ?? {};
        setFieldErrors(errors);
        setFormError(Object.keys(errors).some((name) => FIELDS.includes(name)) ? null : formatError(result.error));
      });
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    // A control that handled the key itself (the autocomplete closing its list) keeps it.
    if (event.defaultPrevented) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  const material = control("material");
  const quantity = control("quantity", t.quantityHint);
  const unit = control("unit");
  const location = (name: "source" | "destination") => {
    const field = control(name);
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={field.props.id}>{t[name]}</Label>
        <NativeSelect className="w-full" value={values[name]} onChange={(event) => set({ [name]: event.target.value })} {...field.props}>
          <NativeSelectOption value="" disabled>
            {t.choose}
          </NativeSelectOption>
          {locations.map((choice) => (
            <NativeSelectOption key={choice.value} value={choice.value}>
              {choice.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {field.node}
      </div>
    );
  };
  const date = (name: "plannedDispatch" | "plannedArrival") => {
    const field = control(name);
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={field.props.id}>{t[name]}</Label>
        <Input type="date" value={values[name]} onChange={(event) => set({ [name]: event.target.value })} {...field.props} />
        {field.node}
      </div>
    );
  };

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={material.props.id}>{t.material}</Label>
        <Autocomplete
          id={material.props.id}
          name={material.props.name}
          options={materials}
          value={values.material}
          onChange={(value) => set({ material: value, unit: materials.find((choice) => choice.value === value)?.units[0] ?? "" })}
          labels={labels.picker.labels}
          locale={locale}
          placeholder={labels.picker.placeholder}
          aria-invalid={material.props["aria-invalid"]}
          aria-describedby={material.props["aria-describedby"]}
        />
        {material.node}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {location("source")}
        {location("destination")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={quantity.props.id}>{t.quantity}</Label>
          <Input inputMode="decimal" value={values.quantity} onChange={(event) => set({ quantity: event.target.value })} {...quantity.props} />
          {quantity.node}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={unit.props.id}>{t.unit}</Label>
          <NativeSelect className="w-full" value={values.unit} onChange={(event) => set({ unit: event.target.value })} {...unit.props}>
            {units.map((choice) => (
              <NativeSelectOption key={choice} value={choice}>
                {choice}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {unit.node}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {date("plannedDispatch")}
        {date("plannedArrival")}
      </div>
      {formError && <ErrorMessage>{formError}</ErrorMessage>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {labels.cancel}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? labels.create.submitting : labels.create.submit}
        </Button>
      </div>
    </form>
  );
}
