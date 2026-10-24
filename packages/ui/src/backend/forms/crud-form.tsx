"use client";

import { CircleAlert } from "lucide-react";
import { useId, useState, useTransition, type ChangeEvent, type FormEvent, type ReactNode, type KeyboardEvent } from "react";
import { Button } from "../../components/button";
import { Input } from "../../components/input";
import { Label } from "../../components/label";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "../../components/native-select";
import type { ApiResult, FieldErrors } from "../api/result";
import { ErrorMessage } from "../feedback/error-message";
import { Autocomplete, type AutocompleteLabels, type AutocompleteOption } from "./autocomplete";

/** One choice of a select; a disabled one says why in its label ("box (already converted)"). */
export interface CrudOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface CrudField {
  name: string;
  label: string;
  /**
   * `select` offers `options` (or `groups`) in a native select (its keyboard and screen-reader
   * behaviour for free); `autocomplete` offers `choices` in an `Autocomplete`, for lists too long for
   * a select; `date` is the browser's date input, whose value is an ISO `YYYY-MM-DD` date.
   */
  type?: "text" | "password" | "select" | "autocomplete" | "date";
  autoComplete?: string;
  /** A hint under the field, such as a length rule. */
  description?: string;
  /** A select's choices, in order. */
  options?: CrudOption[];
  /** A select's choices in labelled `<optgroup>`s, after any `options` (units by dimension, #217). */
  groups?: { label: string; options: CrudOption[] }[];
  /** A select's unselectable first entry, shown while nothing is chosen ("Choose a type"); an autocomplete's placeholder. */
  placeholder?: string;
  /** An autocomplete's choices and words. */
  choices?: AutocompleteOption[];
  autocompleteLabels?: AutocompleteLabels;
}

/**
 * What the form needs from a schema: Zod's `safeParse`, typed structurally so `ui` doesn't depend
 * on `zod` or `core`. Pass the same schema the server action parses with.
 */
export interface FormSchema {
  safeParse(data: unknown):
    | { success: true }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

export interface CrudFormProps<T> {
  fields: CrudField[];
  /** What the fields start with, such as the record an edit form changes; others start empty. */
  initialValues?: Record<string, string>;
  schema?: FormSchema;
  /** Usually a server action bound to the record; receives the field values by name. */
  action: (values: Record<string, string>) => Promise<ApiResult<T>>;
  submitLabel: string;
  pendingLabel?: string;
  onSuccess?: (data: T) => void;
  /** Shows a Cancel button; `Escape` calls it too. */
  onCancel?: () => void;
  cancelLabel?: string;
  /** Turns an error the form shows above its buttons into the reader's language. */
  formatError?: (error: { code: string; message: string; params?: Record<string, string> }) => ReactNode;
  /** Turns a field message (from the schema or the server) into the reader's language. */
  formatFieldError?: (message: string) => string;
  /** The reader's language, for an autocomplete's plural forms. */
  locale?: string;
}

/**
 * Every create/edit form: one input per field, client-side checks with the shared schema, server
 * field errors under the matching field and other errors above the buttons, a pending state,
 * `Cmd/Ctrl+Enter` to submit and `Escape` to cancel.
 */
export function CrudForm<T>({
  fields,
  initialValues = {},
  schema,
  action,
  submitLabel,
  pendingLabel = "Saving…",
  onSuccess,
  onCancel,
  cancelLabel = "Cancel",
  formatError = ({ message }) => message,
  formatFieldError = (message) => message,
  locale,
}: CrudFormProps<T>) {
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.name, initialValues[field.name] ?? ""])),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<ReactNode>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = schema?.safeParse(values);
    if (parsed && !parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error.issues));
      setFormError(null);
      return;
    }
    startTransition(async () => {
      const result = await action(values);
      // Updates after an await leave the transition unless wrapped again; wrapped, the errors and
      // the end of the pending state render together.
      startTransition(() => {
        if (result.ok) {
          setFieldErrors({});
          setFormError(null);
          onSuccess?.(result.data);
          return;
        }
        const { fieldErrors: serverFieldErrors } = result.error;
        const named = Object.keys(serverFieldErrors ?? {}).some((name) => fields.some((field) => field.name === name));
        setFieldErrors(serverFieldErrors ?? {});
        setFormError(named ? null : formatError(result.error));
      });
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    // A control that handled the key itself (an autocomplete closing its list) keeps it.
    if (event.defaultPrevented) return;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    } else if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} noValidate className="flex flex-col gap-4">
      {fields.map((field) => {
        const inputId = `${id}-${field.name}`;
        const errors = fieldErrors[field.name];
        const hintId = `${inputId}-hint`;
        const set = (value: string) => setValues((current) => ({ ...current, [field.name]: value }));
        const control = {
          id: inputId,
          name: field.name,
          value: values[field.name],
          onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(event.target.value),
          "aria-invalid": errors ? true : undefined,
          "aria-describedby": errors || field.description ? hintId : undefined,
        };
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={inputId}>{field.label}</Label>
            {field.type === "select" ? (
              <NativeSelect className="w-full" {...control}>
                {field.placeholder !== undefined && (
                  <NativeSelectOption value="" disabled>
                    {field.placeholder}
                  </NativeSelectOption>
                )}
                {field.options?.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </NativeSelectOption>
                ))}
                {field.groups?.map((group) => (
                  <NativeSelectOptGroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <NativeSelectOption key={option.value} value={option.value} disabled={option.disabled}>
                        {option.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelectOptGroup>
                ))}
              </NativeSelect>
            ) : field.type === "autocomplete" ? (
              <Autocomplete
                id={inputId}
                name={field.name}
                options={field.choices ?? []}
                value={values[field.name]}
                onChange={set}
                labels={field.autocompleteLabels!}
                locale={locale}
                placeholder={field.placeholder}
                aria-invalid={control["aria-invalid"]}
                aria-describedby={control["aria-describedby"]}
              />
            ) : (
              <Input {...control} type={field.type ?? "text"} autoComplete={field.autoComplete} />
            )}
            {errors ? (
              <p id={hintId} className="flex gap-1 text-sm text-danger">
                <span className="flex h-5 shrink-0 items-center">
                  <CircleAlert aria-hidden="true" className="size-3.5" />
                </span>
                {formatFieldError(errors[0])}
              </p>
            ) : (
              field.description && (
                <p id={hintId} className="text-xs text-muted-foreground">
                  {field.description}
                </p>
              )
            )}
          </div>
        );
      })}
      {formError && <ErrorMessage>{formError}</ErrorMessage>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}

/**
 * A schema's issues as the field errors a form shows: the first message per field, keyed by its full
 * path (`components.0.unit`, `description`), as the server keys them. An issue about the whole input
 * has no field and is dropped: the server reports it.
 */
export function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const { path, message } of issues) {
    const name = path.map(String).join(".");
    if (name) errors[name] ??= [message];
  }
  return errors;
}
