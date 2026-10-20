import { createHash } from "node:crypto";
import { canonicalJson } from "../json/canonical-json";

/**
 * An import's preview token (spec `2026-10-20--0908UTC-master-data-bom-import`, Q7): the SHA-256 of
 * the canonical JSON of everything its outcome depends on (the tenant's generation, the normalized
 * rows, every row's outcome and the versions of the records the rows name or write). A commit
 * re-runs the import and applies it only when it computes the same token. A fingerprint, not a
 * signature: the commit's re-run, not the token, enforces the rules.
 */
export function previewToken(content: unknown): string {
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}
