/** Failures are counted over this rolling window, and a block lasts this long too. */
export const THROTTLE_WINDOW_MS = 15 * 60_000;
/** Failures one client may make against one username inside the window. */
export const MAX_FAILURES_PER_CLIENT = 5;
/** Failures from any client against one username inside the window: stops many-IP guessing. */
export const MAX_FAILURES_PER_ACCOUNT = 20;
/** Failures one client may make across all usernames inside the window: stops name spraying. */
export const MAX_FAILURES_PER_IP = 50;
/**
 * What callers pass when a request has no usable client address. It isn't an identity, so it gets
 * no IP-wide bucket: one would lock out every such client at once.
 */
export const UNKNOWN_CLIENT = "unknown";
/** Memory ceiling: past it the least recently active buckets are dropped (~a few MB at worst). */
export const MAX_BUCKETS = 10_000;
/** Expired buckets are swept at most this often, so a check never scans the map every time. */
export const PRUNE_INTERVAL_MS = 60_000;

interface Bucket {
  failures: number[];
  blockedUntil: number;
}

interface Keys {
  client: string;
  account: string;
  ip?: string;
}

/**
 * In-memory brute-force protection for sign-in, counted per client IP + username, per username
 * and per client IP (except `UNKNOWN_CLIENT`). Buckets are keyed by the username as submitted (normalized by the caller),
 * whether or not that account exists, so being blocked never reveals which usernames exist.
 *
 * Past `MAX_BUCKETS` the least recently active buckets that aren't blocking anyone are dropped,
 * then the oldest blocked per-client ones. Blocked username and IP buckets are never dropped, so
 * flooding the map can't lift those blocks; each costs an attacker 20 or 50 failures and expires
 * with the window.
 * Counters live in the process: they reset on restart and aren't shared between instances, which
 * is fine for CPG's single server.
 */
export class LoginThrottle {
  private readonly buckets = new Map<string, Bucket>();
  private lastPrunedAt = 0;

  /** Whether sign-in attempts from `clientIp` for `username` are blocked. */
  isBlocked(clientIp: string, username: string): boolean {
    const now = Date.now();
    this.prune(now);
    return allKeys(this.keys(clientIp, username)).some((key) => (this.buckets.get(key)?.blockedUntil ?? 0) > now);
  }

  recordFailure(clientIp: string, username: string): void {
    const now = Date.now();
    const keys = this.keys(clientIp, username);
    this.count(keys.client, MAX_FAILURES_PER_CLIENT, now);
    this.count(keys.account, MAX_FAILURES_PER_ACCOUNT, now);
    if (keys.ip) this.count(keys.ip, MAX_FAILURES_PER_IP, now);
    const counted = new Set(allKeys(keys));
    while (this.buckets.size > MAX_BUCKETS && this.evictOne(now, counted));
  }

  /** A successful sign-in forgets this client's failures for the username; the wider counts stay. */
  recordSuccess(clientIp: string, username: string): void {
    this.buckets.delete(this.keys(clientIp, username).client);
  }

  private keys(clientIp: string, username: string): Keys {
    // Without an address every client shares `client:unknown:<name>`: stricter than the account cap,
    // and only possible when bypassing kamal-proxy, which always sets X-Forwarded-For.
    const keys: Keys = { client: `client:${clientIp}:${username}`, account: `account:${username}` };
    if (clientIp !== UNKNOWN_CLIENT) keys.ip = `ip:${clientIp}`;
    return keys;
  }

  private count(key: string, limit: number, now: number): void {
    const bucket = this.buckets.get(key) ?? { failures: [], blockedUntil: 0 };
    bucket.failures = [...bucket.failures.filter((at) => now - at < THROTTLE_WINDOW_MS), now];
    if (bucket.failures.length >= limit) bucket.blockedUntil = now + THROTTLE_WINDOW_MS;
    // Re-insert so Map order stays oldest-activity first.
    this.buckets.delete(key);
    this.buckets.set(key, bucket);
  }

  /**
   * Drops the least recently active bucket outside `keep` that isn't blocking anyone, else the
   * oldest blocked per-client bucket. Returns false when only protected buckets are left.
   */
  private evictOne(now: number, keep: Set<string>): boolean {
    let oldestBlockedClient: string | undefined;
    for (const [key, bucket] of this.buckets) {
      if (keep.has(key)) continue;
      if (bucket.blockedUntil <= now) return this.buckets.delete(key);
      if (!oldestBlockedClient && key.startsWith("client:")) oldestBlockedClient = key;
    }
    return oldestBlockedClient !== undefined && this.buckets.delete(oldestBlockedClient);
  }

  private prune(now: number): void {
    if (now - this.lastPrunedAt < PRUNE_INTERVAL_MS) return;
    this.lastPrunedAt = now;
    for (const [key, bucket] of this.buckets) {
      const isRecent = bucket.failures.some((at) => now - at < THROTTLE_WINDOW_MS);
      if (!isRecent && bucket.blockedUntil <= now) this.buckets.delete(key);
    }
  }
}

function allKeys({ client, account, ip }: Keys): string[] {
  return ip ? [client, account, ip] : [client, account];
}
