import { Location, Material, TenantAuditEvent, type EntityManager } from "@cpg/db";
import { isScopeReadOnly } from "../tenants/tenant.service";

/*
 * What the seeds of rows referencing materials and locations share: when a kind may be seeded, and
 * which referenced records a demo row may use.
 */

/**
 * Whether the scope's tenant may get a kind's demonstration rows: it has none (`rows` is how many
 * it has), nobody ever audited a change to one (`actionPrefix`), and it isn't read-only (R05). Unlike materials,
 * these rows can be removed, so "has none" alone would bring back rows an admin removed (planning
 * spec Q12); the audit remembers every removal.
 */
export async function isUntouchedKind(em: EntityManager, rows: number, actionPrefix: string): Promise<boolean> {
  if (rows > 0) return false;
  if ((await em.count(TenantAuditEvent, { action: { $like: `${actionPrefix}.%` } })) > 0) return false;
  return !(await isScopeReadOnly(em));
}

/**
 * The active materials and locations among `rows`' references, by business ID. A demo row whose
 * material or location is missing or inactive here (an edited Test tenant) is skipped by the seed.
 */
export async function activeDemoReferences(em: EntityManager, rows: readonly { material: string; location: string }[]) {
  const materials = await em.find(Material, { code: { $in: rows.map(({ material }) => material) }, active: true });
  const locations = await em.find(Location, { code: { $in: rows.map(({ location }) => location) }, active: true });
  return {
    material: new Map(materials.map((material) => [material.code, material])),
    location: new Map(locations.map((location) => [location.code, location])),
  };
}
