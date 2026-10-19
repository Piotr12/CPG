import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LoginThrottle,
  MAX_BUCKETS,
  MAX_FAILURES_PER_ACCOUNT,
  MAX_FAILURES_PER_CLIENT,
  PRUNE_INTERVAL_MS,
  THROTTLE_WINDOW_MS,
} from "./login-throttle";

const IP = "203.0.113.7";

function fail(throttle: LoginThrottle, times: number, ip = IP, account: string | null = "admin") {
  for (let i = 0; i < times; i++) throttle.recordFailure(ip, account);
}

describe("LoginThrottle", () => {
  let throttle: LoginThrottle;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T08:00:00Z") });
    throttle = new LoginThrottle();
  });
  afterEach(() => vi.useRealTimers());

  it("allows five failures per client and account, then blocks that pair", () => {
    fail(throttle, MAX_FAILURES_PER_CLIENT - 1);
    expect(throttle.isBlocked(IP, "admin")).toBe(false);

    fail(throttle, 1);
    expect(throttle.isBlocked(IP, "admin")).toBe(true);
    expect(throttle.isBlocked("198.51.100.1", "admin")).toBe(false);
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

  it("blocks an account attacked from many clients", () => {
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT; i++) throttle.recordFailure(`10.0.0.${i}`, "admin");

    expect(throttle.isBlocked("192.0.2.99", "admin")).toBe(true);
    expect(throttle.isBlocked("192.0.2.99", null)).toBe(false);
  });

  it("puts every unknown username from one client in one bucket", () => {
    fail(throttle, MAX_FAILURES_PER_CLIENT, IP, null);

    expect(throttle.isBlocked(IP, null)).toBe(true);
    expect(throttle.isBlocked(IP, "admin")).toBe(false);
  });

  it("clears the client's failures on success but keeps the account-wide count", () => {
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT - 1; i++) throttle.recordFailure(`10.0.0.${i}`, "admin");
    fail(throttle, MAX_FAILURES_PER_CLIENT - 1);
    throttle.recordSuccess(IP, "admin");

    fail(throttle, 1, "192.0.2.1");
    expect(throttle.isBlocked(IP, "admin")).toBe(true);
  });

  it("forgets a client's failures after a success", () => {
    fail(throttle, MAX_FAILURES_PER_CLIENT - 1, IP, null);
    throttle.recordSuccess(IP, null);
    fail(throttle, MAX_FAILURES_PER_CLIENT - 1, IP, null);

    expect(throttle.isBlocked(IP, null)).toBe(false);
  });

  const bucketsOf = (instance: LoginThrottle) =>
    (instance as unknown as { buckets: Map<string, unknown> }).buckets;

  it("prunes buckets that have nothing left to remember", () => {
    for (let i = 0; i < 1000; i++) throttle.recordFailure(`10.1.${i >> 8}.${i & 255}`, null);
    expect(bucketsOf(throttle).size).toBe(1000);

    vi.advanceTimersByTime(THROTTLE_WINDOW_MS);
    throttle.isBlocked(IP, null);

    expect(bucketsOf(throttle).size).toBe(0);
  });

  it("sweeps at most once per prune interval", () => {
    fail(throttle, 1, "10.9.9.9", null);
    vi.advanceTimersByTime(THROTTLE_WINDOW_MS - 1);
    throttle.isBlocked(IP, null); // sweeps now, while the failure is still recent

    vi.advanceTimersByTime(1);
    throttle.isBlocked(IP, null); // expired, but the last sweep was just now
    expect(bucketsOf(throttle).size).toBe(1);

    vi.advanceTimersByTime(PRUNE_INTERVAL_MS);
    throttle.isBlocked(IP, null);
    expect(bucketsOf(throttle).size).toBe(0);
  });

  it("never holds more than MAX_BUCKETS, dropping the least recently active", () => {
    for (let i = 0; i <= MAX_BUCKETS; i++) throttle.recordFailure(`client-${i}`, null);

    expect(bucketsOf(throttle).size).toBe(MAX_BUCKETS);
    expect(bucketsOf(throttle).has("client:client-0:*")).toBe(false);
    expect(bucketsOf(throttle).has(`client:client-${MAX_BUCKETS}:*`)).toBe(true);
  });
});
