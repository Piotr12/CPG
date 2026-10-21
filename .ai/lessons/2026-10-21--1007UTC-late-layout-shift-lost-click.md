# A late layout shift makes agent-browser's click miss (#128)

**Symptom.** `users.test.ts` › TEN-006 failed once in CI: after a password reset, `signInAsAlice` timed
out waiting for `[data-signed-in-as]`. The rerun passed.

**Reproduction.** TEN-006's flow repeated 24 times on a fresh standalone server, with 36 `yes` processes
saturating 18 cores: 1 or 2 rounds in about 25 stalled. A capture-phase recorder in the page logged
`click FORM` with no `submit` and no action `fetch`. The click had landed beside the button, so nothing
was sent; the session and the reset were not involved.

**Cause.** On a signed-out page the root layout first renders `SidebarSkeleton`, which reserves a left
column, inside `<Suspense>`. Then the visitor bar streams in, the page becomes a column, and the login
card moves (submit button from (592,349) to (464,373) at 1280×720). Idle, React reveals the boundary
before `load`. Under load it does so later, even after the login input has hydrated. agent-browser
measures the element's box and clicks those coordinates, so a click measured before the swap hits the
`<form>`.

**Fix.** `signIn` waits for `signedOutLayoutSettled`: the visitor bar outside `[hidden]` and
`document.fonts.status === "loaded"`. With it, 48 of 48 rounds passed under the same load.

**Diagnosing a lost click.** Before clicking, inject a recorder that logs `click` and `submit` targets
in the capture phase, plus `fetch` calls. To see when an element moves, register an `--init-script`
with `agent-browser open` that logs `getBoundingClientRect()` on every animation frame.
