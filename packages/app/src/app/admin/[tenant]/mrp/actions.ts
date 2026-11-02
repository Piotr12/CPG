"use server";
import { assertSignedIn, tenantServerAction, uiActor, type MrpAcceptanceView, type MrpRunAnswer, type Result } from "@cpg/core";
import { mrpProposalAcceptActionSchema } from "@cpg/core/validators/mrp/mrp-proposal-accept.schema";
import { mrpRunSchema } from "@cpg/core/validators/mrp/mrp-run.schema";
import { currentUser } from "../../../../auth/require-admin";
import { refreshAfterWrite } from "../../../../routing/refresh-after-write";

/**
 * Runs MRP for every location of the bound tenant (E14-S02), in the Run MRP dialog's mode: `{ mode }`, manual
 * when absent (E19-S03). Both roles may; `tenantServerAction` refuses a read-only tenant, the admin included,
 * and a page bound to an older Test generation.
 */
export async function runMrp(tenant: string, generation: number, raw: unknown): Promise<Result<MrpRunAnswer>> {
  const user = await currentUser();
  const result = await tenantServerAction(mrpRunSchema, (input, { cradle }) => cradle.mrpRunService.run(uiActor(assertSignedIn(user)), input ?? {}))(
    tenant,
    generation,
    raw,
  );
  return refreshAfterWrite(result, `/admin/${tenant}/mrp`);
}

/**
 * Accepts one proposal of the latest MRP run in the bound tenant (E19-S01): a Buy proposal becomes an
 * Open purchase requisition and a Make proposal an Open production order (#320), each tagged with the run. Both roles may; `tenantServerAction` refuses a read-only
 * tenant and a page bound to an older Test generation. The page refreshes after a success; a refusal
 * keeps its dialog, which refreshes the page itself when it closes on `MRP_PROPOSAL_ACCEPTED`.
 */
export async function acceptMrpProposal(tenant: string, generation: number, raw: unknown): Promise<Result<MrpAcceptanceView>> {
  const user = await currentUser();
  const result = await tenantServerAction(mrpProposalAcceptActionSchema, ({ run, proposal }, { cradle }) =>
    cradle.mrpAcceptanceService.accept(run, proposal, uiActor(assertSignedIn(user))),
  )(tenant, generation, raw);
  return refreshAfterWrite(result, `/admin/${tenant}/mrp`);
}
