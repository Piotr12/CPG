/** Failures are counted over this rolling window, and a block lasts this long too. */
export const THROTTLE_WINDOW_MS = 15 * 60_000;
/** Failures one client may make against one account (or unknown names) inside the window. */
export const MAX_FAILURES_PER_CLIENT = 5;
/** Failures from any client against one account inside the window: stops many-IP guessing. */
export const MAX_FAILURES_PER_ACCOUNT = 20;

interface Bucket {
  failures: number[];
  blockedUntil: number;
}

/**
 * In-memory brute-force protection for sign-in, per client IP + account and per account. Unknown
 * usernames all share the client's `*` bucket, so random names can't grow the map without bound.
 * Counters live in the process: they reset on restart and aren't shared between instances, which
 * is fine for CPG's single server.
 */
export class LoginThrottle {
  private readonly buckets = new Map<string, Bucket>();

  /** Whether sign-in attempts from `clientIp` for `account` (null: an unknown username) are blocked. */
  isBlocked(clientIp: string, account: string | null): boolean {
    const now = Date.now();
    this.prune(now);
    return this.keys(clientIp, account).some((key) => (this.buckets.get(key)?.blockedUntil ?? 0) > now);
  }

  recordFailure(clientIp: string, account: string | null): void {
    const now = Date.now();
    const [clientKey, accountKey] = this.keys(clientIp, account);
    this.count(clientKey, MAX_FAILURES_PER_CLIENT, now);
    if (accountKey) this.count(accountKey, MAX_FAILURES_PER_ACCOUNT, now);
  }

  /** A successful sign-in forgets this client's failures; the account-wide count stays. */
  recordSuccess(clientIp: string, account: string | null): void {
    this.buckets.delete(this.keys(clientIp, account)[0]);
  }

  private keys(clientIp: string, account: string | null): string[] {
    const clientKey = `client:${clientIp}:${account ?? "*"}`;
    return account ? [clientKey, `account:${account}`] : [clientKey];
  }

  private count(key: string, limit: number, now: number): void {
    const bucket = this.buckets.get(key) ?? { failures: [], blockedUntil: 0 };
    bucket.failures = [...bucket.failures.filter((at) => now - at < THROTTLE_WINDOW_MS), now];
    if (bucket.failures.length >= limit) bucket.blockedUntil = now + THROTTLE_WINDOW_MS;
    this.buckets.set(key, bucket);
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      const isRecent = bucket.failures.some((at) => now - at < THROTTLE_WINDOW_MS);
      if (!isRecent && bucket.blockedUntil <= now) this.buckets.delete(key);
    }
  }
}
