import { connection } from "next/server";
import { requestScope } from "@cpg/core";

// Health check used by kamal-proxy before switching traffic. Answers once the database connection
// does (the startup migrations already proved /externaldata writable), also while a realistic Test
// reset holds that connection in its transaction (#185).
export async function GET() {
  await connection();
  const { systemStatusService } = (await requestScope()).cradle;
  await systemStatusService.ping();

  return new Response("OK", { headers: { "Content-Type": "text/plain" } });
}
