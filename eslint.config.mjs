import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Package layering (.ai/docs/engineering-standards.md): app → core → db, app → ui; db and ui
// depend on no workspace package. Only db imports MikroORM. Each block lists everything the
// package must not import; a later block replaces the rule, so every block repeats `acrossPackages`.
const acrossPackages = {
  group: ["**/app/src/**", "**/core/src/**", "**/db/src/**", "**/ui/src/**"],
  message: "Import another package by its @cpg/* name, never by a relative path.",
};
const forbid = (group, message) => ({ group, message });
const restrictImports = (files, ...patterns) => ({
  files,
  rules: { "no-restricted-imports": ["error", { patterns: [acrossPackages, ...patterns] }] },
});

const orm = forbid(["@mikro-orm/*"], "Only @cpg/db imports MikroORM; use the types it re-exports.");
const db = forbid(["@cpg/db", "@cpg/db/*"], "Only @cpg/core uses @cpg/db; go through a service.");
const core = forbid(["@cpg/core", "@cpg/core/*"], "@cpg/core depends on this package, not the other way round.");
const framework = forbid(["next", "next/*", "react", "react-dom", "react/*"], "Keep this package framework-agnostic.");
const app = forbid(["@cpg/app", "@cpg/app/*"], "Nothing depends on @cpg/app.");
const ui = forbid(["@cpg/ui", "@cpg/ui/*"], "Only @cpg/app uses @cpg/ui.");

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The Next.js app lives in a workspace package, not at the repo root.
  { settings: { next: { rootDir: "packages/app/" } } },
  restrictImports(["packages/app/**"], orm, db),
  restrictImports(["packages/core/**"], orm, framework, app, ui),
  restrictImports(["packages/db/**"], framework, app, ui, core),
  restrictImports(
    ["packages/ui/**"],
    orm,
    app,
    forbid(["@cpg/core", "@cpg/core/*", "@cpg/db", "@cpg/db/*"], "@cpg/ui is domain-agnostic; pass data in as props."),
  ),
  // Debug output doesn't ship; CLIs and tests may print.
  { rules: { "no-console": ["error", { allow: ["info", "warn", "error"] }] } },
  { files: ["packages/*/scripts/**", "tests/**"], rules: { "no-console": "off" } },
  // Override default ignores of eslint-config-next (paths are relative to the repo root).
  globalIgnores(["**/.next/**", "**/out/**", "**/build/**", "**/next-env.d.ts", "data/**"]),
]);

export default eslintConfig;
