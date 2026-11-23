import { connection } from "next/server";
import { agentDownloads, DOWNLOADS_PATH, MCP_ARCHIVE_NAME } from "../../../agent-downloads/downloads";

/** A hashed archive never changes under its name, so any cache may keep it (spec A4). */
const IMMUTABLE = "public, max-age=31536000, immutable";

const zip = (bytes: Uint8Array, fileName: string, cacheControl: string) =>
  new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": cacheControl,
    },
  });

/**
 * Public downloads for agents (spec #398, "Downloads (app)"): the MCP server's source archive under its
 * content hash, which `uvx --from` installs, and the onboarding skill's zip. Another hash answers a
 * relative 307 to the current one, so an old copied command still installs on a fresh machine.
 */
export async function GET(_request: Request, { params }: RouteContext<"/downloads/[file]">) {
  await connection();
  const { file } = await params;
  const { mcp, skill } = agentDownloads();

  if (file === mcp.fileName) return zip(mcp.bytes, mcp.fileName, IMMUTABLE);
  if (MCP_ARCHIVE_NAME.test(file)) {
    return new Response(null, { status: 307, headers: { Location: `${DOWNLOADS_PATH}/${mcp.fileName}`, "Cache-Control": "no-cache" } });
  }
  if (file === skill.fileName) return zip(skill.bytes, skill.fileName, "no-cache");
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
