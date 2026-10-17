import { connection } from "next/server";
import { getContainer } from "@/server/container";

// Health check used by kamal-proxy before switching traffic. Touches the database, so a deploy
// with an unwritable /externaldata never goes live.
export async function GET() {
  await connection();
  const { orm } = (await getContainer()).cradle;
  await orm.em.getConnection().execute("select 1");

  return new Response("OK", { headers: { "Content-Type": "text/plain" } });
}
