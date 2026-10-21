import { ConflictError, ValidationError } from "../../http/errors";

/** A selected target must belong to this aggregate and still be Open; omitted means the document. */
export function selectLifecycleLines<T extends { status: string }, Id extends string | number>(
  lines: readonly T[], selection: readonly Id[] | undefined, identify: (line: T) => Id,
): readonly T[] {
  if (selection === undefined) return lines;
  if (selection.length === 0 || new Set(selection).size !== selection.length) {
    throw new ValidationError({ lines: ["Select each line once, and at least one line."] });
  }
  return selection.map((id) => {
    const line = lines.find((candidate) => identify(candidate) === id);
    if (!line) throw new ValidationError({ lines: ["A selected line does not belong to this document."] });
    if (line.status !== "open") throw new ConflictError("A selected line is no longer open.", "DOCUMENT_NOT_OPEN");
    return line;
  });
}
