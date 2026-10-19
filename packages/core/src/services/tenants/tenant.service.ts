import { currentTenant, Tenant, type EntityManager } from "@cpg/db";
import { NotFoundError } from "../../http/errors";
import { TENANT_CODES, type TenantCode } from "../../validators/tenants/tenant-code.schema";
import type { AuditActor } from "../audit/actor";
import { recordGlobalAudit } from "../audit/audit-recorder";

/** How a tenant is named on screen; the codes are fixed (N05), so the names live in code. */
export const TENANT_NAMES: Record<TenantCode, string> = { test: "Test", prod: "Prod" };

/** A tenant's metadata, as pages and the API show it (API-034: the generation lives here). */
export interface TenantInfo {
  code: TenantCode;
  name: string;
  generation: number;
  /** Set by the admin: no business data of this tenant may change (R05). */
  readOnly: boolean;
}

/** What a tenant write checks before it runs: the dataset generation and the read-only flag. */
export interface TenantState {
  generation: number;
  readOnly: boolean;
}

/** The error for an unknown tenant, whether it came from a URL, an action or the API. */
export const tenantNotFound = () => new NotFoundError("TENANT_NOT_FOUND", "Unknown tenant.");

/** Reads the Test and Prod tenants, and sets their read-only flags. They are global records: no tenant scope is needed. */
export class TenantService {
  private readonly em: EntityManager;

  constructor({ em }: { em: EntityManager }) {
    this.em = em;
  }

  /** Both tenants, Test first. */
  async list(): Promise<TenantInfo[]> {
    const order = (code: TenantCode) => TENANT_CODES.indexOf(code);
    return (await this.em.find(Tenant, {})).map(toInfo).sort((a, b) => order(a.code) - order(b.code));
  }

  /** One tenant's metadata; `TENANT_NOT_FOUND` when its row is missing. */
  async get(code: TenantCode): Promise<TenantInfo> {
    const tenant = await this.em.findOne(Tenant, { code });
    if (!tenant) throw tenantNotFound();
    return toInfo(tenant);
  }

  /**
   * The tenant's generation and read-only flag as stored now, bypassing the identity map: a write
   * checks them inside its transaction, and a copy loaded earlier in the request could predate a
   * reset or a flag change.
   */
  async currentState(code: TenantCode): Promise<TenantState> {
    const { generation, readOnly } = await fresh(this.em, code);
    return { generation, readOnly };
  }

  /**
   * Makes a tenant read-only or writable again (R05) and records the change in the Global audit
   * with its before and after value (AUD-016), in one transaction. Sets, never toggles: setting
   * the current value changes and records nothing. Admin only, which the caller checks.
   */
  async setReadOnly(code: TenantCode, readOnly: boolean, actor: AuditActor): Promise<TenantInfo> {
    return this.em.transactional(async (em) => {
      const tenant = await fresh(em, code);
      if (tenant.readOnly === readOnly) return toInfo(tenant);
      const before = { readOnly: tenant.readOnly };
      tenant.readOnly = readOnly;
      recordGlobalAudit(em, actor, {
        action: "tenants.tenant.read-only-changed",
        subject: { type: "Tenant", id: code, label: TENANT_NAMES[code] },
        before,
        after: { readOnly },
      });
      return toInfo(tenant);
    });
  }
}

/**
 * Whether `em`'s own tenant scope is read-only as stored now. For the system writes that don't go
 * through the request wrappers (the demo seeds), inside their own transaction.
 */
export async function isScopeReadOnly(em: EntityManager): Promise<boolean> {
  return (await fresh(em, currentTenant(em)!)).readOnly;
}

/** The tenant row read past the identity map, or `TENANT_NOT_FOUND`. */
async function fresh(em: EntityManager, code: TenantCode): Promise<Tenant> {
  const tenant = await em.findOne(Tenant, { code }, { refresh: true });
  if (!tenant) throw tenantNotFound();
  return tenant;
}

function toInfo({ code, generation, readOnly }: Tenant): TenantInfo {
  return { code, name: TENANT_NAMES[code], generation, readOnly };
}
