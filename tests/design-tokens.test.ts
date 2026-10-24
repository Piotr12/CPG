import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Design system v1 enforcement (spec "Architecture → Enforcement", test 1): application code names tokens,
// never a palette colour, an off-scale radius, size or spacing, a blur or gradient, or an emoji. The
// allow-list is the spec's Exceptions table, verbatim; a new exception goes into that table first.

/**
 * Report-only during the design system run (print the offenders and pass); flipped to `false` at the run's
 * close, so the test now fails on any offender outside the spec's Exceptions table.
 */
export const REPORT_ONLY = false;

export interface Offender {
  /** Repo-relative, forward slashes. */
  file: string;
  line: number;
  match: string;
}

const repo = path.resolve(import.meta.dirname, "..");

const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOUR_UTILITY = "bg|text|border|ring|outline|fill|stroke|from|to|via|shadow|divide";
const SPACING_UTILITY = "p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]";
// A class token starts after a quote, whitespace, a variant colon, `!` or `{`, and ends at whitespace, a quote,
// `!` or a closing bracket, so `bg-zinc-500` matches inside `dark:hover:bg-zinc-500/40` but not inside a word.
const START = "(?<=^|[\\s\"'`{(:!])";
const END = "(?=$|[\\s\"'`})!,;])";

const UI_COMPONENTS = "packages/ui/src/components/";
const PUBLIC_PAGES = ["packages/app/src/app/page.tsx", "packages/app/src/app/help/", "packages/app/src/app/login/"];
const APP_PAGE = /^packages\/app\/src\/app\/.*\/?page\.tsx$/;
const EMOJI_FILES = /\.tsx$|^packages\/app\/src\/i18n\/messages\/[^/]+\.ts$/;

interface Rule {
  name: string;
  pattern: RegExp;
  /** Files the rule looks at; every scanned file when absent. */
  files?: (file: string) => boolean;
  /** Matches the rule lets through in `file` (path rules); none when absent. */
  allows?: (match: string, file: string) => boolean;
  /** Whether a match inside a prose string literal ("rounded half-up …") still counts. */
  inProse?: boolean;
}

export const RULES: Rule[] = [
  {
    name: "palette colour",
    pattern: new RegExp(`${START}(?:${COLOUR_UTILITY})(?:-(?:[trblxyse]|offset))?-(?:white|black|(?:${PALETTE})-\\d+)(?:/[\\w.\\[\\]]+)?${END}`, "g"),
  },
  { name: "arbitrary hex colour", pattern: /\[#[0-9a-fA-F]{3,8}\]/g, inProse: true },
  { name: "colour function", pattern: /\b(?:rgba?|hsla?|oklch|color-mix)\(/g, inProse: true },
  { name: "palette variable", pattern: new RegExp(`var\\(--color-(?:${PALETTE}|white|black)\\b[\\w-]*\\)?`, "g"), inProse: true },
  { name: "colour literal", pattern: /(?<=["'`])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?=["'`])/g, inProse: true },
  {
    name: "radius",
    pattern: new RegExp(`${START}rounded(?:-(?:[trblse]|tl|tr|br|bl|ss|se|es|ee))?(?:-(?:[a-z0-9]+|\\[[^\\]\\s]*\\]|\\([^)\\s]*\\)))?${END}`, "g"),
    allows: (match) => /^rounded(?:-(?:[trblse]|tl|tr|br|bl|ss|se|es|ee))?-(?:sm|md|lg|full)$/.test(match),
  },
  {
    name: "font size",
    pattern: new RegExp(`${START}text-(?:xs|sm|base|lg|xl|[2-9]xl|\\[\\d*\\.?\\d+(?:px|rem|em|%|vw|vh|ch|pt)?\\])(?:/[\\w.]+)?${END}`, "g"),
    allows: (match) => /^text-(?:xs|sm|base|lg|2xl|4xl)(?:\/|$)/.test(match),
  },
  {
    name: "spacing",
    pattern: new RegExp(`${START}-?(?:${SPACING_UTILITY})-(?:2\\.5|3\\.5|5|7|0\\.5|1\\.5|16|\\[[^\\]\\s]+\\])${END}`, "g"),
    allows: (match, file) => {
      const step = match.slice(match.lastIndexOf("-") + 1);
      if (step === "0.5" || step === "1.5") return file.startsWith(UI_COMPONENTS);
      if (step === "16") return PUBLIC_PAGES.some((page) => file === page || (page.endsWith("/") && file.startsWith(page)));
      return false;
    },
  },
  { name: "blur or gradient", pattern: new RegExp(`${START}(?:backdrop-blur(?:-[\\w]+)?|bg-(?:gradient|linear|radial)-[^\\s"'\`]+)${END}`, "g") },
  { name: "emoji", pattern: /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*|️|‍/gu, files: (file) => EMOJI_FILES.test(file), inProse: true },
  { name: "page width", pattern: new RegExp(`${START}max-w-(?:2xl|xl|5xl)${END}`, "g"), files: (file) => APP_PAGE.test(file) },
];

/** The spec's Exceptions table. An entry suppresses exactly its string, in exactly its file. */
export const ALLOW_LIST: { file: string; match: string; why: string }[] = [
  ...["#6D4534", "#A56953", "#FFDEA7", "#1C1C1C"].map((match) => ({
    file: "packages/app/src/components/layout/mammoth-mark.tsx",
    match,
    why: "the Fluent Flat mammoth's own fills (D3), kept in sync with icon.svg by the mark's test",
  })),
  { file: "packages/app/src/app/manifest.ts", match: "#ffffff", why: "a Web App Manifest cannot read --background" },
  { file: "packages/ui/src/components/native-select.tsx", match: "bg-[Canvas]", why: "forced-colours system colour" },
  { file: "packages/ui/src/components/native-select.tsx", match: "text-[CanvasText]", why: "forced-colours system colour" },
  { file: "packages/app/src/components/tenants/tenant-header.tsx", match: "border-t-[3px]", why: "TEN-011's tenant edge" },
  // `0.5`/`1.5` in packages/ui/src/components and `16` on the public pages are path rules inside "spacing";
  // card.tsx's `--card-spacing` and `gap-(--card-spacing)` are not literals and pass without an entry.
];

function allowListed(match: string, file: string): boolean {
  return ALLOW_LIST.some((entry) => entry.file === file && entry.match === match);
}

/** A string literal holding a sentence rather than classes: sentence punctuation, or a capitalised word. */
function isProse(literal: string): boolean {
  return /[,.;:?!]\s|(?:^|\s)[A-Z][a-z]/.test(literal);
}

/** The quoted literal on `line` that contains column `at`, if any (single-line literals only). */
function enclosingLiteral(line: string, at: number): string | undefined {
  for (const literal of line.matchAll(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g)) {
    if (literal.index < at && at < literal.index + literal[0].length) return literal[0].slice(1, -1);
  }
  return undefined;
}

/** Every offender in one file's source. `file` is repo-relative with forward slashes. */
export function scanSource(file: string, source: string): Offender[] {
  const offenders: Offender[] = [];
  source.split("\n").forEach((text, index) => {
    if (/^\s*(?:\/\/|\/\*|\*|\{\/\*)/.test(text)) return; // comments describe classes; they don't apply them
    const hits = new Map<number, string>();
    for (const rule of RULES) {
      if (rule.files && !rule.files(file)) continue;
      for (const found of text.matchAll(rule.pattern)) {
        const match = found[0];
        if (hits.has(found.index) || rule.allows?.(match, file) || allowListed(match, file)) continue;
        const literal = enclosingLiteral(text, found.index);
        if (!rule.inProse && literal !== undefined && isProse(literal)) continue;
        // A bare word (`rounded`) is a class only inside a string literal; outside one it is an identifier.
        if (!rule.inProse && !match.includes("-") && literal === undefined) continue;
        hits.set(found.index, match);
      }
    }
    for (const at of [...hits.keys()].sort((a, b) => a - b)) offenders.push({ file, line: index + 1, match: hits.get(at)! });
  });
  return offenders;
}

/** `packages/*\/src/**\/*.{ts,tsx}`, tests excluded, repo-relative. */
function sourceFiles(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(path.join(repo, dir), { withFileTypes: true }).flatMap((entry) => {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return walk(relative);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [relative] : [];
    });
  return readdirSync(path.join(repo, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && readdirSync(path.join(repo, "packages", entry.name)).includes("src"))
    .flatMap((entry) => walk(`packages/${entry.name}/src`))
    .sort();
}

export function scanTree(): Offender[] {
  return sourceFiles().flatMap((file) => scanSource(file, readFileSync(path.join(repo, file), "utf8")));
}

/** The offenders grouped per file, then a count per package, then the one-line total. */
export function listing(offenders: Offender[]): string {
  const byFile = Map.groupBy(offenders, (offender) => offender.file);
  const byPackage = Map.groupBy(offenders, (offender) => offender.file.split("/")[1]!);
  const lines = [...byFile].flatMap(([, list]) => [...list.map((o) => `${o.file}:${o.line}  ${o.match}`), ""]);
  const packages = [...byPackage].map(([name, list]) => `${name} ${list.length}`).join(", ");
  if (packages) lines.push(`by package: ${packages}`);
  lines.push(`design-tokens: ${offenders.length} offenders in ${byFile.size} files`);
  return lines.join("\n");
}

/** Report-only: write the listing and return. Failing: throw with the listing when anything is left. */
export function enforce(offenders: Offender[], reportOnly: boolean, write: (text: string) => unknown): void {
  const text = listing(offenders);
  if (reportOnly) {
    write(`${text}\n`);
    return;
  }
  if (offenders.length > 0) throw new Error(`design tokens: offenders outside the spec's Exceptions table\n${text}`);
}

describe("design-token scanner", () => {
  const matches = (file: string, source: string) => scanSource(file, source).map((offender) => offender.match);
  const APP = "packages/app/src/components/example.tsx";

  it.each([
    ["palette background", `<div className="bg-zinc-900" />`, "bg-zinc-900"],
    ["palette text with a variant", `cn("dark:text-amber-400")`, "text-amber-400"],
    ["palette with an alpha suffix", `"border-green-600/30"`, "border-green-600/30"],
    ["palette on one side", `"border-t-red-600"`, "border-t-red-600"],
    ["white and black", `"bg-black/10 text-white"`, "bg-black/10"],
    ["arbitrary hex", `"bg-[#ff0000]"`, "[#ff0000]"],
    ["colour function in a class", `"hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]"`, "color-mix("],
    ["colour function in a style", `style={{ color: "rgb(0, 0, 0)" }}`, "rgb("],
    ["palette variable", `"shadow-[inset_0_0_0_1px_var(--color-amber-500)]"`, "var(--color-amber-500)"],
    ["colour literal", `const ink = "#1c1c1c";`, "#1c1c1c"],
    ["off-scale radius", `"rounded-xl"`, "rounded-xl"],
    ["off-scale radius on a side", `"rounded-t-2xl"`, "rounded-t-2xl"],
    ["arbitrary radius", `"rounded-[min(var(--radius-md),10px)]"`, "rounded-[min(var(--radius-md),10px)]"],
    ["bare radius", `"rounded px-2"`, "rounded"],
    ["off-scale font size", `"text-xl"`, "text-xl"],
    ["arbitrary font size", `"text-[0.8rem]"`, "text-[0.8rem]"],
    ["banned spacing step", `"px-2.5"`, "px-2.5"],
    ["banned negative margin", `"-mt-7"`, "-mt-7"],
    ["arbitrary spacing", `"p-[13px]"`, "p-[13px]"],
    ["half step outside the primitives", `"py-0.5"`, "py-0.5"],
    ["64 px outside the public pages", `"pt-16"`, "pt-16"],
    ["backdrop blur", `"supports-backdrop-filter:backdrop-blur-xs"`, "backdrop-blur-xs"],
    ["gradient", `"bg-linear-to-r"`, "bg-linear-to-r"],
    ["emoji", `<span>🦣</span>`, "🦣"],
    ["emoji with a variation selector", `<span>❤️</span>`, "❤️"],
  ])("flags a %s", (_, source, expected) => {
    expect(matches(APP, source)).toContain(expected);
  });

  it.each([
    ["allowed radii", `"rounded-sm rounded-md rounded-lg rounded-full rounded-t-lg rounded-bl-sm"`],
    ["allowed sizes", `"text-xs text-sm text-base text-lg text-2xl text-4xl text-sm/6"`],
    ["allowed spacing", `"p-4 px-3 gap-2 -mx-4 space-y-6 gap-(--card-spacing) py-(--card-spacing)"`],
    ["semantic colours with alpha", `"bg-muted text-muted-foreground ring-foreground/10 bg-destructive/10 border-tenant-test-edge"`],
    ["sizes that look like spacing", `"size-2.5 h-5 w-7 min-h-16 max-w-xs top-3.5"`],
    ["text colours that are not sizes", `"text-foreground text-danger text-primary-foreground"`],
    ["a word in a sentence", `"Quantities are rounded half-up to six decimals."`],
    ["an identifier", `const rounded = roundUp(need); return rounded > minimum ? rounded : minimum;`],
    ["a class named in a comment", `// was rounded-xl and bg-zinc-900`],
    ["an emoji in a .ts file outside the messages", `const mark = "🦣";`],
  ])("passes %s", (_, source) => {
    expect(matches("packages/app/src/domain/example.ts", source)).toEqual([]);
  });

  it("applies the path rules for half steps, 64 px and page widths", () => {
    expect(matches("packages/ui/src/components/badge.tsx", `"px-1.5 py-0.5"`)).toEqual([]);
    expect(matches("packages/ui/src/backend/forms/crud-form.tsx", `"px-1.5"`)).toEqual(["px-1.5"]);
    for (const page of ["packages/app/src/app/page.tsx", "packages/app/src/app/help/page.tsx", "packages/app/src/app/login/sign-in-form.tsx"]) {
      expect(matches(page, `"py-16"`)).toEqual([]);
    }
    expect(matches("packages/app/src/app/admin/page.tsx", `"py-16"`)).toEqual(["py-16"]);
    expect(matches("packages/app/src/app/admin/materials/page.tsx", `"max-w-5xl"`)).toEqual(["max-w-5xl"]);
    expect(matches("packages/app/src/app/page.tsx", `"max-w-2xl"`)).toEqual(["max-w-2xl"]);
    expect(matches(APP, `"max-w-5xl"`)).toEqual([]);
    expect(matches("packages/app/src/i18n/messages/en.ts", `title: "🦣 Sign in"`)).toEqual(["🦣"]);
  });

  it("suppresses exactly an allow-listed string in exactly its file", () => {
    const mark = "packages/app/src/components/layout/mammoth-mark.tsx";
    expect(matches(mark, `<path fill="#6D4534" /><path fill="#A56953" /><path fill="#FFDEA7" /><path fill="#1C1C1C" />`)).toEqual([]);
    expect(matches(mark, `<path fill="#000000" />`)).toEqual(["#000000"]);
    expect(matches(APP, `<path fill="#6D4534" />`)).toEqual(["#6D4534"]);
    expect(matches("packages/app/src/app/manifest.ts", `const ICON_BACKGROUND = "#ffffff";`)).toEqual([]);
    expect(matches("packages/app/src/app/manifest.ts", `const THEME = "#000000";`)).toEqual(["#000000"]);
    expect(matches("packages/app/src/app/robots.ts", `const ICON_BACKGROUND = "#ffffff";`)).toEqual(["#ffffff"]);
    expect(ALLOW_LIST.filter((entry) => !entry.why)).toEqual([]);
  });

  it("reports each match once, with its line", () => {
    expect(scanSource(APP, `const a = 1;\n<p className="text-[9px] rounded" />`)).toEqual([
      { file: APP, line: 2, match: "text-[9px]" },
      { file: APP, line: 2, match: "rounded" },
    ]);
  });

  const offenders: Offender[] = [
    { file: "packages/app/src/app/page.tsx", line: 33, match: "text-zinc-600" },
    { file: "packages/app/src/app/page.tsx", line: 44, match: "rounded-2xl" },
    { file: "packages/ui/src/components/button.tsx", line: 24, match: "px-2.5" },
  ];
  const expected = [
    "packages/app/src/app/page.tsx:33  text-zinc-600",
    "packages/app/src/app/page.tsx:44  rounded-2xl",
    "",
    "packages/ui/src/components/button.tsx:24  px-2.5",
    "",
    "by package: app 2, ui 1",
    "design-tokens: 3 offenders in 2 files",
  ].join("\n");

  it("report-only mode writes the listing per file with a total and does not throw", () => {
    const written: string[] = [];
    expect(() => enforce(offenders, true, (text) => written.push(text))).not.toThrow();
    expect(written).toEqual([`${expected}\n`]);
  });

  it("failing mode throws with the listing, and passes a clean tree silently", () => {
    const written: string[] = [];
    expect(() => enforce(offenders, false, (text) => written.push(text))).toThrow(expected);
    expect(() => enforce([], false, (text) => written.push(text))).not.toThrow();
    expect(written).toEqual([]);
    expect(listing([])).toBe("design-tokens: 0 offenders in 0 files");
  });
});

describe("the source tree", () => {
  it(`uses only design tokens${REPORT_ONLY ? " (report-only)" : ""}`, () => {
    enforce(scanTree(), REPORT_ONLY, (text) => process.stdout.write(text));
  });
});
