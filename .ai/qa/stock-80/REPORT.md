<!-- om-auto-qa-pr:stock-104 -->
🤖 `om-auto-qa-pr` — browser evidence at `901e8a8` (evidence only; manual QA approval remains required).

**Observed:** Test demo stock starts at 500 kg. Posting `-0.25 t` with a reason records `-250.000000 kg` and leaves 250 kg, with source/entered factor/actor preserved. A Polish `-0.3 t` request is refused with material/location IDs and exact available 250 / requested 300 kg; the form retains its input and the balance remains 250 kg. Polish audit names the action and snapshot fields. At 390 × 844 the stock page fits the viewport; reasons wrap and the correction control remains reachable.

Automated UI/API verification: final production standalone full suite **219 passed**, 27 files, one Docker-only startup test skipped (247.66 s). Five stock scenarios cover both roles and UI/API, idempotent replay, current UTC date, no-negative rollback, tenant isolation, stale open form after read-only activation, permanent material locks and nonzero deactivation guards. New Polish refusal/audit assertions passed. Actual `npm run dev` flow was also exercised before the final production run.

Environment: `om-prepare-test-env`'s default Docker launch was attempted but this macOS account has no working Docker socket. Supported `CPG_BASE_URL` fallback used the built standalone server, copied static/public assets and fresh disposable data. Screenshots use a separate disposable database. Docker image/startup remains checked by GitHub CI. Browser automation had intermittent streamed-page readiness waits; final state was inspected directly. No production data used.

**Manual QA priorities:**
- P0: sign in as each role; post a reasoned negative correction; refuse an overdraw without new balance/history/audit. Make the tenant read-only while a correction form is open; refuse submit. Confirm another tenant's references cannot be posted.
- P1: enter an alternate unit and inspect its recorded factor; replay the same API key once; verify stock-dependent deactivation and permanent unit/type locks. Check Polish refusals, audit and a narrow viewport.
- P2: inspect zero/no-history and missing-master states, source details and help.

Risk-high schema and tenant write change: no `qa-approved` or `qa-self-verified` label is applied by this run.

![01-demo-balance](https://raw.githubusercontent.com/Piotr12/CPG/qa-evidence/pr-104-stock/01-demo-balance.png)

![02-correction-form](https://raw.githubusercontent.com/Piotr12/CPG/qa-evidence/pr-104-stock/02-correction-form.png)

![03-posted-correction](https://raw.githubusercontent.com/Piotr12/CPG/qa-evidence/pr-104-stock/03-posted-correction.png)

![04-polish-overdraw](https://raw.githubusercontent.com/Piotr12/CPG/qa-evidence/pr-104-stock/04-polish-overdraw.png)

![05-mobile-ledger](https://raw.githubusercontent.com/Piotr12/CPG/qa-evidence/pr-104-stock/05-mobile-ledger.png)

![06-polish-audit](https://raw.githubusercontent.com/Piotr12/CPG/qa-evidence/pr-104-stock/06-polish-audit.png)

![07-polish-audit-details](https://raw.githubusercontent.com/Piotr12/CPG/qa-evidence/pr-104-stock/07-polish-audit-details.png)

## Final refinement validation
Runtime source836e902 retains the pictured UI and adds import row-context preservation plus missing-context fallback. Final lint/typecheck/build passed; 297 files/1,969 unit tests at100%; full standalone browser suite219passed, oneDocker-onlystartupskip(255.02s). Fresh independent re-review APPROVE verified Materials/Locations dry-runs across JSON and EN/PL with distinctIDs/exact2.000001kg; parent reran its116tests/probe successfully. Earlier901e8a8 passed all DockerCI jobs. Final-headCI remains a separate publication gate, with risk-high manualQA required beforemerge.
