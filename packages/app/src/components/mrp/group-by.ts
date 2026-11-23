/**
 * `items` grouped by `key` in one pass, each group keeping the items' order (#391, #397): a table that shows one
 * pair's 90 days, or its proposals, looks each row up here instead of scanning the whole list once per row.
 */
export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): ReadonlyMap<K, readonly T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const value = key(item);
    const group = groups.get(value);
    if (group) group.push(item);
    else groups.set(value, [item]);
  }
  return groups;
}
