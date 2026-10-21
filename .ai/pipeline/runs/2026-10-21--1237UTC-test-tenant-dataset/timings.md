# Seed timing and the reset's lock window (Step 4.5, spec Q16 and "Seed duration" in Risks)

**When:** 2026-10-21T14:49:19Z
**Where:** the production standalone build of this PR (`node packages/app/server.js`, fresh copy and fresh `DATA_DIR` per start) on the dev Mac (Apple silicon), dataset for 2026-10-21 (3,549 documents, 3,748 movements). Docker isn't available on this machine, so the production **image** on the CI runner could not be timed directly. CI starts that image for the integration suite, whose reset tests allow 60 s and whose container startup wait is 5 min; a CI pass is the image-level evidence.

## Seed duration (budget ≤ 15 s)

| Run | Duration |
|---|---|
| Spike, in-process, one transaction (Step 3.2) | 8.7 s, 8.1 s |
| Startup seed, standalone server, four fresh starts (startup log line) | 9.0 s, 9.3 s, 9.2 s, 9.2 s |
| `POST /api/tenants/test/reset` (wipe + generate + seed, end to end) | 9.55 s, 9.36 s, 10.18 s, 9.60 s |

All within the 15 s budget locally. The CI runner is likely slower than this machine; if the image misses the budget, the first lever in the spec's Risks is fewer queries per document on the seed path.

## A Prod write (and other requests) during a reset

Each probe was issued about 2 s after a reset started:

| Request | Outcome |
|---|---|
| Prod write through the API: `POST /api/tenants/prod/locations` (bearer token) | **200 after 7.68 s**: it waited for the reset, then succeeded |
| Prod write through the UI: Create location (a server action) | **succeeded after 7.67 s**: the dialog closed, and the location exists |
| `GET /up` | 200 after 8.27 s |
| `GET /api/tenants/prod/materials`, `GET /login`, `GET /favicon.ico` (in parallel) | 200 after 7.73 s each |

No request failed, and the server log shows no "database is locked". **What the spec expected was different.** Q16 expected that reads proceed (WAL) and that writes from other bundles block for up to the 5 s busy timeout and then fail. What happens is that **the whole server answers nothing else while the reset runs** (about 10 s), whatever the request: reads, writes, pages, even static files. Everything queued completes, successfully, once the reset commits.

Why: better-sqlite3 executes every statement synchronously, so the seed's thousands of service calls run back to back in one process. The awaits between them resolve as microtasks and never yield to the event loop's I/O phase. Requests are accepted by the OS and handled after the reset.

Consequence and decision. The reset is an admin-only, deliberate operation on the demonstration tenant, with an owner-accepted budget of ≤ 15 s (Q16). Queuing is *safer* than the interleaving the spec assumed: a write from another bundle that interleaved would busy-wait inside the same process, stalling the reset too, and then fail. So this run keeps the behaviour and documents it: in `BACKWARD_COMPATIBILITY.md` §4 (the reset takes about 10 s and the server answers other requests after it), in the spec's Implementation notes, and on the PR for the owner. `/up` waiting matters only if a deploy's health check coincides with a reset; kamal-proxy then retries. The startup seed runs before the server takes traffic.
