import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface AppConfig {
  env: "development" | "production" | "test";
  /** Everything the app persists lives here: the SQLite database, uploads, exports. */
  dataDir: string;
  /** Absolute path of the SQLite database file (inside `dataDir`). */
  databasePath: string;
}

/**
 * Reads the app configuration from environment variables.
 *
 * - `DATA_DIR` — defaults to `<repo>/data` locally; the Docker image sets `/externaldata`.
 * - `DATABASE_FILE` — file name inside `DATA_DIR`, defaults to `cpg.sqlite`.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = path.resolve(
    /* turbopackIgnore: true */ env.DATA_DIR ?? path.join(findWorkspaceRoot(), "data"),
  );

  return {
    env: env.NODE_ENV === "production" || env.NODE_ENV === "test" ? env.NODE_ENV : "development",
    dataDir,
    databasePath: path.join(/* turbopackIgnore: true */ dataDir, env.DATABASE_FILE ?? "cpg.sqlite"),
  };
}

/**
 * The monorepo root: the closest directory, walking up from `cwd`, whose `package.json` declares
 * `workspaces`. Keeps local paths the same whether a script runs from the root or a package.
 */
export function findWorkspaceRoot(cwd = process.cwd()): string {
  for (let dir = cwd; ; dir = path.dirname(dir)) {
    const manifest = path.join(/* turbopackIgnore: true */ dir, "package.json");
    if (existsSync(manifest) && "workspaces" in JSON.parse(readFileSync(manifest, "utf8"))) {
      return dir;
    }
    if (dir === path.dirname(dir)) return cwd;
  }
}
