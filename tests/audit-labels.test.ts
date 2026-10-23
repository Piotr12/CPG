import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "../packages/app/src/i18n/messages/en";
import { pl } from "../packages/app/src/i18n/messages/pl";
import { GLOBAL_SUBJECT_TYPES, TENANT_SUBJECT_TYPES } from "../packages/app/src/components/audit/subject-types";
import { AUDIT_FIELDS, AUDIT_LINE_FIELDS, AUDIT_MOVEMENT_ROLES } from "../packages/core/src/domain/audit/audit-fields";

/**
 * Every audit action `core` can record has a name in both languages (UX-022), so neither audit ever
 * shows a raw `concept.entity.action` ID. A new producer, or a new verb of an existing one, fails here
 * until it gets its English and Polish labels.
 *
 * The scan reads the services' source. It finds literal action IDs, and templated ones built by a helper
 * such as `entry(action, …)` → `` `forecasts.forecast.${action}` ``, whose verbs are the string literals
 * its callers pass first (ternaries included), as well as named-record kinds (`actionPrefix`).
 */
const SERVICES = path.join(__dirname, "..", "packages", "core", "src", "services");
const ACTION = "[a-z][a-z-]*\\.[a-z][a-z-]*";

function sources(): { file: string; text: string }[] {
  return readdirSync(SERVICES, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => ({ file, text: readFileSync(path.join(SERVICES, file), "utf8") }));
}

/** The verbs an expression names: both branches of a ternary, else its string literals. */
function verbsIn(expression: string): string[] {
  const branches = [...expression.matchAll(/[?:]\s*"([a-z][a-z-]*)"/g)].map((match) => match[1]);
  return branches.length > 0 ? branches : [...expression.matchAll(/"([a-z][a-z-]*)"/g)].map((match) => match[1]);
}

/**
 * The verbs the calls of `helper` pass as its first argument: in the file that defines it, and, for an
 * exported helper, in every file that imports it. Helper names repeat across files (`entry`).
 */
function verbsPassedTo(helper: string, home: string, files: { file: string; text: string }[]): string[] {
  const exported = new RegExp(`export\\s+function\\s+${helper}\\b`).test(files.find(({ file }) => file === home)!.text);
  const importer = new RegExp(`import\\s*\\{[^}]*\\b${helper}\\b[^}]*\\}`);
  const callers = files.filter(({ file, text }) => file === home || (exported && importer.test(text)));
  const call = new RegExp(`\\b(?:this\\.)?${helper}\\(\\s*([^,()]+(?:\\([^()]*\\))?[^,()]*),`, "g");
  return callers.flatMap(({ text }) => [...text.matchAll(call)].flatMap((match) => verbsIn(match[1])));
}

/** Verbs a file names outside the helper calls: `const action = … ? "a" : "b"`, and action maps (`POSTED_ACTION`). */
function verbsDeclaredIn(text: string): string[] {
  const variables = [...text.matchAll(/const action = ([^;]+);/g)].flatMap((match) => verbsIn(match[1]));
  const maps = [...text.matchAll(/[A-Z_]*ACTION[A-Z_]*\b[^=]*=\s*\{([^}]*)\}/g)].flatMap((match) =>
    [...match[1].matchAll(/:\s*"([a-z][a-z-]*)"/g)].map((verb) => verb[1]),
  );
  return [...variables, ...maps];
}

function recordableActions(): Set<string> {
  const files = sources();
  const actions = new Set<string>();
  const prefixes = files.flatMap(({ text }) => [...text.matchAll(new RegExp(`actionPrefix: "(${ACTION})"`, "g"))].map((match) => match[1]));
  for (const { file, text } of files) {
    // Whole IDs where an action is written: `action: "…"`, an `…Entry("…", …)` helper's first argument, `const action = …`.
    const whole = new RegExp(`"(${ACTION}\\.[a-z][a-z-]*)"`, "g");
    const contexts = [
      ...text.matchAll(/action: ("[^"]*")/g),
      ...text.matchAll(/\w+Entry\(\s*([^,]+),/g),
      ...text.matchAll(/const action = ([^;]+);/g),
    ].map((match) => match[1]);
    for (const context of contexts) for (const match of context.matchAll(whole)) actions.add(match[1]);
    for (const match of text.matchAll(new RegExp(`\`(${ACTION}|\\$\\{[\\w.]*actionPrefix\\})\\.\\$\\{([^}]*)\\}\``, "g"))) {
      const [, prefix, interpolation] = match;
      const owners = prefix.includes("actionPrefix") ? prefixes : [prefix];
      // A ternary inside the template names its verbs itself; otherwise the enclosing helper's callers do.
      const inline = verbsIn(interpolation);
      const helper = [...text.slice(0, match.index).matchAll(/(?:function|private)\s+(\w+)\s*\(/g)].pop()?.[1];
      const verbs = inline.length > 0 ? inline : [...(helper ? verbsPassedTo(helper, file, files) : []), ...verbsDeclaredIn(text)];
      for (const owner of owners) for (const verb of verbs) actions.add(`${owner}.${verb}`);
    }
  }
  return actions;
}

/** Every subject type `core` records: subjects written `{ type: "…", id: … }`, and named-record kinds' `subjectType: "…"`. */
function recordableSubjectTypes(): Set<string> {
  return new Set(
    sources().flatMap(({ text }) => [
      ...[...text.matchAll(/\{\s*type: "([A-Z]\w*)",\s*id:/g)].map((match) => match[1]),
      ...[...text.matchAll(/subjectType: "([A-Z]\w*)"/g)].map((match) => match[1]),
    ]),
  );
}

describe("audit record types", () => {
  const types = recordableSubjectTypes();

  it("finds the subject types of every kind of producer (the scan itself works)", () => {
    expect([...types]).toEqual(expect.arrayContaining(["User", "ApiToken", "Tenant", "Location", "StockMovement", "PurchaseOrder", "Forecast"]));
  });

  it("offers every record type core records in one audit's Record type filter, named in both languages", () => {
    const offered = new Set<string>([...GLOBAL_SUBJECT_TYPES, ...TENANT_SUBJECT_TYPES]);
    expect([...types].filter((type) => !offered.has(type)).sort()).toEqual([]);
    expect([...offered].filter((type) => !types.has(type)).sort()).toEqual([]);
  });
});

describe("audit action labels", () => {
  const actions = recordableActions();

  it("finds the actions of every kind of producer (the scan itself works)", () => {
    expect(actions.size).toBeGreaterThanOrEqual(80);
    expect([...actions]).toEqual(
      expect.arrayContaining([
        "stock.movement.posted",
        "users.user.password-reset",
        "locations.location.deactivated",
        "materials.material-conversion.removed",
        "forecasts.forecast.updated",
        "transfers.transfer.written-off",
        "customer-orders.customer-order.closed-early",
        "production-orders.production-order.cancelled",
      ]),
    );
  });

  it.each([
    ["English", en],
    ["Polish", pl],
  ])("names every recordable action in %s", (_language, messages) => {
    const named = new Set(Object.keys(messages.audit.actions));
    expect([...actions].filter((action) => !named.has(action)).sort()).toEqual([]);
  });

  it("names no action that nothing records any more", () => {
    expect(Object.keys(en.audit.actions).filter((action) => !actions.has(action)).sort()).toEqual([]);
  });
});

/**
 * Every field a snapshot may carry has a name in both languages (UX-022), so neither audit shows a stored
 * key. The recorder refuses a field `AUDIT_FIELDS` doesn't list, so a service that records a new one fails
 * its own tests until it is listed, and then fails here until it is named (#145). A field nothing records
 * any more keeps its labels: stored entries are never rewritten (R08), so they still show it.
 */
describe("audit field labels", () => {
  it.each([
    ["English", en],
    ["Polish", pl],
  ])("names every field a snapshot may carry in %s: plain, per line and per reversed movement", (_language, messages) => {
    const named = new Set(Object.keys(messages.audit.fields));
    expect([...AUDIT_FIELDS, ...AUDIT_LINE_FIELDS].filter((field) => !named.has(field)).sort()).toEqual([]);
    expect(AUDIT_MOVEMENT_ROLES.filter((role) => !messages.audit.movementField[role]?.includes("{movement}"))).toEqual([]);
    expect(messages.audit.lineField).toMatch(/\{line\}.*\{field\}/);
  });
});
