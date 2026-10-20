import { defineEntity, type InferEntity } from "@mikro-orm/core";
import { tenantOwned } from "../tenants/tenant-owned";
import { appendOnlyTriggers, auditEventProperties } from "./audit-event";

const owned = tenantOwned();

/**
 * An entry in one tenant's audit: changes to that tenant's records (R05: Test and Prod share no
 * audit). Tenant-owned, so the tenant filter and guard isolate it like any business record. Rows
 * are only inserted by normal services. Updates always abort; deletion is allowed only for Test,
 * whose atomic reset clears its audit. Prod audit is retained indefinitely.
 */
export const TenantAuditEvent = defineEntity({
  name: "TenantAuditEvent",
  filters: owned.filters,
  properties: { ...auditEventProperties(), tenant: owned.tenant },
  indexes: [{ properties: ["tenant", "occurredAt"] }],
  triggers: appendOnlyTriggers("tenant_audit_event").map((trigger) =>
    trigger.name.endsWith("_no_delete") ? { ...trigger, when: "old.tenant_code <> 'test'" } : trigger,
  ),
});

export type TenantAuditEvent = InferEntity<typeof TenantAuditEvent>;
