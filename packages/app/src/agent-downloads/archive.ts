import { createHash } from "node:crypto";
import { zipSync, type Zippable, type ZipOptions } from "fflate";

/** One file of an archive: its path inside the zip, with `/` separators, and its content. */
export interface ArchiveFile {
  path: string;
  bytes: Uint8Array;
}

/**
 * Every entry's timestamp: the earliest a zip can hold. A zip stores local wall-clock fields, which
 * fflate reads from the `Date`'s local time, so the local constructor writes 1980-01-01 00:00 in every
 * time zone.
 */
const FIXED_MTIME = new Date(1980, 0, 1);

/** Unix (`os: 3`) regular files, `rw-r--r--`, in the high half of the external attributes. */
const ENTRY_OPTIONS: ZipOptions = { mtime: FIXED_MTIME, os: 3, attrs: 0o100644 << 16 };

/** Hex digits of the SHA-256 that name an archive: enough to tell versions apart in a URL. */
export const ARCHIVE_HASH_LENGTH = 12;

/**
 * Zips `files` deterministically (spec A9): entries sorted by path, one fixed timestamp and fixed
 * permissions, so the same files give the same bytes, and the same hash, in every process.
 */
export function buildArchive(files: readonly ArchiveFile[]): Uint8Array {
  const entries: Zippable = {};
  for (const { path, bytes } of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    if (path in entries) throw new Error(`Two archive entries share the path ${path}.`);
    entries[path] = [bytes, ENTRY_OPTIONS];
  }
  return zipSync(entries);
}

/** The first {@link ARCHIVE_HASH_LENGTH} hex digits of the SHA-256 of `bytes`. */
export function archiveHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, ARCHIVE_HASH_LENGTH);
}
