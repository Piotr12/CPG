# Execution plan: language and theme preferences, the exact footer and in-app help

**Date:** 2026-10-19 09:02 UTC
**Agent:** Claude Code / claude-opus-5-5. `om-auto-fix-issue 18` → feature route → `om-auto-write-spec` (spec PR #31) → `om-auto-implement-spec` → `om-auto-create-pr`
Source doc: .ai/specs/2026-10-19--0855UTC-user-preferences-footer-help.md (design on spec PR #31)
Issue: #18

## Goal

Implement E01-S04 as the spec describes:

- per-account English/Polish and light/dark preferences, stored in a `user_preference` table;
- the exact R11 footer on every page;
- a public, bilingual, searchable `/help` with a topic for every existing page, linked from every page.

## Scope

- `packages/db`: the `preferences` concept (`UserPreference` entity, `LOCALES`/`THEMES`) and the `user-preferences` migration.
- `packages/core`:
  - `UserPreferenceService` and `userPreferenceUpdateSchema`;
  - container and cradle registration, plus re-exports;
  - `AuthService.signIn` also returns `userId`.
- `packages/app`:
  - the root layout (footer, theme script, request-time slot);
  - `i18n/`, `preferences/` and `help/`;
  - `components/layout/` and `components/preferences/`;
  - `/`, `/admin` and the `/help` page;
  - the login and admin actions.
- `packages/ui/src/styles/globals.css`: `color-scheme` under `.dark`.
- `tests/every-page-has-help.test.ts`, plus `tests/integration/{footer,preferences,help}.test.ts`.
- `.ai/docs/engineering-standards.md` and `BACKWARD_COMPATIBILITY.md`.

**Non-goals** (from the spec):

- a bearer API or audit for preferences (Q9);
- tooltips and guided how-tos (Q8);
- localized page `<title>`s;
- a "system" theme;
- locale in URLs;
- a second account for UX-003 in the integration test (waits for #16).

## Implementation Plan

### Phase 1: Footer

1. **`AppFooter` on every page.** The component and root layout, the landing tagline changed to a `<p>`, unit tests, and `tests/integration/footer.test.ts`.

### Phase 2: Stored preferences

2. **Entity and migration.** `UserPreference` and `user-preferences`, with tests for up/down, the unique user and the cascade.
3. **`UserPreferenceService` and schema.** Registration and exports, with service tests against real SQLite.

### Phase 3: Language and theme in the UI

4. **Dictionaries and per-request lookup.** `i18n/`, `current-preferences`, the cached `currentUser`, the `/`, `/login` and `/admin` strings, and the `core` re-exports.
5. **Theme mechanism.** The cookie helpers, `THEME_SCRIPT`, the root slot with `DocumentPreferences`, and `globals.css`.
6. **Switches and the action.** `PreferencesControls`, `updatePreferences`, the localized `/admin`, and the theme cookie on `signIn`/`signOut`.
7. **Integration test.** `tests/integration/preferences.test.ts`.

### Phase 4: Help

8. **Topics and search.** `help/topics.ts`, `search-help.ts` and `tests/every-page-has-help.test.ts`.
9. **`/help` page and the Help link.** The page, the link in the root slot, and `tests/integration/help.test.ts`, with `footer.test.ts` extended to `/help`.
10. **Docs and the gate.** Engineering standards, BACKWARD_COMPATIBILITY and the full validation gate.

## Risks

- **Cache Components:** the root-layout `<Suspense>` slot and the head script must keep `npm run build` prerendering without a database. The build checks this after Step 5.
- **The migration** is additive. The PR is `risk-high` and needs a rollback note.
- **Polish copy** is agent-written and needs a native-speaker review on the PR.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Footer

- [x] 1.1 AppFooter on every page — d123385

### Phase 2: Stored preferences

- [x] 2.1 Entity and migration — 03ad7b9
- [x] 2.2 UserPreferenceService and schema — 43a907d

### Phase 3: Language and theme in the UI

- [ ] 3.1 Dictionaries and per-request lookup
- [ ] 3.2 Theme mechanism
- [ ] 3.3 Switches and the action
- [ ] 3.4 Integration test

### Phase 4: Help

- [ ] 4.1 Topics and search
- [ ] 4.2 /help page and the Help link
- [ ] 4.3 Docs and the gate
