# D03 — The first slice also builds the cross-cutting foundations
- Date, owner: 2026-10-19, Piotr12 (product owner, confirmed in the om-discover session)
- Context and the options weighed: agent recommendation (origin: om-discover session). Option A: build login with the single admin and user management, Test/Prod tenant scoping, append-only audit, and the UI/API pattern with tokens, idempotency keys and the Test generation precondition together with materials and BOMs; translations and help grow screen by screen. Option B: materials and BOMs first, foundations later. Trade-off presented: a slower first visible screen versus retrofitting tenant scoping, audit and idempotency into every service later.
- Decision and why: owner chose option A: "Yeap, let's have foundations done as part of the first slice."
- Consequences, and what would make us revisit it: authentication needs its own spec first (.ai/docs/engineering-standards.md requires it before anything sensitive goes into /admin). Whether the Test reset and its demonstration dataset are built in slice 1 or grow with each slice was not discussed (open question in the brief).
- Status: active
