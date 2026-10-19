"use client";

import { useId, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "../../components/button";
import { Input } from "../../components/input";
import { Label } from "../../components/label";
import type { ApiResult, FieldErrors } from "../api/result";
import { ErrorMessage } from "../feedback/error-message";

export interface CrudField {
  name: string;
  label: string;
  type?: "text" | "password";
  autoComplete?: string;
  /** A hint under the field, such as a length rule. */
  description?: string;
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
  schema?: FormSchema;
  /** Usually a server action bound to the record; receives the field values by name. */
  action: (values: Record<string, string>) => Promise<ApiResult<T>>;
  submitLabel: string;
  pendingLabel?: string;
  onSuccess?: (data: T) => void;
  /** Shows a Cancel button; `Escape` calls it too. */
  onCancel?: () => void;
}

/**
 * Every create/edit form: one input per field, client-side checks with the shared schema, server
 * field errors under the matching field and other errors above the buttons, a pending state,
 * `Cmd/Ctrl+Enter` to submit and `Escape` to cancel.
 */
export function CrudForm<T>({
  fields,
  schema,
  action,
  submitLabel,
  pendingLabel = "Saving…",
  onSuccess,
  onCancel,
}: CrudFormProps<T>) {
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.name, ""])),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
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
      if (result.ok) {
        setFieldErrors({});
        setFormError(null);
        onSuccess?.(result.data);
        return;
      }
      const { fieldErrors: serverFieldErrors, message } = result.error;
      const named = Object.keys(serverFieldErrors ?? {}).some((name) => fields.some((field) => field.name === name));
      setFieldErrors(serverFieldErrors ?? {});
      setFormError(named ? null : message);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
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
        return (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={inputId}>{field.label}</Label>
            <Input
              id={inputId}
              name={field.name}
              type={field.type ?? "text"}
              autoComplete={field.autoComplete}
              value={values[field.name]}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
              aria-invalid={errors ? true : undefined}
              aria-describedby={errors || field.description ? hintId : undefined}
            />
            {errors ? (
              <p id={hintId} className="text-sm text-destructive">
                {errors[0]}
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
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** The first message per top-level field; issues without a field are dropped (the server reports them). */
function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const { path, message } of issues) {
    const name = String(path[0] ?? "");
    if (name) errors[name] ??= [message];
  }
  return errors;
}
