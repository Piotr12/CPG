import { describe, expect, it } from "vitest";
import { auditChanges, formatAuditValue } from "./audit-changes";

describe("auditChanges", () => {
  it("lists every new value of a create", () => {
    expect(auditChanges(null, { username: "alice", role: "user", active: true })).toEqual([
      { kind: "set", field: "username", value: "alice" },
      { kind: "set", field: "role", value: "user" },
      { kind: "set", field: "active", value: true },
    ]);
  });

  it("lists the old values of a removal", () => {
    expect(auditChanges({ code: "M1" }, null)).toEqual([{ kind: "set", field: "code", value: "M1" }]);
  });

  it("lists only the fields an edit changed, including ones added or dropped", () => {
    expect(auditChanges({ locale: "en", theme: "light", old: 1 }, { locale: "en", theme: "dark", added: "x" })).toEqual([
      { kind: "changed", field: "theme", before: "light", after: "dark" },
      { kind: "changed", field: "old", before: 1, after: null },
      { kind: "changed", field: "added", before: null, after: "x" },
    ]);
  });

  it("lists nothing for an entry without snapshots", () => {
    expect(auditChanges(null, null)).toEqual([]);
  });
});

describe("formatAuditValue", () => {
  it.each([
    ["alice", "alice"],
    [true, "true"],
    [0, "0"],
    [null, "—"],
  ] as const)("shows %j as %j", (value, text) => {
    expect(formatAuditValue(value)).toBe(text);
  });
});
