import { createHash } from "node:crypto";
import { strFromU8, strToU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { archiveHash, buildArchive } from "./archive";

const file = (path: string, text: string) => ({ path, bytes: strToU8(text) });

/** The 16-bit DOS date and time, and the external attributes, of each central-directory entry. */
function centralEntries(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const entries: { name: string; time: number; date: number; attrs: number; madeBy: number }[] = [];
  for (let at = 0; at < zip.length - 4; at++) {
    if (view.getUint32(at, true) !== 0x02014b50) continue;
    const nameLength = view.getUint16(at + 28, true);
    entries.push({
      madeBy: view.getUint8(at + 5),
      time: view.getUint16(at + 12, true),
      date: view.getUint16(at + 14, true),
      attrs: view.getUint32(at + 38, true),
      name: strFromU8(zip.subarray(at + 46, at + 46 + nameLength)),
    });
  }
  return entries;
}

describe("buildArchive", () => {
  it("holds every file with its content", () => {
    const entries = unzipSync(buildArchive([file("a/one.txt", "one"), file("b.txt", "two")]));

    expect(Object.keys(entries).sort()).toEqual(["a/one.txt", "b.txt"]);
    expect(strFromU8(entries["a/one.txt"])).toBe("one");
    expect(strFromU8(entries["b.txt"])).toBe("two");
  });

  it("gives the same bytes for the same files in any order, built on different days", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
      const first = buildArchive([file("z.txt", "z"), file("a.txt", "a")]);
      vi.setSystemTime(new Date("2026-11-23T17:31:07Z"));
      const second = buildArchive([file("a.txt", "a"), file("z.txt", "z")]);

      expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sorts the entries by path, stamps them 1980-01-01 00:00 and marks them rw-r--r-- Unix files", () => {
    const entries = centralEntries(buildArchive([file("z.txt", "z"), file("a/b.txt", "b"), file("a.txt", "a")]));

    expect(entries.map(({ name }) => name)).toEqual(["a.txt", "a/b.txt", "z.txt"]);
    // DOS date: (1980 - 1980) << 9 | 1 << 5 | 1; time 00:00:00.
    expect(entries.every(({ date, time }) => date === 0x21 && time === 0)).toBe(true);
    expect(entries.every(({ madeBy, attrs }) => madeBy === 3 && attrs >>> 16 === 0o100644)).toBe(true);
  });

  it("refuses two files at one path", () => {
    expect(() => buildArchive([file("a.txt", "a"), file("a.txt", "b")])).toThrow("Two archive entries share the path a.txt.");
  });
});

describe("archiveHash", () => {
  it("is the first 12 hex digits of the SHA-256", () => {
    const bytes = strToU8("cpg");

    expect(archiveHash(bytes)).toBe(createHash("sha256").update("cpg").digest("hex").slice(0, 12));
    expect(archiveHash(bytes)).toMatch(/^[0-9a-f]{12}$/);
  });

  it("changes when one byte of the archive's content does", () => {
    const before = buildArchive([file("a.txt", "abc")]);
    const after = buildArchive([file("a.txt", "abd")]);

    expect(archiveHash(after)).not.toBe(archiveHash(before));
  });
});
