// A realistic Test reset took 33–42 s on the CI runner, and the server answers nothing else until it
// commits (#185). kamal-proxy answers 504 to any request the app hasn't answered within its response
// timeout, 30 s unless config/deploy.yml says otherwise: the reset, which still commits, and every
// request queued behind it would fail at the proxy. What the admin is told must cover it too.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { helpTopics } from "../packages/app/src/help/topics";
import { en } from "../packages/app/src/i18n/messages/en";
import { pl } from "../packages/app/src/i18n/messages/pl";
import { proxyResponseTimeoutSeconds } from "./deploy-config";

/** The slowest realistic reset measured so far: the CI run of PR #198 (#185). */
const SLOWEST_REALISTIC_RESET_SECONDS = 42.4;

test("kamal-proxy waits at least twice the slowest realistic reset before answering 504", () => {
  const timeout = proxyResponseTimeoutSeconds();
  assert.ok(timeout >= 2 * SLOWEST_REALISTIC_RESET_SECONDS, `response_timeout ${timeout} s < 2 × ${SLOWEST_REALISTIC_RESET_SECONDS} s`);
});

test("the image keeps an idle connection open for an hour, so a request queued behind a reset isn't closed unread", () => {
  // server.js reads KEEP_ALIVE_TIMEOUT (ms). With Node's 5 s default, a request kamal-proxy sent on a pooled
  // connection during the reset found it closed as soon as the reset committed: ECONNRESET, a 502 for any write.
  const runner = readFileSync(join(import.meta.dirname, "..", "Dockerfile"), "utf8").split(/^FROM /m).find((stage) => stage.startsWith("base AS runner"));
  const keepAlive = Number(/\bKEEP_ALIVE_TIMEOUT=(\d+)/.exec(runner ?? "")?.[1]);
  assert.ok(keepAlive >= 3_600_000, `KEEP_ALIVE_TIMEOUT ${keepAlive} ms < 1 h`);
});

test("the reset dialog and its help promise up to a minute, in EN and PL, which the slowest reset fits", () => {
  // Up to a minute covers the slowest measured reset, 42.4 s.
  const resetHelp = (locale: "en" | "pl") => helpTopics(locale).find(({ id }) => id === "admin-home")!.body.join(" ");

  assert.match(en.admin.reset.slow, /takes up to a minute,/);
  assert.match(resetHelp("en"), /Realistic, two years of history, takes up to a minute,/);
  assert.match(pl.admin.reset.slow, /trwa do minuty,/);
  assert.match(resetHelp("pl"), /z dwoma latami historii, zapisuje się do minuty,/);
});
