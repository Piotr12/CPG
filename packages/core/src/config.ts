import * as nodeCrypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { MIN_PASSWORD_LENGTH } from "./validators/users/create-user.schema";

export interface AppConfig {
  env: "development" | "production" | "test";
  /** Everything the app persists lives here: the SQLite database, uploads, exports. */
  dataDir: string;
  /** Absolute path of the SQLite database file (inside `dataDir`). */
  databasePath: string;
  /** Log every SQL statement (`DEBUG_SQL=1`, development only). */
  debugSql: boolean;
  /**
   * The built-in administrator's password (`CPG_ADMIN_PASSWORD`). Optional here so the migration
   * CLI and tests run without it; the server requires it through `assertServerConfig`.
   */
  adminPassword: string | undefined;
}

/** Shorter admin passwords stop the server: a floor against trivially guessable credentials. */
export const MIN_ADMIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH;

/**
 * Reads the app configuration from environment variables.
 *
 * - `DATA_DIR` — defaults to `<repo>/data` locally; the Docker image sets `/externaldata`.
 * - `DATABASE_FILE` — file name inside `DATA_DIR`, defaults to `cpg.sqlite`.
 * - `DEBUG_SQL=1` — log SQL in development.
 * - `CPG_ADMIN_PASSWORD` — the built-in admin's password (see `assertServerConfig`).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = path.resolve(
    /* turbopackIgnore: true */ env.DATA_DIR ?? path.join(findWorkspaceRoot(), "data"),
  );

  const appEnv = env.NODE_ENV === "production" || env.NODE_ENV === "test" ? env.NODE_ENV : "development";

  return {
    env: appEnv,
    dataDir,
    databasePath: path.join(/* turbopackIgnore: true */ dataDir, env.DATABASE_FILE ?? "cpg.sqlite"),
    debugSql: appEnv === "development" && env.DEBUG_SQL === "1",
    adminPassword: env.CPG_ADMIN_PASSWORD,
  };
}

/**
 * Throws unless the config can run the server: the admin password must be set, at least
 * `MIN_ADMIN_PASSWORD_LENGTH` characters once trimmed, and free of leading or trailing whitespace
 * (a secret pasted with a stray newline would otherwise start fine and never match at sign-in).
 * The message never contains the value. The runtime must also hash passwords with argon2id
 * (`crypto.argon2`, Node 24.7+), or no normal user could ever sign in.
 */
export function assertServerConfig(config: AppConfig, crypto: { argon2?: unknown } = nodeCrypto): void {
  if (typeof crypto.argon2 !== "function") {
    throw new Error("This Node.js has no crypto.argon2: run CPG on Node.js 24.7 or later.");
  }
  const password = config.adminPassword ?? "";
  if (password.trim().length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(
      `Missing or too short CPG_ADMIN_PASSWORD: set it to at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`,
    );
  }
  if (password !== password.trim()) {
    throw new Error("CPG_ADMIN_PASSWORD starts or ends with whitespace: remove it (a stray newline is the usual cause).");
  }
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
