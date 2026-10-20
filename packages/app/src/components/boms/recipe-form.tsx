"use client";

import { useId, useState, useTransition, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { ApiResult, FieldErrors } from "@cpg/ui/backend/api/result";
import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
import type { FormSchema } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Input } from "@cpg/ui/components/input";
import { Label } from "@cpg/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import { errorFormatter, fieldErrorFormatter, fill, type BomsLabels } from "./labels";

/** A material a line may pick: its label and the units a quantity of it may be entered in, base unit first. */
export interface ComponentChoice {
  value: string;
  label: string;
  units: string[];
}

/** A material the BOM may make, with what the components heading says about it. */
export interface OutputChoice {
  value: string;
  label: string;
  description: string;
  baseUnit: string;
}

/** One line as the form holds it, typed text only. */
export interface LineValues {
  material: string;
  quantity: string;
  unit: string;
}

/** The recipe as the form holds it and sends it; the server action parses it with the shared schema. */
export interface RecipeValues {
  output?: string;
  priority: string;
  validFrom: string;
  validThrough: string;
  components: LineValues[];
}

export interface RecipeFormProps<T> {
  labels: BomsLabels;
  /** The Create BOM form's output choices; an edit leaves this out and names its output in `output`. */
  outputs?: OutputChoice[];
  /** An edit's fixed output. */
  output?: { description: string; baseUnit: string };
  choices: ComponentChoice[];
  /** What the form starts with: an edit's current revision as entered. */
  initial?: RecipeValues;
  schema: FormSchema;
  action: (values: RecipeValues) => Promise<ApiResult<T>>;
  submitLabel: string;
  pendingLabel: string;
  onSuccess: (data: T) => void;
  onCancel: () => void;
}

const EMPTY_LINE: LineValues = { material: "", quantity: "", unit: "" };

/**
 * The create and edit form of a BOM's recipe (spec Q12): the output (on create), priority, validity,
 * and a variable list of component lines, each with its own unit choices. Not a `CrudForm`, which
 * holds one string per field, but it keeps its conventions: client-side checks with the shared
 * schema, server field errors under the field they name (`components.2.unit` under line 3's unit),
 * other errors above the buttons, a pending state, `Cmd/Ctrl+Enter` to submit and `Escape` to cancel.
 */
export function RecipeForm<T>({
  labels,
  outputs,
  output,
  choices,
  initial,
  schema,
  action,
  submitLabel,
  pendingLabel,
  onSuccess,
  onCancel,
}: RecipeFormProps<T>) {
  const id = useId();
  const t = labels.form;
  const [values, setValues] = useState<RecipeValues>(
    () => initial ?? { output: "", priority: "", validFrom: "", validThrough: "", components: [EMPTY_LINE] },
  );
  // React keys for the lines, so removing one doesn't move another's typed text.
  const [keys, setKeys] = useState(() => values.components.map((_, index) => index));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formatError = errorFormatter(labels);
  const formatFieldError = fieldErrorFormatter(labels);
  // An edit keeps a line's entered unit even when its conversion was removed since (spec Q12).
  const keptUnits = new Map((initial?.components ?? []).map(({ material, unit }) => [material, unit]));
  const chosenOutput = outputs?.find(({ value }) => value === values.output) ?? output;

  const set = (changes: Partial<RecipeValues>) => setValues((current) => ({ ...current, ...changes }));
  const setLine = (index: number, changes: Partial<LineValues>) =>
    set({ components: values.components.map((line, at) => (at === index ? { ...line, ...changes } : line)) });
  const unitsOf = (material: string) => {
    const units = choices.find(({ value }) => value === material)?.units ?? [];
    const kept = keptUnits.get(material);
    return kept && !units.includes(kept) ? [...units, kept] : units;
  };

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
        setFormError(Object.keys(errors).some(isShownField) ? null : formatError(result.error));
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

  /** A field's message, or its hint, under it; `describedBy` ties either to the control. */
  const note = (name: string, hint?: string): { node: ReactNode; describedBy?: string } => {
    const noteId = `${id}-${name}-note`;
    const errors = fieldErrors[name];
    if (errors) {
      return {
        node: (
          <p id={noteId} className="text-sm text-destructive">
            {formatFieldError(errors[0])}
          </p>
        ),
        describedBy: noteId,
      };
    }
    if (!hint) return { node: null };
    return {
      node: (
        <p id={noteId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ),
      describedBy: noteId,
    };
  };
  const control = (name: string, hint?: string) => {
    const { node, describedBy } = note(name, hint);
    return { node, props: { id: `${id}-${name}`, "aria-invalid": fieldErrors[name] ? true : undefined, "aria-describedby": describedBy } };
  };

  const priority = control("priority", t.priorityHint);
  const validFrom = control("validFrom");
  const validThrough = control("validThrough", t.validHint);
  const outputControl = control("output", t.outputHint);
  const componentsNote = note("components");

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} noValidate className="flex flex-col gap-4">
      {outputs && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={outputControl.props.id}>{t.output}</Label>
          <NativeSelect className="w-full" value={values.output} onChange={(event) => set({ output: event.target.value })} {...outputControl.props}>
            <NativeSelectOption value="" disabled>
              {t.choose}
            </NativeSelectOption>
            {outputs.map((choice) => (
              <NativeSelectOption key={choice.value} value={choice.value}>
                {choice.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {outputControl.node}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={priority.props.id}>{t.priority}</Label>
          <Input inputMode="numeric" value={values.priority} onChange={(event) => set({ priority: event.target.value })} {...priority.props} />
          {priority.node}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={validFrom.props.id}>{t.validFrom}</Label>
          <Input type="date" value={values.validFrom} onChange={(event) => set({ validFrom: event.target.value })} {...validFrom.props} />
          {validFrom.node}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={validThrough.props.id}>{t.validThrough}</Label>
          <Input type="date" value={values.validThrough} onChange={(event) => set({ validThrough: event.target.value })} {...validThrough.props} />
          {validThrough.node}
        </div>
      </div>
      <fieldset className="flex flex-col gap-3" aria-describedby={componentsNote.describedBy}>
        <legend className="mb-1 text-sm font-medium">
          {t.components}
          <span className="ml-2 font-normal text-muted-foreground">
            {chosenOutput ? fill(t.componentsPer, { baseUnit: chosenOutput.baseUnit, output: chosenOutput.description }) : t.componentsPerAny}
          </span>
        </legend>
        {values.components.map((line, index) => {
          const number = String(index + 1);
          const lineLabel = (field: string) => `${field}, ${fill(t.line, { number })}`;
          const material = control(`components.${index}.material`);
          const quantity = control(`components.${index}.quantity`);
          const unit = control(`components.${index}.unit`);
          const chosen = choices.find(({ value }) => value === line.material);
          return (
            <div key={keys[index]} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-start" data-line={index}>
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <NativeSelect
                  className="w-full"
                  aria-label={lineLabel(t.material)}
                  value={line.material}
                  onChange={(event) => setLine(index, { material: event.target.value, unit: unitsOf(event.target.value)[0] ?? "" })}
                  {...material.props}
                >
                  <NativeSelectOption value="" disabled>
                    {t.choose}
                  </NativeSelectOption>
                  {choices.map((choice) => (
                    <NativeSelectOption key={choice.value} value={choice.value}>
                      {choice.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
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
                aria-label={chosen ? fill(t.removeComponent, { material: chosen.label }) : t.removeEmpty}
                onClick={() => {
                  set({ components: values.components.filter((_, at) => at !== index) });
                  setKeys(keys.filter((_, at) => at !== index));
                }}
              >
                ✕
              </Button>
            </div>
          );
        })}
        {componentsNote.node}
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              set({ components: [...values.components, EMPTY_LINE] });
              setKeys([...keys, Math.max(-1, ...keys) + 1]);
            }}
          >
            + {t.addComponent}
          </Button>
        </div>
      </fieldset>
      {formError && <ErrorMessage>{formError}</ErrorMessage>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {labels.cancel}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Whether the form shows a field error under `name`: its own fields, any line's fields, or the list. */
function isShownField(name: string): boolean {
  return /^(output|priority|validFrom|validThrough|components)$|^components\.\d+\.(material|quantity|unit)$/.test(name);
}

/** The first message per field, keyed by its full path (`components.0.unit`), as the server keys them. */
function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const { path, message } of issues) {
    const name = path.map(String).join(".");
    if (name) errors[name] ??= [message];
  }
  return errors;
}
