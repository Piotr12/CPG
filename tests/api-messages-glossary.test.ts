import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// The glossary says BOM, never recipe (design system v1, Principle 7). #206 swept the screens, and
// `messages.test.ts`, `help/topics.test.ts` and `workbook-layout.test.ts` guard them. #214 reworded the
// API's English `message` texts too. This test guards those: no string the server code writes may say
// "recipe". Identifiers, comments and module paths (`recipe-rules`) are internal and may keep the word.
const root = path.resolve(import.meta.dirname, "..");
const SERVER_DIRS = ["packages/core/src", "packages/app/src/app/api"];
const RETIRED = /recipe/i;
/** A string that is a name, not a text: a property path such as the populate hint `"recipe.bom"`. */
const NAME = /^[\w$.]+$/;

/** Every non-test `.ts` file under `dir`, recursively. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith(".ts") && !entry.name.includes(".test.") ? [full] : [];
  });
}

/** A string that names a module (`import … from "…"`, `export … from "…"`, `import("…")`), not a text. */
function isModulePath(node: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return parent.moduleSpecifier === node;
  if (ts.isExternalModuleReference(parent) || ts.isLiteralTypeNode(parent)) return true;
  return ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword;
}

/** The literal text pieces of a source that say the retired word: `file:line "text"`. */
function retiredStrings(file: string, source: string): string[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    const literal = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateLiteralToken(node);
    if (literal && RETIRED.test(node.text) && !NAME.test(node.text) && !isModulePath(node)) {
      const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
      found.push(`${path.relative(root, file)}:${line + 1} ${JSON.stringify(node.text)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

describe("the server's English texts", () => {
  it("say BOM, never recipe: one term per concept, in the API's messages too (#206, #214)", () => {
    const files = SERVER_DIRS.flatMap((dir) => sources(path.join(root, dir)));
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap((file) => retiredStrings(file, readFileSync(file, "utf8")))).toEqual([]);
  });

  it("finds the word in a message, a template's text and a field error, whatever its case", () => {
    const source = [
      'throw new ConflictError("This recipe would make a cycle.", "BOM_CYCLE");',
      "const message = `BOM ${id}: its Recipe ${n} is empty.`;",
      "const tagged = `${id} has no RECIPE`;",
    ].join("\n");
    expect(retiredStrings(path.join(root, "x.ts"), source)).toEqual([
      'x.ts:1 "This recipe would make a cycle."',
      'x.ts:2 ": its Recipe "',
      'x.ts:3 " has no RECIPE"',
    ]);
  });

  it("ignores module paths, property paths, identifiers and comments", () => {
    const source = [
      'const order = await em.findOne(ProductionOrder, { id }, { populate: ["recipe.bom", "recipe"] });',
      'import { canBeBomOutput } from "../../domain/boms/recipe-rules";',
      'export { isSameRecipe } from "./recipe-equality";',
      'const rules = await import("./recipe-rules");',
      'type Rules = typeof import("./recipe-rules");',
      "/** The current recipe. */",
      "const recipe = records.get(bom); // the recipe",
      'const ok = "This BOM would make a cycle.";',
    ].join("\n");
    expect(retiredStrings(path.join(root, "x.ts"), source)).toEqual([]);
  });
});
