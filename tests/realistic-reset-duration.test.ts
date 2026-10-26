// A realistic Test reset took 65.5 s on the CI runner, and the server answers nobody but the health
// check until it commits (#185, #78). kamal-proxy answers 504 to any request the app hasn't answered within
// its response timeout, 30 s unless config/deploy.yml says otherwise: the reset, which still commits,
// and every request queued behind it would fail at the proxy. What the admin is told must cover it too.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { helpTopics } from "../packages/app/src/help/topics";
import { en } from "../packages/app/src/i18n/messages/en";
import { pl } from "../packages/app/src/i18n/messages/pl";
import { WRITE_GATE_WAIT_MS } from "../packages/db/src/write-gate";
import { proxyResponseTimeoutSeconds } from "./deploy-config";

/** The slowest realistic reset measured so far: the CI run of PR #261 (#237), on the single-site daily dataset. */
const SLOWEST_REALISTIC_RESET_SECONDS = 65.5;

test("kamal-proxy waits at least twice the slowest realistic reset before answering 504", () => {
  const timeout = proxyResponseTimeoutSeconds();
  assert.ok(timeout >= 2 * SLOWEST_REALISTIC_RESET_SECONDS, `response_timeout ${timeout} s < 2 × ${SLOWEST_REALISTIC_RESET_SECONDS} s`);
});

test("a write queued behind a reset waits for it exactly as long as kamal-proxy waits for the answer", () => {
  // A shorter gate would let the queued write reach SQLite mid-reset and fail "database is locked"; a longer
  // one would keep working on a request the proxy has already answered 504.
  assert.equal(WRITE_GATE_WAIT_MS, proxyResponseTimeoutSeconds() * 1000);
});

test("the image keeps an idle connection open for an hour, so a request queued behind a reset isn't closed unread", () => {
  // server.js reads KEEP_ALIVE_TIMEOUT (ms). With Node's 5 s default, a request kamal-proxy sent on a pooled
  // connection during the reset found it closed as soon as the reset committed: ECONNRESET, a 502 for any write.
  const runner = readFileSync(join(import.meta.dirname, "..", "Dockerfile"), "utf8").split(/^FROM /m).find((stage) => stage.startsWith("base AS runner"));
  const keepAlive = Number(/\bKEEP_ALIVE_TIMEOUT=(\d+)/.exec(runner ?? "")?.[1]);
  assert.ok(keepAlive >= 3_600_000, `KEEP_ALIVE_TIMEOUT ${keepAlive} ms < 1 h`);
});

test("the reset dialog and its help say a minute or two, in EN and PL, which the slowest reset and the proxy's wait both fit", () => {
  // A minute or two covers the slowest measured reset, 65.5 s, and stays well inside the proxy's wait.
  const resetHelp = (locale: "en" | "pl") => helpTopics(locale).find(({ id }) => id === "admin-home")!.body.join(" ");

  assert.match(en.admin.reset.slow, /can take a minute or two,/);
  assert.match(resetHelp("en"), /Realistic, two years of history, can take a minute or two,/);
  assert.match(pl.admin.reset.slow, /może potrwać minutę lub dwie,/);
  assert.match(resetHelp("pl"), /z dwoma latami historii, zapisuje się minutę lub dwie,/);
});
