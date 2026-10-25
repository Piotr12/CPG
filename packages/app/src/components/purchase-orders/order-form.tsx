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
import type { MaterialPick } from "../purchase-requisitions/choices";
import type { RequisitionChoice } from "./choices";
import { errorFormatter, fieldErrorFormatter, fill, type OrdersLabels } from "./labels";

/** One line as the form holds it, typed text only. */
export interface OrderLineValues {
  material: string;
  quantity: string;
  unit: string;
  plannedDate: string;
  /** A requisition's ID, or "" for none. */
  requisition: string;
}

/** The order as the form holds it and sends it; the server action parses it with the shared schema. */
export interface OrderValues {
  supplier: string;
  location: string;
  lines: OrderLineValues[];
}

export interface OrderFormProps<T> {
  labels: OrdersLabels;
  /** The suppliers and locations the header's autocompletes offer (#222). */
  suppliers: AutocompleteOption[];
  locations: AutocompleteOption[];
  /** The materials each line's autocomplete offers (#217). */
  materials: MaterialPick[];
  requisitions: RequisitionChoice[];
  /** The reader's language, for the autocompletes' counts. */
  locale: string;
  schema: FormSchema;
  action: (values: OrderValues) => Promise<ApiResult<T>>;
  onSuccess: (data: T) => void;
  onCancel: () => void;
}

const EMPTY_LINE: OrderLineValues = { material: "", quantity: "", unit: "", plannedDate: "", requisition: "" };
const LINE_FIELDS = ["material", "quantity", "unit", "plannedDate", "requisition", "location"];

/**
 * The Create purchase order form (spec Q13): a supplier, a location and a variable list of lines,
 * each with its material (chosen in an autocomplete, #217), quantity and unit, planned date and, optionally, the open requisition of
 * the same material and location it converts. Not a `CrudForm`, which holds one string per field,
 * but it keeps its conventions: client-side checks with the shared schema, server field errors under
 * the field they name (`lines.2.unit` under line 3's unit), other errors above the buttons, a
 * pending state, `Cmd/Ctrl+Enter` to submit and `Escape` to cancel.
 */
export function OrderForm<T>({ labels, suppliers, locations, materials, requisitions, locale, schema, action, onSuccess, onCancel }: OrderFormProps<T>) {
  const id = useId();
  const t = labels.form;
  const [values, setValues] = useState<OrderValues>({ supplier: "", location: "", lines: [EMPTY_LINE] });
  // React keys for the lines, so removing one doesn't move another's typed text.
  const [keys, setKeys] = useState([0]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formatError = errorFormatter(labels);
  const { control, note } = fieldControls(id, fieldErrors, fieldErrorFormatter(labels));

  /** The requisitions a line of `material` may convert in an order for `location`. */
  const matching = (material: string, location: string) =>
    requisitions.filter((choice) => choice.material === material && choice.location === location);
  const unitsOf = (material: string) => materials.find(({ value }) => value === material)?.units ?? [];
  const setLine = (index: number, changes: Partial<OrderLineValues>) =>
    setValues((current) => ({ ...current, lines: current.lines.map((line, at) => (at === index ? { ...line, ...changes } : line)) }));

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
        const shown = new Set([
          "supplier",
          "location",
          "lines",
          ...values.lines.flatMap((_, index) => LINE_FIELDS.map((field) => `lines.${index}.${field}`)),
        ]);
        setFieldErrors(errors);
        setFormError(Object.keys(errors).some((name) => shown.has(name)) ? null : formatError(result.error));
      });
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    // A control that handled the key itself (an autocomplete closing its list) keeps it.
    if (event.defaultPrevented) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  const supplier = control("supplier", t.supplierHint);
  const location = control("location", t.locationHint);
  const linesNote = note("lines");

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label id={`${supplier.props.id}-label`} htmlFor={supplier.props.id}>
            {t.supplier}
          </Label>
          <Autocomplete
            id={supplier.props.id}
            aria-labelledby={`${supplier.props.id}-label`}
            name={supplier.props.name}
            options={suppliers}
            value={values.supplier}
            onChange={(value) => setValues((current) => ({ ...current, supplier: value }))}
            labels={labels.supplierPicker.labels}
            locale={locale}
            placeholder={labels.supplierPicker.placeholder}
            aria-invalid={supplier.props["aria-invalid"]}
            aria-describedby={supplier.props["aria-describedby"]}
          />
          {supplier.node}
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
            onChange={(value) =>
              // A requisition of another location can't be converted here. Each requisition has one location and the
              // autocomplete only reports a different value, so no line's requisition matches any more: clear them all.
              setValues((current) => ({ ...current, location: value, lines: current.lines.map((line) => ({ ...line, requisition: "" })) }))
            }
            labels={labels.locationPicker.labels}
            locale={locale}
            placeholder={labels.locationPicker.placeholder}
            aria-invalid={location.props["aria-invalid"]}
            aria-describedby={location.props["aria-describedby"]}
          />
          {location.node}
        </div>
      </div>
      <fieldset className="flex flex-col gap-3" aria-describedby={linesNote.describedBy}>
        <legend className="mb-1 text-sm font-medium">{t.lines}</legend>
        {values.lines.map((line, index) => {
          const number = String(index + 1);
          const lineLabel = (field: string) => `${field}, ${fill(t.line, { number })}`;
          const material = control(`lines.${index}.material`);
          const quantity = control(`lines.${index}.quantity`);
          const unit = control(`lines.${index}.unit`);
          const plannedDate = control(`lines.${index}.plannedDate`);
          const requisition = control(`lines.${index}.requisition`);
          const chosen = materials.find(({ value }) => value === line.material);
          return (
            <div key={keys[index]} className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-start" data-line={index}>
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <Autocomplete
                  id={material.props.id}
                  name={material.props.name}
                  aria-label={lineLabel(t.material)}
                  options={materials}
                  value={line.material}
                  onChange={(value) => setLine(index, { material: value, unit: unitsOf(value)[0] ?? "", requisition: "" })}
                  labels={labels.picker.labels}
                  locale={locale}
                  placeholder={labels.picker.placeholder}
                  aria-invalid={material.props["aria-invalid"]}
                  aria-describedby={material.props["aria-describedby"]}
                />
                {material.node}
              </div>
              <div className="flex flex-col gap-1">
                <Input
                  aria-label={lineLabel(t.quantity)}
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(event) => setLine(index, { quantity: event.target.value })}
                  {...quantity.props}
                />
                {quantity.node}
              </div>
              <div className="flex flex-col gap-1">
                <NativeSelect className="w-full" aria-label={lineLabel(t.unit)} value={line.unit} onChange={(event) => setLine(index, { unit: event.target.value })} {...unit.props}>
                  {unitsOf(line.material).map((choice) => (
                    <NativeSelectOption key={choice} value={choice}>
                      {choice}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {unit.node}
              </div>
              <Button
                type="button"
                variant="outline"
                className="col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto"
                aria-label={chosen ? fill(t.removeLine, { material: `${chosen.code} — ${chosen.name} (${chosen.detail})` }) : t.removeEmpty}
                disabled={isPending}
                onClick={() => {
                  setValues({ ...values, lines: values.lines.filter((_, at) => at !== index) });
                  setKeys(keys.filter((_, at) => at !== index));
                  // Line errors are keyed by position: after a removal they would name the wrong rows.
                  setFieldErrors({});
                }}
              >
                ✕
              </Button>
              <div className="flex flex-col gap-1">
                <Input
                  type="date"
                  aria-label={lineLabel(t.plannedDate)}
                  value={line.plannedDate}
                  onChange={(event) => setLine(index, { plannedDate: event.target.value })}
                  {...plannedDate.props}
                />
                {plannedDate.node}
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <NativeSelect
                  className="w-full"
                  aria-label={lineLabel(t.requisition)}
                  value={line.requisition}
                  onChange={(event) => setLine(index, { requisition: event.target.value })}
                  {...requisition.props}
                >
                  <NativeSelectOption value="">{t.noRequisition}</NativeSelectOption>
                  {matching(line.material, values.location).map((choice) => (
                    <NativeSelectOption key={choice.value} value={choice.value}>
                      {choice.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {requisition.node}
              </div>
            </div>
          );
        })}
        {linesNote.node}
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              setValues({ ...values, lines: [...values.lines, EMPTY_LINE] });
              setKeys([...keys, Math.max(-1, ...keys) + 1]);
            }}
          >
            + {t.addLine}
          </Button>
        </div>
      </fieldset>
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
