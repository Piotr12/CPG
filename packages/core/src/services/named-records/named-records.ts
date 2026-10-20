import {
  OptimisticLockError,
  UniqueConstraintViolationException,
  type EntityManager,
  type NamedRecord,
} from "@cpg/db";
import { nextSequentialId } from "../../domain/business-ids/sequential-id";
import { ConflictError, versionConflict } from "../../http/errors";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit, type AuditEntry } from "../audit/audit-recorder";
import { isScopeReadOnly } from "../tenants/tenant.service";
import { findNamedRecord, type NamedRecordLookup } from "./find-named-record";

/** What the screens and the API show about a location, customer or supplier. `id` is its business ID. */
export interface NamedRecordView {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
  /** The optimistic-lock version an edit must carry back (AUD-024, API-029). */
  version: number;
}

/** The fields an edit may set; absent ones stay as they are. */
export interface NamedRecordChanges {
  name?: string;
  active?: boolean;
}

/** One kind of named record: everything that differs between locations, customers and suppliers. */
export interface NamedRecordKind extends NamedRecordLookup {
  /** The audit subject type: `"Location"`. */
  subjectType: string;
  /** The audit action prefix, `concept.entity`: `"locations.location"`. */
  actionPrefix: string;
  /** The names a fresh Test tenant starts with (D06). */
  demoNames: readonly string[];
  beforeDeactivate?: (em: EntityManager, record: NamedRecord) => Promise<void>;
}

/**
 * The rules shared by locations, customers and suppliers (E03-S02), for one kind, in one tenant's
 * EntityManager: every read and write is that tenant's only (R05). A new record takes the kind's
 * highest ID + 1 in the tenant (spec Q2). Every change records its tenant audit entry in the same
 * transaction (R08), and an edit carries the version the caller loaded (`VERSION_CONFLICT`
 * otherwise). Nothing is ever deleted. Each kind's service holds one and delegates to it (spec Q9);
 * the admin check is the caller's (`assertAdmin`).
 */
export class NamedRecords {
  constructor(
    private readonly em: EntityManager,
    private readonly kind: NamedRecordKind,
  ) {}

  /** Every record of the kind, by ID, inactive ones included. */
  async list(): Promise<NamedRecordView[]> {
    return (await this.em.find(this.kind.entity, {}, { orderBy: { code: "asc" } })).map(toView);
  }

  /** One record; `{KIND}_NOT_FOUND` when this tenant has no such ID, another tenant's included (TEN-014). */
  async get(id: string): Promise<NamedRecordView> {
    return toView(await findNamedRecord(this.em, this.kind, id));
  }

  /** A new active record with the kind's next ID in this tenant. */
  async create({ name }: { name: string }, actor: AuditActor): Promise<NamedRecordView> {
    try {
      return await this.em.transactional(async (em) => {
        const record = await this.insert(em, name.trim());
        recordTenantAudit(em, actor, this.entry("created", record, null, snapshot(record)));
        await em.flush();
        return toView(record);
      });
    } catch (error) {
      // A racing create on another connection normally surfaces as a stale snapshot, which the
      // request wrappers retry; the unique index only catches what slips past that.
      if (error instanceof UniqueConstraintViolationException) {
        throw new ConflictError(`Another ${this.kind.noun} was created at the same moment. Try again.`);
      }
      throw error;
    }
  }

  /**
   * Renames and/or (de)activates at `version`. A field counts only when it differs from the stored
   * value, a name once trimmed (whatever the caller sent); with nothing changed, nothing is written
   * or recorded. A rename is `{prefix}.updated` with
   * the name before and after, a flag change `{prefix}.deactivated` or `.reactivated` (AUD-003).
   */
  async update(id: string, changes: NamedRecordChanges, version: number, actor: AuditActor): Promise<NamedRecordView> {
    try {
      return await this.em.transactional(async (em) => {
        const record = await findNamedRecord(em, this.kind, id, { refresh: true });
        if (record.version !== version) throw versionConflict();
        const name = changes.name?.trim();
        if (name !== undefined && name !== record.name) {
          const before = record.name;
          record.name = name;
          recordTenantAudit(em, actor, this.entry("updated", record, { name: before }, { name: record.name }));
        }
        if (changes.active !== undefined && changes.active !== record.active) {
          if (!changes.active) await this.kind.beforeDeactivate?.(em, record);
          record.active = changes.active;
          const action = changes.active ? "reactivated" : "deactivated";
          recordTenantAudit(em, actor, this.entry(action, record, { active: !changes.active }, { active: changes.active }));
        }
        await em.flush();
        return toView(record);
      });
    } catch (error) {
      // A write landing between the version check and the flush fails the flush's own check.
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }

  /**
   * Creates the kind's demonstration records (D06) when the tenant has none of the kind, and returns
   * how many. Not audited, like the demo materials (spec Q8). Each is flushed before the next reads
   * the highest ID, so they get consecutive IDs. Seeds nothing into a read-only tenant (R05): its
   * flag is read in the seed's own transaction.
   */
  async seedDemo(): Promise<number> {
    return this.em.transactional(async (em) => {
      if ((await em.count(this.kind.entity, {})) > 0 || (await isScopeReadOnly(em))) return 0;
      for (const name of this.kind.demoNames) {
        await this.insert(em, name);
        await em.flush();
      }
      return this.kind.demoNames.length;
    });
  }

  /** Creates (unflushed) a record with the ID after the kind's highest in this tenant. */
  private async insert(em: EntityManager, name: string): Promise<NamedRecord> {
    const [highest] = await em.find(this.kind.entity, {}, { orderBy: { code: "desc" }, limit: 1 });
    const code = nextSequentialId(highest?.code ?? null, {
      code: `${this.kind.codePrefix}_IDS_EXHAUSTED`,
      message: `This tenant has used every eight-digit ${this.kind.noun} ID.`,
    });
    return em.create(this.kind.entity, { code, name });
  }

  private entry(action: string, record: NamedRecord, before: AuditEntry["before"], after: AuditEntry["after"]): AuditEntry {
    const subject = { type: this.kind.subjectType, id: record.code, label: `${record.code} — ${record.name}` };
    return { action: `${this.kind.actionPrefix}.${action}`, subject, before, after };
  }
}

/** The fields of a record the audit may show: an allowlist (R08). */
function snapshot({ code, name, active }: NamedRecord) {
  return { id: code, name, active };
}

function toView({ code, name, active, createdAt, version }: NamedRecord): NamedRecordView {
  return { id: code, name, active, createdAt, version };
}
