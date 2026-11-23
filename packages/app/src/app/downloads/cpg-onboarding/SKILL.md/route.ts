import { connection } from "next/server";
import { agentDownloads } from "../../../../agent-downloads/downloads";

/**
 * The onboarding skill as a raw file (spec A5), which the guide's one-line install commands save into
 * an agent's skills folder. Read at request time, so it always matches the package archive.
 */
export async function GET() {
  await connection();

  return new Response(Buffer.from(agentDownloads().skillMarkdown), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
