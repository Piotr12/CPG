import { unstable_rethrow } from "next/navigation";
import { createApiHandler } from "@cpg/core";

/**
 * The wrapper for every route handler (`createApiHandler` in `@cpg/core`), letting Next.js's own
 * control-flow errors through: `redirect()`, `notFound()`, and the error that stops a build-time
 * prerender once a handler reads the request. Caught, the last one was logged as "Route handler
 * failed" on every `npm run build`.
 */
export const apiHandler = createApiHandler(unstable_rethrow);
