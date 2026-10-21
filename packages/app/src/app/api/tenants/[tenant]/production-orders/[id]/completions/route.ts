import { apiActor, parseInput, tenantScope } from "@cpg/core";
import {
  productionCompletionCreateSchema,
  productionCompletionListSchema,
} from "@cpg/core/validators/production-orders/production-completion.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../../auth/api-write";
import { requireApiUser } from "../../../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/production-orders/[id]/completions">;

/** A page of the order's completions, newest first, each with its expected, actual and variance lines. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { tenant, id } = await params;
  const { page } = parseInput(productionCompletionListSchema, Object.fromEntries(new URL(request.url).searchParams));
  return (await tenantScope(tenant)).cradle.productionCompletionService.list(id, page);
});

/** Posts a completion: the output and every material used, atomically (E10-S02). */
export const POST = tenantApiWrite(async ({ caller, body, context, cradle }: WriteContext<Context>) =>
  cradle.productionCompletionService.post((await context.params).id, parseInput(productionCompletionCreateSchema, body), apiActor(caller)),
);
