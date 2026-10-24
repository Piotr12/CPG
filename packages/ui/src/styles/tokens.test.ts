import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// The accessibility floor of the design system (spec "Implementation Plan → W1", step 5): every text pair
// ≥ 4.5:1 and every essential non-text pair ≥ 3:1, computed from the OKLCH values in globals.css for both
// themes. The maths is written out here (no colour library): OKLCH → OKLab → linear sRGB → WCAG luminance.

type Rgb = [number, number, number];

/** OKLCH (`L` 0–1, chroma, hue in degrees) to linear-light sRGB, each channel clipped to the sRGB gamut. */
function oklchToLinearSrgb(l: number, c: number, h: number): Rgb {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  // OKLab → LMS (cube roots), Björn Ottosson's published matrices.
  const lms = [l + 0.3963377774 * a + 0.2158037573 * b, l - 0.1055613458 * a - 0.0638541728 * b, l - 0.0894841775 * a - 1.291485548 * b].map(
    (value) => value ** 3,
  );
  const [L, M, S] = lms as Rgb;
  const rgb: Rgb = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return rgb.map((channel) => Math.min(1, Math.max(0, channel))) as Rgb;
}

/** WCAG 2.x relative luminance of a linear-light sRGB colour. */
function luminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two luminances, lighter over darker. */
function contrast(first: number, second: number): number {
  const [light, dark] = first > second ? [first, second] : [second, first];
  return (light + 0.05) / (dark + 0.05);
}

/** The `--name: oklch(L C H)` declarations of one top-level block of a stylesheet, by selector. */
function oklchTokens(css: string, selector: string): Map<string, number> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const tokens = new Map<string, number>();
  for (const [, name, l, c, h] of body.matchAll(/--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)) {
    tokens.set(name!, luminance(oklchToLinearSrgb(Number(l), Number(c), Number(h))));
  }
  return tokens;
}

const css = readFileSync(path.join(import.meta.dirname, "globals.css"), "utf8");
const light = oklchTokens(css, ":root");
// `.dark` overrides `:root`; a token it doesn't repeat (the chart greys) keeps its light value.
const dark = new Map([...light, ...oklchTokens(css, ".dark")]);
const themes = { light, dark };

const TEXT = 4.5;
const NON_TEXT = 3;
/** `[foreground, background, minimum]`. */
const PAIRS: [string, string, number][] = [
  ...["background", "card", "muted"].map((surface): [string, string, number] => ["foreground", surface, TEXT]),
  ...["background", "muted", "sidebar"].map((surface): [string, string, number] => ["muted-foreground", surface, TEXT]),
  ["primary-foreground", "primary", TEXT],
  ["success", "success-surface", TEXT],
  ["warning", "warning-surface", TEXT],
  ["danger", "danger-surface", TEXT],
  ["neutral-tone", "neutral-surface", TEXT],
  ["danger-solid-foreground", "danger-solid", TEXT],
  ["tenant-test-tag-foreground", "tenant-test-tag", TEXT],
  ["tenant-prod-tag-foreground", "tenant-prod-tag", TEXT],
  ...["background", "sidebar", "muted"].map((surface): [string, string, number] => ["ring", surface, NON_TEXT]),
  ...["background", "card", "muted"].map((surface): [string, string, number] => ["input", surface, NON_TEXT]),
  // The invalid control border (`aria-invalid:border-danger`): a boundary, so the non-text floor applies.
  ...["background", "card", "muted"].map((surface): [string, string, number] => ["danger", surface, NON_TEXT]),
  ["tenant-prod-edge", "background", NON_TEXT],
];

describe("OKLCH → WCAG maths", () => {
  it("maps the OKLCH white and black to luminance 1 and 0, 21:1 apart", () => {
    expect(luminance(oklchToLinearSrgb(1, 0, 0))).toBeCloseTo(1, 4);
    expect(luminance(oklchToLinearSrgb(0, 0, 0))).toBe(0);
    expect(contrast(1, 0)).toBe(21);
    expect(contrast(0, 1)).toBe(21);
  });

  it("maps sRGB red's OKLCH coordinates back to pure red", () => {
    // #ff0000 is oklch(0.62796 0.25768 29.2339) (CSS Color 4 reference values).
    const [r, g, b] = oklchToLinearSrgb(0.62796, 0.25768, 29.2339);
    expect(r).toBeCloseTo(1, 3);
    expect(g).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
    expect(luminance([r, g, b])).toBeCloseTo(0.2126, 3);
  });

  it("matches a published neutral: oklch(0.556 0 0) is #737373, 4.74:1 on white", () => {
    expect(contrast(1, luminance(oklchToLinearSrgb(0.556, 0, 0)))).toBeCloseTo(4.74, 1);
  });

  it("clips out-of-gamut channels to the sRGB cube", () => {
    for (const channel of oklchToLinearSrgb(0.7, 0.4, 145)) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });

  it("reads one block's declarations and refuses a missing block", () => {
    const sheet = "\n:root {\n  --a: oklch(1 0 0);\n  --b: oklch(0 0 0 / 0.5);\n  --c: 0.5rem;\n}\n";
    expect([...oklchTokens(sheet, ":root").keys()]).toEqual(["a"]);
    expect(() => oklchTokens(sheet, ".dark")).toThrow("no .dark block");
  });
});

describe("globals.css meets the accessibility floor", () => {
  const report: string[] = [];
  afterAll(() => {
    process.stdout.write(`design-tokens contrast ratios:\n${report.join("\n")}\n`);
  });

  for (const [theme, tokens] of Object.entries(themes)) {
    it.each(PAIRS)(`${theme}: %s on %s ≥ %s:1`, (foreground, background, minimum) => {
      const value = (name: string) => tokens.get(name);
      expect(value(foreground), `--${foreground} in ${theme}`).toBeTypeOf("number");
      expect(value(background), `--${background} in ${theme}`).toBeTypeOf("number");
      const ratio = contrast(value(foreground)!, value(background)!);
      report.push(`  ${theme.padEnd(5)}  ${`${foreground} on ${background}`.padEnd(52)} ${ratio.toFixed(2)}:1  (min ${minimum})`);
      expect(ratio).toBeGreaterThanOrEqual(minimum);
    });
  }
});
