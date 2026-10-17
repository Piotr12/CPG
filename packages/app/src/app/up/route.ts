import { connection } from "next/server";
import { requestScope } from "@cpg/core";

// Health check used by kamal-proxy before switching traffic. Touches the database, so a deploy
// with an unwritable /externaldata never goes live.
export async function GET() {
  await connection();
  const { systemStatusService } = (await requestScope()).cradle;
  await systemStatusService.ping();

  return new Response("OK", { headers: { "Content-Type": "text/plain" } });
}
