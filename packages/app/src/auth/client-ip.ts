import { UNKNOWN_CLIENT } from "@cpg/core";

/**
 * The client's IP for throttling: the first `X-Forwarded-For` entry. In production kamal-proxy sets
 * that header itself and never passes a client-supplied one through (`forward_headers: false`).
 */
export function clientIpFrom(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || UNKNOWN_CLIENT;
}
