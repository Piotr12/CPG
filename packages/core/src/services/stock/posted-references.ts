/** How many IDs one lookup names and how many rows it returns: bounded like every list page. */
export const REFERENCE_BATCH = 100;

/**
 * Which of `ids` some immutable posted record (a goods receipt or goods issue line) references. A
 * reversal returns a document line's progress to zero but keeps those records, so they, not the
 * counter, say whether the line was ever posted (#91, #138). `lookup` returns the referenced ID of
 * each record it finds for `batch`, at most `limit` of them. Both the IN list and the results are
 * bounded, and matched IDs leave the batch after each lookup, so many records for one ID can't force
 * a scan of its entire history; never one query per ID.
 */
export async function postedReferences(ids: readonly string[], lookup: (batch: string[], limit: number) => Promise<string[]>): Promise<Set<string>> {
  const posted = new Set<string>();
  for (let start = 0; start < ids.length; start += REFERENCE_BATCH) {
    const remaining = new Set(ids.slice(start, start + REFERENCE_BATCH));
    while (remaining.size > 0) {
      const found = await lookup([...remaining], REFERENCE_BATCH);
      if (found.length === 0) break;
      for (const id of found) {
        posted.add(id);
        remaining.delete(id);
      }
    }
  }
  return posted;
}
