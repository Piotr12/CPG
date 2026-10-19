import { Tenant, type EntityManager } from "@cpg/db";
import { NotFoundError } from "../../http/errors";
import { TENANT_CODES, type TenantCode } from "../../validators/tenants/tenant-code.schema";

/** How a tenant is named on screen; the codes are fixed (N05), so the names live in code. */
export const TENANT_NAMES: Record<TenantCode, string> = { test: "Test", prod: "Prod" };

/** A tenant's metadata, as pages and the API show it (API-034: the generation lives here). */
export interface TenantInfo {
  code: TenantCode;
  name: string;
  generation: number;
}

/** The error for an unknown tenant, whether it came from a URL, an action or the API. */
export const tenantNotFound = () => new NotFoundError("TENANT_NOT_FOUND", "Unknown tenant.");

/** Reads the Test and Prod tenants. They are global records: no tenant scope is needed. */
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
   * The tenant's dataset generation as stored now, bypassing the identity map: a write checks it
   * inside its transaction, and a copy loaded earlier in the request could predate a reset.
   */
  async currentGeneration(code: TenantCode): Promise<number> {
    const tenant = await this.em.findOne(Tenant, { code }, { refresh: true });
    if (!tenant) throw tenantNotFound();
    return tenant.generation;
  }
}

function toInfo({ code, generation }: Tenant): TenantInfo {
  return { code, name: TENANT_NAMES[code], generation };
}
