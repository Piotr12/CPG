import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertServerConfig, findWorkspaceRoot, loadConfig, MIN_ADMIN_PASSWORD_LENGTH } from "./config";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("loadConfig", () => {
  it("defaults to <repo>/data/cpg.sqlite in development", () => {
    const config = loadConfig({});

    expect(config).toEqual({
      env: "development",
      dataDir: path.join(repoRoot, "data"),
      databasePath: path.join(repoRoot, "data", "cpg.sqlite"),
      debugSql: false,
      adminPassword: undefined,
    });
  });

  it("reads the admin password from CPG_ADMIN_PASSWORD", () => {
    expect(loadConfig({ CPG_ADMIN_PASSWORD: "correct horse battery" }).adminPassword).toBe("correct horse battery");
  });

  it("reads DATA_DIR and DATABASE_FILE, resolving a relative DATA_DIR", () => {
    const config = loadConfig({ DATA_DIR: "relative/data", DATABASE_FILE: "other.sqlite" });

    expect(config.dataDir).toBe(path.resolve("relative/data"));
    expect(config.databasePath).toBe(path.resolve("relative/data", "other.sqlite"));
  });

  it.each(["production", "test"] as const)("keeps NODE_ENV=%s", (nodeEnv) => {
    expect(loadConfig({ NODE_ENV: nodeEnv }).env).toBe(nodeEnv);
  });

  it("treats any other NODE_ENV as development", () => {
    expect(loadConfig({ NODE_ENV: "staging" }).env).toBe("development");
  });

  it("logs SQL only in development with DEBUG_SQL=1", () => {
    expect(loadConfig({ DEBUG_SQL: "1" }).debugSql).toBe(true);
    expect(loadConfig({ DEBUG_SQL: "true" }).debugSql).toBe(false);
    expect(loadConfig({ DEBUG_SQL: "1", NODE_ENV: "production" }).debugSql).toBe(false);
  });
});

describe("assertServerConfig", () => {
  const withPassword = (adminPassword: string | undefined) => ({ ...loadConfig({}), adminPassword });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace only", "               "],
    ["one character short", "x".repeat(MIN_ADMIN_PASSWORD_LENGTH - 1)],
    ["short once trimmed", `  ${"x".repeat(MIN_ADMIN_PASSWORD_LENGTH - 1)}  `],
  ])("refuses a %s admin password", (_case, password) => {
    expect(() => assertServerConfig(withPassword(password))).toThrow(
      "Missing or too short CPG_ADMIN_PASSWORD: set it to at least 12 characters.",
    );
  });

  it.each([
    ["a trailing newline", "correct horse battery\n"],
    ["a leading space", " correct horse battery"],
  ])("refuses a long enough password with %s", (_case, password) => {
    expect(() => assertServerConfig(withPassword(password))).toThrow(
      "CPG_ADMIN_PASSWORD starts or ends with whitespace: remove it (a stray newline is the usual cause).",
    );
  });

  it("accepts a password of the minimum length", () => {
    expect(() => assertServerConfig(withPassword("x".repeat(MIN_ADMIN_PASSWORD_LENGTH)))).not.toThrow();
  });

  it("never puts the password in the error message", () => {
    const secret = "s3cret-but-short";

    expect(() => assertServerConfig(withPassword(secret.slice(0, 11)))).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret.slice(0, 11)) }),
    );
  });
});

describe("findWorkspaceRoot", () => {
  it("walks up to the package.json that declares workspaces", () => {
    expect(findWorkspaceRoot(import.meta.dirname)).toBe(repoRoot);
  });

  it("skips package.json files without workspaces", () => {
    const root = mkdtempSync(path.join(tmpdir(), "cpg-root-"));
    const pkg = path.join(root, "packages", "x");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
    writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "x" }));

    expect(findWorkspaceRoot(pkg)).toBe(root);
  });

  it("falls back to the starting directory when there is no workspace root", () => {
    // The filesystem root: the temp dir may itself sit inside a workspace.
    const root = path.parse(process.cwd()).root;

    expect(findWorkspaceRoot(root)).toBe(root);
  });

  it("starts from the current directory by default", () => {
    expect(findWorkspaceRoot()).toBe(findWorkspaceRoot(process.cwd()));
  });
});
