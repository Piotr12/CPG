import path from "node:path";
import type { NextConfig } from "next";

/**
 * The MCP server's package (#398, spec A9): the downloads zip it at request time, and the homepage and
 * `/agents` name the archive by its hash. Relative to `packages/app`; nothing else of `mcp/` ships.
 */
const MCP_PACKAGE_FILES = ["../../mcp/pyproject.toml", "../../mcp/README.md", "../../mcp/cpg_mcp/**/*"];

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace from the monorepo root so the standalone build includes hoisted node_modules and
  // the workspace packages.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  outputFileTracingIncludes: {
    "/": MCP_PACKAGE_FILES,
    "/agents": MCP_PACKAGE_FILES,
    "/downloads/*": MCP_PACKAGE_FILES,
    "/downloads/cpg-onboarding/SKILL.md": MCP_PACKAGE_FILES,
  },
  // Load the ORM from node_modules at runtime instead of bundling it (native SQLite binding,
  // dynamic requires).
  serverExternalPackages: ["@mikro-orm/sqlite", "@mikro-orm/sql", "@mikro-orm/migrations"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
