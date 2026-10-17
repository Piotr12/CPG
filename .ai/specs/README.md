# specs

Specifications for spec-driven development (SDD). Each spec describes a feature or change **before** it is implemented; agents implement against it and treat it as the source of truth.

- **Naming:** `YYYY-MM-DD-slug.md` — creation date + short kebab-case slug, e.g. `2026-10-17-user-login.md`.
- **Lifecycle:**
  - `specs/` — active specs, not yet fully implemented.
  - [`implemented/`](implemented/) — specs that have been fully implemented and verified.
  - [`archive/`](archive/) — specs that were superseded, abandoned or rejected.
- Specs are moved with `git mv` and keep their original file name.

See [`AGENTS.md`](../../AGENTS.md) for the spec template and the rules agents follow.
