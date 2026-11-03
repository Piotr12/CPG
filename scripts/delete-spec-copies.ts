/**
 * `node scripts/delete-spec-copies.ts <specsDir>`: deletes the active copy of every spec already in `implemented/`
 * or `archive/`, and prints each deleted path, one per line (nothing when there is none). `spec-copies.yml` runs it
 * on every push to main and commits what it deleted; Deploy runs it on its own checkout to skip such a commit (#351).
 */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { activeCopies } from "./spec-copies.ts";

const specsDir = process.argv[2];
if (specsDir === undefined) {
  console.error("Usage: node scripts/delete-spec-copies.ts <specsDir>");
  process.exitCode = 1;
} else {
  for (const name of activeCopies(specsDir)) {
    const path = join(specsDir, name);
    rmSync(path);
    console.info(path);
  }
}
