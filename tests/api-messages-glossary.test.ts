import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// The glossary says BOM, never recipe (design system v1, Principle 7). #206 swept the screens, and
// `messages.test.ts`, `help/topics.test.ts` and `workbook-layout.test.ts` guard them. #214 reworded the
// API's English `message` texts too. This test guards those: no string or JSX text in the server code
// (the business layer, the routes, pages and server actions, authentication and routing) may say "recipe".
// Identifiers, comments and module paths (`recipe-rules`) are internal and may keep the word.
const root = path.resolve(import.meta.dirname, "..");
const SERVER_DIRS = ["packages/core/src", "packages/app/src/app", "packages/app/src/auth", "packages/app/src/routing"];
const RETIRED = /recipe/i;
/** A string that is a name, not a text: a dotted property path such as the populate hint `"recipe.bom"`. */
const PROPERTY_PATH = /^[\w$]+(\.[\w$]+)+$/;

/** Every non-test `.ts` and `.tsx` file under `dir`, recursively. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") ? [full] : [];
  });
}

/** A string that names a module (`import … from "…"`, `export … from "…"`, `import("…")`, `typeof import("…")`), not a text. */
function isModulePath(node: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return parent.moduleSpecifier === node;
  if (ts.isExternalModuleReference(parent)) return true;
  if (ts.isLiteralTypeNode(parent)) return ts.isImportTypeNode(parent.parent);
  return ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword;
}

/** The literal and JSX text pieces of a source that say the retired word: `file:line "text"`. */
function retiredStrings(file: string, source: string): string[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    const literal = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node);
    if (literal && RETIRED.test(node.text) && !PROPERTY_PATH.test(node.text) && !isModulePath(node)) {
      const { line } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
      found.push(`${path.relative(root, file)}:${line + 1} ${JSON.stringify(node.text.trim())}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

describe("the server's English texts", () => {
  it("say BOM, never recipe: one term per concept, in the API's messages too (#206, #214)", () => {
    const files = SERVER_DIRS.flatMap((dir) => sources(path.join(root, dir)));
    expect(files.length).toBeGreaterThan(200);
    expect(files.flatMap((file) => retiredStrings(file, readFileSync(file, "utf8")))).toEqual([]);
  });

  it("finds the word in a message, a template's text, a one-word text and a page's JSX text, whatever its case", () => {
    const source = [
      'throw new ConflictError("This recipe would make a cycle.", "BOM_CYCLE");',
      "const message = `BOM ${id}: its Recipe ${n} is empty.`;",
      "const tagged = `${id} has no RECIPE`;",
      'const column = { header: "Recipes" };',
    ].join("\n");
    expect(retiredStrings(path.join(root, "x.ts"), source)).toEqual([
      'x.ts:1 "This recipe would make a cycle."',
      'x.ts:2 ": its Recipe"',
      'x.ts:3 "has no RECIPE"',
      'x.ts:4 "Recipes"',
    ]);
    expect(retiredStrings(path.join(root, "page.tsx"), "export default function Page() {\n  return <h1>Edit the recipe</h1>;\n}")).toEqual([
      'page.tsx:2 "Edit the recipe"',
    ]);
  });

  it("ignores module paths, property paths, identifiers and comments", () => {
    const source = [
      'const order = await em.findOne(ProductionOrder, { id }, { populate: ["recipe.bom"] });',
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
