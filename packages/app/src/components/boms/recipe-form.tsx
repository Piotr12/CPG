"use client";

import { CircleAlert } from "lucide-react";
import { useId, useState, useTransition, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { ApiResult, FieldErrors } from "@cpg/ui/backend/api/result";
import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
import { Autocomplete, type AutocompleteOption } from "@cpg/ui/backend/forms/autocomplete";
import { toFieldErrors, type FormSchema } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Input } from "@cpg/ui/components/input";
import { Label } from "@cpg/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import { errorFormatter, fieldErrorFormatter, fill, type BomsLabels } from "./labels";

/** A material a line may pick (#217): its picker option and the units a quantity of it may be entered in, base unit first. */
export interface ComponentChoice extends AutocompleteOption {
  units: string[];
}

/** A material the BOM may make (#217), with the base unit the components heading names; its `name` is the description. */
export interface OutputChoice extends AutocompleteOption {
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
  /** The reader's language, for the material pickers' plural forms. */
  locale: string;
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
 * and a variable list of component lines, each with its own unit choices. Materials are chosen with
 * an `Autocomplete` (#217). Not a `CrudForm`, which holds one string per field, but it keeps its
 * conventions: client-side checks with the shared schema, server field errors under the field they
 * name (`components.2.unit` under line 3's unit), other errors above the buttons, a pending state,
 * `Cmd/Ctrl+Enter` to submit and `Escape` to cancel (unless an open material list claims it).
 */
export function RecipeForm<T>({
  labels,
  outputs,
  output,
  choices,
  locale,
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
  const chosen = outputs?.find(({ value }) => value === values.output);
  const chosenOutput = chosen ? { description: chosen.name, baseUnit: chosen.baseUnit } : output;
  const picker = { options: choices, labels: labels.picker.labels, locale, placeholder: labels.picker.placeholder };

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
        const shown = new Set(["output", "priority", "validFrom", "validThrough", "components", ...lineFields(values.components.length)]);
        setFieldErrors(errors);
        setFormError(Object.keys(errors).some((name) => shown.has(name)) ? null : formatError(result.error));
      });
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    // A control that handled the key itself (a material list closing) keeps it.
    if (event.defaultPrevented) return;
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
          <p id={noteId} className="flex gap-1 text-sm text-danger">
            <span className="flex h-5 shrink-0 items-center">
              <CircleAlert aria-hidden="true" className="size-3.5" />
            </span>
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
    return { node, props: { id: `${id}-${name}`, name, "aria-invalid": fieldErrors[name] ? true : undefined, "aria-describedby": describedBy } };
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
          <Label id={`${outputControl.props.id}-label`} htmlFor={outputControl.props.id}>
            {t.output}
          </Label>
          <Autocomplete
            {...picker}
            {...outputControl.props}
            aria-labelledby={`${outputControl.props.id}-label`}
            options={outputs}
            value={values.output ?? ""}
            onChange={(value) => set({ output: value })}
          />
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
          const chosenLine = choices.find(({ value }) => value === line.material);
          return (
            <div key={keys[index]} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-start" data-line={index}>
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <Autocomplete
                  {...picker}
                  {...material.props}
                  aria-label={lineLabel(t.material)}
                  value={line.material}
                  onChange={(value) => setLine(index, { material: value, unit: unitsOf(value)[0] ?? "" })}
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
                aria-label={chosenLine ? fill(t.removeComponent, { material: `${chosenLine.code} — ${chosenLine.name}` }) : t.removeEmpty}
                disabled={isPending}
                onClick={() => {
                  set({ components: values.components.filter((_, at) => at !== index) });
                  setKeys(keys.filter((_, at) => at !== index));
                  // Line errors are keyed by position: after a removal they would name the wrong rows.
                  setFieldErrors({});
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
            disabled={isPending}
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

/** The field names of `count` lines, as the form shows their errors: `components.0.material`, … */
function lineFields(count: number): string[] {
  return Array.from({ length: count }, (_, index) => ["material", "quantity", "unit"].map((field) => `components.${index}.${field}`)).flat();
}
