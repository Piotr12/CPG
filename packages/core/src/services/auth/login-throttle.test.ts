import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LoginThrottle,
  MAX_BUCKETS,
  MAX_FAILURES_PER_ACCOUNT,
  MAX_FAILURES_PER_CLIENT,
  MAX_FAILURES_PER_IP,
  PRUNE_INTERVAL_MS,
  THROTTLE_WINDOW_MS,
  UNKNOWN_CLIENT,
} from "./login-throttle";

const IP = "203.0.113.7";

function fail(throttle: LoginThrottle, times: number, ip = IP, username = "admin") {
  for (let i = 0; i < times; i++) throttle.recordFailure(ip, username);
}

const bucketsOf = (instance: LoginThrottle) =>
  (instance as unknown as { buckets: Map<string, { failures: number[]; blockedUntil: number }> }).buckets;

describe("LoginThrottle", () => {
  let throttle: LoginThrottle;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T08:00:00Z") });
    throttle = new LoginThrottle();
  });
  afterEach(() => vi.useRealTimers());

  it("allows five failures per client and username, then blocks that pair", () => {
    fail(throttle, MAX_FAILURES_PER_CLIENT - 1);
    expect(throttle.isBlocked(IP, "admin")).toBe(false);

    fail(throttle, 1);
    expect(throttle.isBlocked(IP, "admin")).toBe(true);
    expect(throttle.isBlocked("198.51.100.1", "admin")).toBe(false);
    expect(throttle.isBlocked(IP, "alice")).toBe(false);
  });

  it("lifts the block after the cooldown and forgets old failures", () => {
    fail(throttle, MAX_FAILURES_PER_CLIENT);
    vi.advanceTimersByTime(THROTTLE_WINDOW_MS - 1);
    expect(throttle.isBlocked(IP, "admin")).toBe(true);

    vi.advanceTimersByTime(1);
    expect(throttle.isBlocked(IP, "admin")).toBe(false);
    fail(throttle, MAX_FAILURES_PER_CLIENT - 1);
    expect(throttle.isBlocked(IP, "admin")).toBe(false);
  });

  it("only counts failures inside the rolling window", () => {
    fail(throttle, MAX_FAILURES_PER_CLIENT - 1);
    vi.advanceTimersByTime(THROTTLE_WINDOW_MS);
    fail(throttle, 1);

    expect(throttle.isBlocked(IP, "admin")).toBe(false);
  });

  it("blocks a username attacked from many clients", () => {
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT; i++) throttle.recordFailure(`10.0.0.${i}`, "admin");

    expect(throttle.isBlocked("192.0.2.99", "admin")).toBe(true);
    expect(throttle.isBlocked("192.0.2.99", "alice")).toBe(false);
  });

  it("treats every username alike, so a block never tells an account from an unknown name", () => {
    fail(throttle, MAX_FAILURES_PER_CLIENT, IP, "alice");
    fail(throttle, MAX_FAILURES_PER_CLIENT, IP, "no-such-user");

    expect(throttle.isBlocked(IP, "alice")).toBe(true);
    expect(throttle.isBlocked(IP, "no-such-user")).toBe(true);
    expect([...bucketsOf(throttle).keys()].sort()).toEqual([
      "account:alice",
      "account:no-such-user",
      `client:${IP}:alice`,
      `client:${IP}:no-such-user`,
      `ip:${IP}`,
    ]);
  });

  it("blocks a client spraying many usernames", () => {
    for (let i = 0; i < MAX_FAILURES_PER_IP; i++) throttle.recordFailure(IP, `name-${i}`);

    expect(throttle.isBlocked(IP, "never-tried")).toBe(true);
    expect(throttle.isBlocked("198.51.100.1", "never-tried")).toBe(false);
  });

  it("gives clients without a known address no shared IP-wide bucket", () => {
    for (let i = 0; i < MAX_FAILURES_PER_IP; i++) throttle.recordFailure(UNKNOWN_CLIENT, `name-${i}`);

    expect(throttle.isBlocked(UNKNOWN_CLIENT, "never-tried")).toBe(false);
    expect([...bucketsOf(throttle).keys()].some((key) => key.startsWith("ip:"))).toBe(false);
  });

  it("clears the client's failures on success but keeps the username-wide count", () => {
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT - 1; i++) throttle.recordFailure(`10.0.0.${i}`, "admin");
    fail(throttle, MAX_FAILURES_PER_CLIENT - 1);
    throttle.recordSuccess(IP, "admin");

    fail(throttle, 1, "192.0.2.1");
    expect(throttle.isBlocked(IP, "admin")).toBe(true);
  });

  it("forgets a client's failures for that username after a success", () => {
    fail(throttle, MAX_FAILURES_PER_CLIENT - 1, IP, "alice");
    throttle.recordSuccess(IP, "alice");
    fail(throttle, MAX_FAILURES_PER_CLIENT - 1, IP, "alice");

    expect(throttle.isBlocked(IP, "alice")).toBe(false);
  });

  it("prunes buckets that have nothing left to remember", () => {
    for (let i = 0; i < 1000; i++) throttle.recordFailure(`10.1.${i >> 8}.${i & 255}`, `user-${i}`);
    expect(bucketsOf(throttle).size).toBe(3000);

    vi.advanceTimersByTime(THROTTLE_WINDOW_MS);
    throttle.isBlocked(IP, "admin");

    expect(bucketsOf(throttle).size).toBe(0);
  });

  it("sweeps at most once per prune interval", () => {
    fail(throttle, 1, "10.9.9.9", "alice");
    vi.advanceTimersByTime(THROTTLE_WINDOW_MS - 1);
    throttle.isBlocked(IP, "admin"); // sweeps now, while the failure is still recent

    vi.advanceTimersByTime(1);
    throttle.isBlocked(IP, "admin"); // expired, but the last sweep was just now
    expect(bucketsOf(throttle).size).toBe(3);

    vi.advanceTimersByTime(PRUNE_INTERVAL_MS);
    throttle.isBlocked(IP, "admin");
    expect(bucketsOf(throttle).size).toBe(0);
  });

  it("keeps a username and a client blocked however many buckets a flood creates", () => {
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT; i++) throttle.recordFailure(`2001:db8::${i}`, "admin");
    for (let i = 0; i < MAX_FAILURES_PER_IP; i++) throttle.recordFailure("198.51.100.9", `spray-${i}`);

    for (let i = 0; i < MAX_BUCKETS; i++) throttle.recordFailure(`flood-${i}`, `flood-${i}`);

    expect(bucketsOf(throttle).size).toBeLessThanOrEqual(MAX_BUCKETS);
    expect(throttle.isBlocked("2001:db8::ffff", "admin")).toBe(true);
    expect(throttle.isBlocked("198.51.100.9", "fresh-name")).toBe(true);
  });

  it("evicts buckets that block nobody before blocked client buckets", () => {
    fail(throttle, MAX_FAILURES_PER_CLIENT, "blocked-client", "alice");
    for (let i = 0; i < MAX_BUCKETS; i++) throttle.recordFailure(`client-${i}`, "bob");

    expect(throttle.isBlocked("blocked-client", "alice")).toBe(true);
    expect(bucketsOf(throttle).has("client:client-0:bob")).toBe(false);
    expect(bucketsOf(throttle).size).toBe(MAX_BUCKETS);
  });

  it("falls back to the oldest blocked client bucket when nothing else can go", () => {
    const buckets = bucketsOf(throttle);
    const blocked = () => ({ failures: [Date.now()], blockedUntil: Date.now() + THROTTLE_WINDOW_MS });
    buckets.set("client:old:x", blocked());
    for (let i = 1; i < MAX_BUCKETS; i++) buckets.set(`account:held-${i}`, blocked());

    throttle.recordFailure("new-client", "x");

    expect(buckets.has("client:old:x")).toBe(false);
    expect(buckets.has("account:held-1")).toBe(true);
  });

  it("stops evicting when only blocked username and IP buckets are left", () => {
    const buckets = bucketsOf(throttle);
    const blocked = () => ({ failures: [Date.now()], blockedUntil: Date.now() + THROTTLE_WINDOW_MS });
    for (let i = 0; i < MAX_BUCKETS; i++) buckets.set(`account:held-${i}`, blocked());

    throttle.recordFailure("new-client", "x");

    expect(buckets.size).toBe(MAX_BUCKETS + 3);
    expect(throttle.isBlocked("new-client", "x")).toBe(false);
  });
});
