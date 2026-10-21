import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The seed posting context (`kind: "seed"`) backdates postings, so no page, action or route may reach it (spec
// .ai/specs/2026-10-21--0718UTC-test-tenant-dataset.md, INV-010, INV-011, R08). It may appear only in the PostingContext
// type, in a service's seedDemo method, and in services/demo/ (the seeder). Only the seeder, and the named-record
// delegations that forward to it, may call .seedDemo(.
const packagesDir = path.resolve(import.meta.dirname, "../packages");

/** Every non-test source file under `dir`, recursively. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const production = readdirSync(packagesDir).flatMap((pkg) => sources(path.join(packagesDir, pkg, "src")));
/** Repo-relative, slash-separated path, e.g. `core/src/services/stock/stock.service.ts`. */
const rel = (file: string) => path.relative(packagesDir, file).split(path.sep).join("/");
const read = (file: string) => readFileSync(file, "utf8");

const SERVICES = "core/src/services/";
const DEMO = `${SERVICES}demo/`;
const POSTING_FILE = `${SERVICES}stock/stock-posting.ts`;
const DELEGATING = /^core\/src\/services\/(?:locations|customers|suppliers)\/[^/]+\.service\.ts$/;
const SEED_CONTEXT = /kind:\s*["']seed["']/;
const POSTING_CONTEXT_TYPE = /^export type PostingContext\b/;
const SEED_DEMO_CALL = /\.seedDemo\(/;
const DELEGATION = /this\.records\.seedDemo\(/;
/** A method or function declaration at the start of a line (class members are indented two spaces). */
const DECLARATION = /^(?: {2})?(?:export\s+)?(?:async\s+)?(?!(?:return|if|for|while|switch|catch)\b)(\w+)\s*(?:<[^>]*>)?\s*\(/;

/** The name of the nearest method or function declared at or above `lines[index]`. */
function enclosingMethod(lines: readonly string[], index: number): string | undefined {
  for (let i = index; i >= 0; i--) {
    const name = DECLARATION.exec(lines[i])?.[1];
    if (name) return name;
  }
  return undefined;
}

/** `file:line` for each `kind: "seed"` in `source` that is not in the type, a seedDemo method, or the seeder. */
function seedContextLeaks(file: string, source: string): string[] {
  const lines = source.split("\n");
  return lines.flatMap((line, i) => {
    if (!SEED_CONTEXT.test(line)) return [];
    const allowed =
      (file === POSTING_FILE && POSTING_CONTEXT_TYPE.test(line)) ||
      (file.startsWith(SERVICES) && enclosingMethod(lines, i) === "seedDemo") ||
      file.startsWith(DEMO);
    return allowed ? [] : [`${file}:${i + 1}`];
  });
}

/** `file:line` for each `.seedDemo(` call in `source` that is not the seeder or a named-record delegation. */
function seedCallLeaks(file: string, source: string): string[] {
  return source.split("\n").flatMap((line, i) => {
    if (!SEED_DEMO_CALL.test(line)) return [];
    const allowed = file.startsWith(DEMO) || (DELEGATING.test(file) && DELEGATION.test(line));
    return allowed ? [] : [`${file}:${i + 1}`];
  });
}

describe("seed context callers", () => {
  it("set kind: \"seed\" only in the PostingContext type, seedDemo methods and the seeder (INV-010, INV-011)", () => {
    expect(production.flatMap((file) => seedContextLeaks(rel(file), read(file)))).toEqual([]);
  });

  it("call .seedDemo( only from the seeder and the named-record delegations, never from app (R08)", () => {
    expect(production.flatMap((file) => seedCallLeaks(rel(file), read(file)))).toEqual([]);
  });

  it("finds the seed context and the seeder where they belong, so the scan is not vacuous", () => {
    const contextFiles = production.map(rel).filter((file) => SEED_CONTEXT.test(read(path.join(packagesDir, file))));
    expect(contextFiles).toContain(POSTING_FILE);
    expect(contextFiles).toContain(`${SERVICES}stock/stock.service.ts`);
    expect(production.map(rel)).toContain(`${DEMO}seed-demo-data.ts`);
  });

  it("would notice the seed context or a seeder call in the wrong place", () => {
    const planted = `const x = { kind: "seed", at: new Date() };\n`;
    expect(seedContextLeaks("app/src/instrumentation.ts", planted)).toEqual(["app/src/instrumentation.ts:1"]);

    const service = [
      "export class Fake {",
      "  async post(input: Input) {",
      `    return this.createWith(input, { kind: "seed", at: new Date() });`,
      "  }",
      "  async seedDemo(input: Input, at: Date) {",
      `    return this.createWith(input, { kind: "seed", at });`,
      "  }",
      "}",
    ].join("\n");
    expect(seedContextLeaks(`${SERVICES}fake/fake.service.ts`, service)).toEqual([`${SERVICES}fake/fake.service.ts:3`]);
    expect(seedContextLeaks(`${DEMO}fake.ts`, service)).toEqual([]);
    expect(seedContextLeaks(POSTING_FILE, `export type PostingContext = { kind: "user" } | { kind: "seed"; at: Date };`)).toEqual([]);

    expect(seedCallLeaks("app/src/app/admin/actions.ts", "await services.stockService.seedDemo(lines, at);\n")).toEqual([
      "app/src/app/admin/actions.ts:1",
    ]);
    expect(seedCallLeaks(`${DEMO}seed-demo-data.ts`, "await services.stockService.seedDemo(lines, at);")).toEqual([]);
    expect(seedCallLeaks(`${SERVICES}customers/customer.service.ts`, "return this.records.seedDemo(rows, at);")).toEqual([]);
    expect(seedCallLeaks(`${SERVICES}customers/customer.service.ts`, "return other.seedDemo(rows, at);")).toEqual([
      `${SERVICES}customers/customer.service.ts:1`,
    ]);
  });
});
