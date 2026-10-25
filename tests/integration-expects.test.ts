// Every integration test asserts an outcome (AGENTS.md: "Tests check behaviour"). A test whose body
// only waits passes on whatever its waits happen to see, and fails only on a 25 s timeout that names
// no expectation (#192). A test may assert through a helper named `expect…` (`expectFooter`).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { test } from "vitest";

const integration = join(import.meta.dirname, "integration");

/** The callee's leftmost name: `it` for `it(…)`, `it.each(…)(…)` and `it.skip(…)`; `expect` for `expect(x).toBe(…)`. */
function rootName(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return rootName(node.expression);
  if (ts.isCallExpression(node)) return rootName(node.expression);
  return undefined;
}

function asserts(body: ts.Node): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(node) && /^expect([A-Z]|$)/.test(rootName(node.expression) ?? "")) found = true;
    else ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

/** The tests in `source` whose callback has no `expect` call, as `line: name`. */
function testsWithoutExpect(file: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const missing: string[] = [];
  const visit = (node: ts.Node) => {
    // A test's first argument is its name: this skips `test.map(…)` on a variable holding Test tenant rows.
    const named = (argument: ts.Expression | undefined) => !!argument && (ts.isStringLiteral(argument) || ts.isTemplateLiteral(argument));
    if (ts.isCallExpression(node) && ["it", "test"].includes(rootName(node.expression) ?? "") && named(node.arguments[0])) {
      const callback = node.arguments.find((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument));
      if (callback && !asserts(callback)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        missing.push(`${line + 1}: ${node.arguments[0]?.getText(sourceFile) ?? "?"}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return missing;
}

test("the check finds tests that only wait, through it, it.each and test", () => {
  const source = [
    `it("waits", async () => { await browser.waitFor("main"); });`,
    `it("asserts", async () => { expect(await read()).toBe(1); });`,
    `it("asserts through a helper", async () => { await expectFooter(); });`,
    `it("asserts softly", () => { expect.soft(1).toBe(1); });`,
    `it.each([1])("waits for %s", async () => { await browser.waitFor("main"); });`,
    `test("waits too", function () { return wait(); });`,
    `describe("a block", () => { it("nested", () => { expectation(); }); });`,
    "it(`templated ${1}`, () => { expect(1).toBe(1); });",
    `const ids = test.map(({ id }) => id);`,
  ].join("\n");
  assert.deepEqual(testsWithoutExpect("sample.test.ts", source), [
    `1: "waits"`,
    `5: "waits for %s"`,
    `6: "waits too"`,
    `7: "nested"`,
  ]);
});

test("every integration test asserts an outcome", () => {
  const missing = readdirSync(integration)
    .filter((name) => name.endsWith(".test.ts"))
    .flatMap((name) => testsWithoutExpect(name, readFileSync(join(integration, name), "utf8")).map((entry) => `${name}:${entry}`));
  assert.deepEqual(missing, []);
});
