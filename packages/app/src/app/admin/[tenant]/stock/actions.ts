"use server";
import { assertSignedIn, tenantServerAction, uiActor, type Result, type StockReversalView, type StockMovementView, type StockPair } from "@cpg/core";
import { stockReversalActionSchema } from "@cpg/core/validators/stock/stock-reversal.schema";
import { stockCorrectionSchema } from "@cpg/core/validators/stock/stock-correction.schema";
import { currentUser } from "../../../../auth/require-admin";
import { formValues, refreshAfterWrite } from "../../../../routing/refresh-after-write";

/** The selected pair, tenant and generation are bound by the screen; both roles may post. */
export async function postStockCorrection(tenant: string, generation: number, pair: StockPair, values: unknown): Promise<Result<StockMovementView>> {
  const user = await currentUser();
  const result = await tenantServerAction(stockCorrectionSchema, (input, { cradle }) =>
    cradle.stockService.correct(input, uiActor(assertSignedIn(user))),
  )(tenant, generation, { ...formValues(values), ...pair });
  return refreshAfterWrite(result, `/admin/${tenant}/stock`);
}

/** Bind only the original ID; the service derives the entire inverse and all owning-document changes. */
export async function reverseStockMovement(tenant: string, generation: number, movementId: string, values: unknown): Promise<Result<StockReversalView>> {
  const user = await currentUser();
  const result = await tenantServerAction(stockReversalActionSchema, ({ movementId, ...input }, { cradle }) =>
    cradle.stockReversalService.reverse(movementId, input, uiActor(assertSignedIn(user))),
  )(tenant, generation, { ...formValues(values), movementId });
  return refreshAfterWrite(result, `/admin/${tenant}/stock`, `/admin/${tenant}/purchase-orders`, `/admin/${tenant}/shipments`, `/admin/${tenant}/customer-orders`);
}
