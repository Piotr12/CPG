import { defineEntity, type InferEntity } from "@mikro-orm/core";
import { tenantOwned } from "../tenants/tenant-owned";
import { appendOnlyTriggers, auditEventProperties } from "./audit-event";

const owned = tenantOwned();

/**
 * An entry in one tenant's audit: changes to that tenant's records (R05: Test and Prod share no
 * audit). Tenant-owned, so the tenant filter and guard isolate it like any business record. Rows
 * are only ever inserted; the triggers abort any update or delete (the Test reset, slice 2, will
 * relax the delete trigger for Test only).
 */
export const TenantAuditEvent = defineEntity({
  name: "TenantAuditEvent",
  filters: owned.filters,
  properties: { ...auditEventProperties(), tenant: owned.tenant },
  indexes: [{ properties: ["tenant", "occurredAt"] }],
  triggers: appendOnlyTriggers("tenant_audit_event"),
});

export type TenantAuditEvent = InferEntity<typeof TenantAuditEvent>;
