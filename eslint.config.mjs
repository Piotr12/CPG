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
// Routes use app/src/routing/api-handler.ts: it lets Next.js's control-flow errors through (#38).
const unwiredApiHandler = {
  ...forbid(["@cpg/core"], "Use apiHandler from app/src/routing/api-handler.ts, which passes unstable_rethrow."),
  importNames: ["createApiHandler"],
};

// Tenant isolation (R05; spec .ai/specs/implemented/2026-10-19--0913UTC-test-prod-tenants.md). @cpg/db enforces
// it at runtime; these rules close what it can't see: switching the filter off, picking the tenant
// anywhere but tenantScope, adding filters, the QueryBuilder and the driver, and raw SQL. Tests may
// do all of it, to prove the runtime checks.
const tenantRules = {
  filters: {
    selector: "Property[key.name='filters'], Property[key.value='filters']",
    message: "Never pass `filters`: the tenant filter must stay on (tenant isolation, R05).",
  },
  setFilterParams: {
    selector: "CallExpression[callee.property.name='setFilterParams']",
    message: "Only tenantScope() selects the tenant.",
  },
  selectTenant: {
    selector: "CallExpression[callee.name='selectTenant']",
    message: "Only tenantScope() selects the tenant.",
  },
  bypass: {
    selector: "CallExpression[callee.property.name=/^(addFilter|getDriver|createQueryBuilder|qb)$/]",
    message: "This bypasses tenant isolation (R05). Use the entity APIs (find, create, flush) through a service.",
  },
  rawSql: {
    selector: "CallExpression[callee.property.name=/^(execute|getKysely)$/]",
    message: "No raw SQL: it bypasses tenant isolation. Use the entity APIs through a service.",
  },
};
const tenantSource = ["packages/core/src/**/*.ts", "packages/app/src/**/*.{ts,tsx}"];
const restrictTenantSyntax = (files, ...allowed) => ({
  files,
  ignores: ["**/*.test.ts", "**/*.test.tsx"],
  rules: {
    "no-restricted-syntax": [
      "error",
      ...Object.entries(tenantRules)
        .filter(([name]) => !allowed.includes(name))
        .map(([, rule]) => rule),
    ],
  },
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The Next.js app lives in a workspace package, not at the repo root.
  { settings: { next: { rootDir: "packages/app/" } } },
  restrictImports(["packages/app/**"], orm, db, unwiredApiHandler),
  restrictImports(["packages/app/src/routing/api-handler.ts"], orm, db),
  restrictImports(["packages/core/**"], orm, framework, app, ui),
  restrictImports(["packages/db/**"], framework, app, ui, core),
  restrictImports(
    ["packages/ui/**"],
    orm,
    app,
    forbid(["@cpg/core", "@cpg/core/*", "@cpg/db", "@cpg/db/*"], "@cpg/ui is domain-agnostic; pass data in as props."),
  ),
  restrictTenantSyntax(tenantSource),
  restrictTenantSyntax(["packages/core/src/container/tenant-scope.ts"], "selectTenant"),
  // Debug output doesn't ship; CLIs and tests may print.
  { rules: { "no-console": ["error", { allow: ["info", "warn", "error"] }] } },
  { files: ["packages/*/scripts/**", "tests/**"], rules: { "no-console": "off" } },
  // Override default ignores of eslint-config-next (paths are relative to the repo root).
  // .ai/tmp/ holds the om-* skills' temporary git worktrees, full repo copies.
  globalIgnores(["**/.next/**", "**/out/**", "**/build/**", "**/next-env.d.ts", "data/**", "coverage/**", ".ai/tmp/**"]),
]);

export default eslintConfig;
