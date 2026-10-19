import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Tokens are minted only in the signed-in UI, never through the bearer API (R07, API-032; spec
// .ai/specs/2026-10-19--1053UTC-api-tokens.md). `ApiTokenService.create` takes a cookie session,
// which the type system enforces; this test pins who may reach the service at all, and that the
// cookie-session lookup never starts reading bearer tokens.
const appDir = path.resolve(import.meta.dirname, "../packages/app/src");

/** Every non-test source file under `dir`, recursively. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const rel = (file: string) => path.relative(appDir, file).split(path.sep).join("/");
const read = (file: string) => readFileSync(file, "utf8");
const all = sources(appDir);

/** The files allowed to use `apiTokenService`, and what for. */
const ALLOWED = {
  "auth/require-api-user.ts": "authenticate bearer tokens",
  "app/api/tokens/route.ts": "list",
  "app/api/tokens/[id]/route.ts": "revoke",
  "app/admin/(global)/tokens/page.tsx": "list",
  "app/admin/(global)/tokens/actions.ts": "create and revoke from the signed-in UI",
};
/** The one place a token is created: a server action, authenticated by the session cookie. */
const CREATOR = "app/admin/(global)/tokens/actions.ts";

describe("API token minting", () => {
  it("reaches the token service only from the files that need it", () => {
    const users = all.filter((file) => read(file).includes("apiTokenService")).map(rel);
    expect(users.filter((file) => !(file in ALLOWED))).toEqual([]);
  });

  it("creates tokens only in the tokens screen's server action, never in a route handler", () => {
    const creators = all.filter((file) => /apiTokenService[\s\S]*\.create\(|\bcreate\(\s*(actor|user)/.test(read(file)));
    expect(creators.map(rel)).toEqual([CREATOR]);
  });

  it("keeps the session lookup cookie-only, so a bearer token can't reach a server action", () => {
    const sessionLookup = read(path.join(appDir, "auth/require-admin.ts"));
    expect(sessionLookup).toMatch(/readSessionToken\(\)/);
    expect(sessionLookup).not.toMatch(/authorization|headers\(\)|apiTokenService/i);
  });
});
