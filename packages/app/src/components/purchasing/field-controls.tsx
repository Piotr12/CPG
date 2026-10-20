import type { ReactNode } from "react";
import type { FieldErrors } from "@cpg/ui/backend/api/result";

/**
 * What a form needs to show a field's message, or its hint, under its control and tie either to it
 * (`aria-describedby`): shared by the requisition and purchase-order forms. Pure: the caller owns
 * `id` (from `useId`) and the field errors.
 */
export function fieldControls(id: string, fieldErrors: FieldErrors, formatFieldError: (message: string) => string) {
  /** A field's message, or its hint, under it. */
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
    return { node, props: { id: `${id}-${name}`, name, "aria-invalid": fieldErrors[name] ? true : undefined, "aria-describedby": describedBy } };
  };
  return { note, control };
}
