import { apiActor, parseInput } from "@cpg/core";
import { stockCorrectionSchema } from "@cpg/core/validators/stock/stock-correction.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../auth/api-write";

/** Both roles post corrections; the shared gate enforces bearer/key/generation/read-only atomically. */
export const POST = tenantApiWrite(async ({ caller, body, cradle }: WriteContext<RouteContext<"/api/tenants/[tenant]/stock/corrections">>) =>
  cradle.stockService.correct(parseInput(stockCorrectionSchema, body), apiActor(caller)),
);
