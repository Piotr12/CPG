/**
 * JSON with object keys sorted at every level, so key order never changes a hash of it: an API
 * write's fingerprint, an import's preview token.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? // Code-unit order, never locale order. An object's keys are distinct, so none compare equal.
        Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1)))
      : item,
  );
}
