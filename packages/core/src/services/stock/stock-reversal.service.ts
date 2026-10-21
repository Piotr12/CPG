import { randomUUID } from "node:crypto";
import { StockMovement, StockReversal, type EntityManager } from "@cpg/db";
import { ConflictError, NotFoundError } from "../../http/errors";
import { parseInput } from "../../http/parse-input";
import { stockMovementIdSchema, stockReversalSchema } from "../../validators/stock/stock-reversal.schema";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit } from "../audit/audit-recorder";
import { isScopeReadOnly } from "../tenants/tenant.service";
import { prepareReceiptReversal } from "../goods-receipts/receipt-reversal";
import { prepareIssueReversal } from "../goods-issues/issue-reversal";
import { CORRECTION_MOVEMENT, postHistoricalInverse, type StockMovementView } from "./stock-posting";

export interface StockReversalView { original: string; movement: StockMovementView }

/** One full inverse, its immutable link, balance and audit commit together. All references are tenant-scoped. */
export class StockReversalService {
  private readonly em: EntityManager;
  constructor({ em }: { em: EntityManager }) { this.em = em; }

  async reverse(id: string, raw: unknown, actor: AuditActor): Promise<StockReversalView> {
    const movementId = parseInput(stockMovementIdSchema, id);
    const { reason } = parseInput(stockReversalSchema, raw);
    return this.em.transactional(async (em) => {
      if (await isScopeReadOnly(em)) throw new ConflictError("This tenant is read-only.", "TENANT_READ_ONLY");
      const original = await em.findOne(StockMovement, movementId, { populate: ["material", "location"], refresh: true });
      if (!original) throw new NotFoundError("STOCK_MOVEMENT_NOT_FOUND", "This movement does not exist in this tenant.");
      const existing = await em.findOne(StockReversal, { original });
      if (existing) throw new ConflictError("This movement has already been reversed.", "STOCK_ALREADY_REVERSED", { reversal: existing.inverse.id });
      let recalculate: (() => Promise<void>) | undefined;
      if (original.type === "goods-receipt") recalculate = await prepareReceiptReversal(em, original, actor);
      else if (original.type === "goods-issue") recalculate = await prepareIssueReversal(em, original, actor);
      else if (original.type !== CORRECTION_MOVEMENT) {
        throw new ConflictError("This posting cannot be reversed with a stock line reversal.", "STOCK_REVERSAL_UNSUPPORTED");
      }
      const movement = await postHistoricalInverse(em, original, reason, randomUUID(), actor);
      const inverse = await em.findOneOrFail(StockMovement, movement.id);
      em.create(StockReversal, { original, inverse });
      await recalculate?.();
      recordTenantAudit(em, actor, {
        action: "stock.movement.reversed",
        subject: { type: "StockMovement", id: original.id, label: `${original.material.code} — ${original.material.description} at ${original.location.code} — ${original.location.name}` },
        before: { reversed: false, quantity: original.quantity, balance: movement.balanceBefore },
        after: { reversed: true, original: original.id, reversal: movement.id, postingId: movement.postingId,
          quantity: movement.quantity, balance: movement.balanceAfter, businessDate: movement.businessDate, reason },
      });
      await em.flush();
      return { original: original.id, movement };
    });
  }
}
