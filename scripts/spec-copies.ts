/**
 * The `.ai/` file-name rule (AGENTS.md) and the active spec copies a squash merge can leave behind (#351).
 * Node runs this file directly in CI (`delete-spec-copies.ts`), so it imports only `node:` modules and keeps
 * to syntax Node can strip: no enums, namespaces or parameter properties (`delete-spec-copies.test.ts` runs it).
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const NAME = /^(\d{4})-(\d{2})-(\d{2})--(\d{2})(\d{2})UTC-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

/** Whether a file name is `YYYY-MM-DD--HHMMUTC-slug.md` with a real UTC date and time (no 2026-02-30, no 2460UTC). */
export function isValidName(fileName: string): boolean {
  const match = NAME.exec(fileName);
  if (match === null) return false;
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute
  );
}

/** The folders a finished spec moves to. A spec lives in exactly one place: active, or one of these. */
export const DONE_FOLDERS = ["implemented", "archive"];

function specNames(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isValidName(entry.name))
    .map((entry) => entry.name);
}

/**
 * The active specs (directly in `specsDir`) whose name is also in `implemented/` or `archive/`, sorted. A spec PR's
 * squash merge re-adds such a copy after its implementation PR moved the spec (#273, #339–#346, #355/#356). The
 * finished copy is the one to keep, so these names are the files to delete. A missing folder holds nothing.
 */
export function activeCopies(specsDir: string): string[] {
  const done = new Set(
    DONE_FOLDERS.map((folder) => join(specsDir, folder))
      .filter((dir) => existsSync(dir))
      .flatMap(specNames),
  );
  return specNames(specsDir)
    .filter((name) => done.has(name))
    .sort();
}
