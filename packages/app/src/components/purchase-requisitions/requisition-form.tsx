"use client";

import { useId, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import type { ApiResult, FieldErrors } from "@cpg/ui/backend/api/result";
import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
import { Autocomplete, type AutocompleteOption } from "@cpg/ui/backend/forms/autocomplete";
import { toFieldErrors, type FormSchema } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Input } from "@cpg/ui/components/input";
import { Label } from "@cpg/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import { fieldControls } from "../purchasing/field-controls";
import type { MaterialPick } from "./choices";
import { errorFormatter, fieldErrorFormatter, type RequisitionsLabels } from "./labels";

/** A material the form may pick: its label and the units a quantity of it may be entered in, base unit first. */
export interface MaterialChoice {
  value: string;
  label: string;
  units: string[];
}

/** The form's fields as typed text; the server action parses them with the shared schema. */
export interface RequisitionValues {
  material: string;
  location: string;
  quantity: string;
  unit: string;
  requiredDate: string;
}

export interface RequisitionFormProps<T> {
  labels: RequisitionsLabels;
  /** The materials the autocomplete offers (#217). */
  materials: MaterialPick[];
  /** The locations the location autocomplete offers (#222). */
  locations: AutocompleteOption[];
  /** The reader's language, for the autocomplete's counts. */
  locale: string;
  schema: FormSchema;
  action: (values: RequisitionValues) => Promise<ApiResult<T>>;
  onSuccess: (data: T) => void;
  onCancel: () => void;
}

const FIELDS = ["material", "location", "quantity", "unit", "requiredDate"];

/**
 * The Create requisition form (spec Q13): a material, chosen in an autocomplete (#217), and its unit (the units depend on the
 * material, so this is not a `CrudForm`), a location, a quantity and a date. It keeps `CrudForm`'s
 * conventions: client-side checks with the shared schema, server field errors under the field they
 * name, other errors above the buttons, a pending state, `Cmd/Ctrl+Enter` to submit, `Escape` to cancel.
 */
export function RequisitionForm<T>({ labels, materials, locations, locale, schema, action, onSuccess, onCancel }: RequisitionFormProps<T>) {
  const id = useId();
  const t = labels.form;
  const [values, setValues] = useState<RequisitionValues>({ material: "", location: "", quantity: "", unit: "", requiredDate: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formatError = errorFormatter(labels);
  const { control } = fieldControls(id, fieldErrors, fieldErrorFormatter(labels));
  const units = materials.find(({ value }) => value === values.material)?.units ?? [];

  const set = (changes: Partial<RequisitionValues>) => setValues((current) => ({ ...current, ...changes }));

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
  const location = control("location");
  const quantity = control("quantity", t.quantityHint);
  const unit = control("unit");
  const requiredDate = control("requiredDate");

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label id={`${material.props.id}-label`} htmlFor={material.props.id}>
          {t.material}
        </Label>
        <Autocomplete
          id={material.props.id}
          aria-labelledby={`${material.props.id}-label`}
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
      <div className="flex flex-col gap-2">
        <Label id={`${location.props.id}-label`} htmlFor={location.props.id}>
          {t.location}
        </Label>
        <Autocomplete
          id={location.props.id}
          aria-labelledby={`${location.props.id}-label`}
          name={location.props.name}
          options={locations}
          value={values.location}
          onChange={(value) => set({ location: value })}
          labels={labels.locationPicker.labels}
          locale={locale}
          placeholder={labels.locationPicker.placeholder}
          aria-invalid={location.props["aria-invalid"]}
          aria-describedby={location.props["aria-describedby"]}
        />
        {location.node}
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
      <div className="flex flex-col gap-2">
        <Label htmlFor={requiredDate.props.id}>{t.requiredDate}</Label>
        <Input type="date" value={values.requiredDate} onChange={(event) => set({ requiredDate: event.target.value })} {...requiredDate.props} />
        {requiredDate.node}
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
