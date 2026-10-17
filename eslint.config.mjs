import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The Next.js app lives in a workspace package, not at the repo root.
  { settings: { next: { rootDir: "packages/app/" } } },
  // Override default ignores of eslint-config-next (paths are relative to the repo root).
  globalIgnores(["**/.next/**", "**/out/**", "**/build/**", "**/next-env.d.ts", "data/**"]),
]);

export default eslintConfig;
