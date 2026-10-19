import { entities, GLOBAL_ENTITIES } from "@cpg/db";
import { describe, expect, it } from "vitest";

// Tenant isolation is the default (spec .ai/specs/2026-10-19--0913UTC-test-prod-tenants.md): an
// entity is either declared with tenantOwned() or explicitly listed as global.
describe("entity tenant ownership", () => {
  const global = new Set<unknown>(GLOBAL_ENTITIES);

  it.each(entities.map((entity) => [entity.meta.className, entity]))(
    "%s is tenant-owned or listed in GLOBAL_ENTITIES",
    (_name, entity) => {
      const tenantOwned = Boolean(entity.meta.filters?.tenant) && "tenant" in entity.meta.properties;
      expect(tenantOwned || global.has(entity)).toBe(true);
      expect(tenantOwned && global.has(entity)).toBe(false);
    },
  );
});
