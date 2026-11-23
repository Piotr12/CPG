# Issue #398: onboarding skill spec, with homepage downloads

**Date:** 2026-11-23 08:10 UTC
**Agent:** Claude Code / Opus 5.5 (cezar, `om-auto-fix-issue` feature route)
**Spec:** `.ai/specs/2026-11-23--0810UTC-cpg-onboarding-skill.md`
**Status:** done

## Goal

Spec #398, the onboarding skill and the `cpg_onboarding` prompt. Extend it, at the owner's request, with downloads of the skill and the `cpg-mcp` package from the homepage, plus an installation guide for Windows, macOS and Linux.

## Log

- 08:00: #398 is a `feature`, unclaimed, with no open PR. #393 is merged (#401, #402, #403). `SDLC.md` has no Definition of Ready, so the ticket-level check was skipped. No spec covered #398, and nothing covered the downloads: #393's spec offers only the `uvx --from git+…` command.
- 08:05: checked uv 0.11.14 by hand, serving a zip of `mcp/` over a local HTTP server:
  - `uvx --from http://…/cpg-mcp.zip cpg-mcp` installs and starts the server, with no git needed;
  - after changing the zip at the same URL, the old code ran even with `--refresh` or `--refresh-package cpg-mcp`;
  - a new URL ran the new code.

  So the package URL is content-addressed (spec A4).
- 08:10: wrote the spec. The skill moves inside the package (`mcp/cpg_mcp/skills/…`), so an installed package can serve the prompt (A1). The app builds the archives at run time with `fflate`, which it already depends on (A9).

## Changes

- `.ai/specs/2026-11-23--0810UTC-cpg-onboarding-skill.md` (new)

## Verification

- A spec-only change. `npm test` runs the naming check on `.ai/` files in CI.

## Follow-ups

- The implementation PR closes #398, branched from `main` per lesson 2026-11-02.
