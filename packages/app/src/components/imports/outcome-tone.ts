import type { ImportRowOutcome } from "@cpg/core";
import { CircleCheck, CirclePlus, Equal, PenLine } from "lucide-react";
import type { StatusToneSpec } from "../document-lifecycle/status-tone";

/**
 * How an import row's outcome renders in a `StatusBadge`. A dry run's outcomes are what a commit would
 * do, so they stay quiet and differ by icon; a committed row is done, so it reads success (the token
 * table's "import OK"). Rows left unchanged are never listed as committed results.
 */
export const IMPORT_PREVIEW_TONES = {
  create: { tone: "neutral", icon: CirclePlus },
  update: { tone: "neutral", icon: PenLine },
  unchanged: { tone: "neutral", icon: Equal },
} as const satisfies Record<ImportRowOutcome["action"], StatusToneSpec>;

export const IMPORT_RESULT_TONE = { tone: "success", icon: CircleCheck } as const satisfies StatusToneSpec;

export const importPreviewTone = (action: ImportRowOutcome["action"]): StatusToneSpec => IMPORT_PREVIEW_TONES[action];
