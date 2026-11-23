/**
 * `node scripts/delete-stale-blobs.ts <blobsDir>`: keeps each unit shard's newest blob and deletes the rest, printing
 * each deleted path, one per line (nothing when there is none). Each shard writes `blob-<shard>-<attempt>.json`, where
 * `<attempt>` is `github.run_attempt`. Re-running a failed shard leaves the failed attempt's artifact in the run, and
 * `unit-coverage` downloads both, so without this the merge reports the failure the re-run fixed (#399). Files that
 * don't follow the pattern are left alone.
 */
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const BLOB = /^blob-(.+)-(\d+)\.json$/;

/** The blobs a newer attempt of the same shard replaces, in name order. */
function staleBlobs(files: readonly string[]): string[] {
  const newest = new Map<string, number>();
  for (const file of files) {
    const match = BLOB.exec(file);
    if (match) newest.set(match[1], Math.max(newest.get(match[1]) ?? 0, Number(match[2])));
  }
  return files
    .filter((file) => {
      const match = BLOB.exec(file);
      return match !== null && Number(match[2]) < newest.get(match[1])!;
    })
    .sort();
}

const blobsDir = process.argv[2];
if (blobsDir === undefined) {
  console.error("Usage: node scripts/delete-stale-blobs.ts <blobsDir>");
  process.exitCode = 1;
} else {
  for (const name of staleBlobs(readdirSync(blobsDir))) {
    const path = join(blobsDir, name);
    rmSync(path);
    console.info(path);
  }
}
