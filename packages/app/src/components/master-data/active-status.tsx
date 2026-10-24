import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import { masterDataStatusTone } from "../document-lifecycle/status-tone";

/** A master record's Active or Inactive state, from the status tone map: both quiet, Inactive dashed. */
export function ActiveStatus({ active, labels }: { active: boolean; labels: { active: string; inactive: string } }) {
  return <StatusBadge {...masterDataStatusTone(active)}>{active ? labels.active : labels.inactive}</StatusBadge>;
}

/** The Inactive mark beside a referenced record's ID; an active one shows none. */
export function InactiveMark({ active, label }: { active: boolean; label: string }) {
  return active ? null : <StatusBadge {...masterDataStatusTone(false)}>{label}</StatusBadge>;
}
