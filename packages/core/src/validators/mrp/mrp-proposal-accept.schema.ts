import { z } from "zod";

/**
 * The body of `POST /api/tenants/{tenant}/mrp/runs/{run}/proposals/{proposal}/accept`: empty or `{}`.
 * The proposal is named by the path, and `MrpAcceptanceService` answers a malformed one as not found.
 */
export const mrpProposalAcceptSchema = z.strictObject({}).nullable();

/** The MRP page's Accept action: the run and the proposal the dialog opened with. */
export const mrpProposalAcceptActionSchema = z.strictObject({ run: z.string(), proposal: z.string() });
