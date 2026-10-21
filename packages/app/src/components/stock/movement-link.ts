/** A stable detail link works even when the movement is older than the first ledger page. */
export function movementHref(tenant: string, pair: { material: string; location: string }, movement: string): string {
  return `/admin/${tenant}/stock?${new URLSearchParams({ material: pair.material, location: pair.location, movement })}`;
}
