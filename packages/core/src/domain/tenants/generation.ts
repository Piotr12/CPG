import { ConflictError } from "../../http/errors";
import { generationRequired } from "../../http/idempotency-key";

/**
 * Checks a tenant write's dataset generation against the tenant's current one (R07, API-034). A
 * missing generation fails only when `required` (Test through the API); a wrong one always fails,
 * so a client that prepared a write before a Test reset can't apply it to the new dataset (TEN-030).
 */
export function assertCurrentGeneration(current: number, sent: number | null, required: boolean): void {
  if (sent === null) {
    if (required) throw generationRequired();
    return;
  }
  if (sent !== current) {
    throw new ConflictError(
      `This tenant's data was reset since you read it: its generation is now ${current}. Reload and try again.`,
      "GENERATION_STALE",
    );
  }
}
