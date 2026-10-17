import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace from the monorepo root so the standalone build includes hoisted node_modules and
  // the workspace packages.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
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
