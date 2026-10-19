import type { Messages } from "../../i18n/messages/en";
import type { ReadOnlyControlsLabels } from "./read-only-controls";

/** The Read-only card's strings for one tenant, filled in on the server: client props are plain strings. */
export function readOnlyControlsLabels(messages: Messages, name: string): ReadOnlyControlsLabels {
  const t = messages.admin.readOnly;
  const filled = (change: typeof t.makeReadOnly) => ({
    open: change.open(name),
    title: change.title(name),
    description: change.description(name),
    confirm: change.confirm,
  });
  return {
    makeReadOnly: filled(t.makeReadOnly),
    makeWritable: filled(t.makeWritable),
    cancel: t.cancel,
    errors: { ...messages.errors, ...t.errors },
  };
}
