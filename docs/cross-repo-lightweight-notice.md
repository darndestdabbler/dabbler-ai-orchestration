# Cross-repo CLAUDE.md notice — Lightweight-tier parity (Set 048)

**Authored:** 2026-05-26 (Set 048 Session 4)
**Audience:** consumer-repo CLAUDE.md authors (dabbler-platform,
dabbler-access-harvester, dabbler-homehealthcare-accessdb,
and any Lightweight-tier consumer not yet listed).

## Purpose

This is a one-time copy source. Paste the body below into each
consumer repo's top-level `CLAUDE.md` so its in-repo orchestrators
discover the Lightweight-tier parity surface the next time they read
their instruction file. The `dabbler-ai-router` package and the
`DarndestDabbler.dabbler-ai-orchestration` extension are already
wired; this notice is purely an instructions-side update.

No PRs are filed from this repo — the operator pulls the snippet
into each consumer manually per the established pattern, the same
way the existing
[`cross-repo-checkout-notice.md`](cross-repo-checkout-notice.md) and
[`cross-repo-harvest-notice.md`](cross-repo-harvest-notice.md) are
propagated.

## What changed (one-paragraph summary)

The Dabbler workflow now supports a **Lightweight tier** as a
first-class peer to Full. A consumer repo declares
`tier: "lightweight"` in `docs/session-sets/<slug>/spec.md`'s
Session Set Configuration block, runs the orchestrator under
`--no-router` mode (CLI flag, `DABBLER_NO_ROUTER=1` env var, or the
spec-tier field — three-knob precedence), and gets the same writer
discipline as Full (state-file boundaries, Explorer UX, model /
effort / session identification) without any metered API calls.
Cross-provider verification is replaced by **copyable review
prompts** that the operator pastes into a different path-aware AI
assistant; the verdict comes back into a free-form
`external-verification.md` file. A new `requiresUAT` / `requiresE2E`
tri-state value (`"suggested"`) lets the orchestrator ask the
operator at session start whether UAT/E2E gates should arm — the
choice is recorded once in `activity-log.json` as a
`suggestion_disposition` entry.

Ships in `dabbler-ai-router` `0.10.0` (PyPI) and the
`DarndestDabbler.dabbler-ai-orchestration` VS Code Marketplace
extension `0.23.0` (Set 048).

---

## Snippet to paste into each consumer's CLAUDE.md

> Copy from the next horizontal-rule line through the trailing
> horizontal-rule line. The snippet is self-contained: it uses
> external links rather than referencing the consumer repo's own
> file layout, so it works unchanged in all target repos.

---

### Lightweight-tier parity (dabbler-ai-router 0.10.0 + dabbler-ai-orchestration 0.23.0)

A session set can declare `tier: "lightweight"` in its `spec.md`'s
Session Set Configuration YAML block. Lightweight sets follow the
same writer discipline as Full — same `session-state.json` shape,
same Session Set Explorer rendering, same model / effort / session
identification — but the AI router does NOT make metered API calls.
Specifically:

- **Activation (three knobs, highest wins):** CLI flag
  `--no-router` (on `start_session` and `close_session`); env var
  `DABBLER_NO_ROUTER=1`; spec.md `tier: "lightweight"` field.
- **Verification step (Step 6 of the workflow):** the routed
  cross-provider verification call is short-circuited. Instead, the
  orchestrator triggers one of the copyable-review-prompt commands
  (`dabbler.copySpecReviewPrompt`,
  `dabbler.copySessionAccomplishmentsPrompt`,
  `dabbler.copySetAccomplishmentsPrompt`,
  `dabbler.copyStartNextSessionPrompt`). Each writes a
  path-reference prompt (NEVER file contents) to the clipboard.
- **Paste-back convention:** the operator pastes the second AI
  assistant's verdict into
  `docs/session-sets/<slug>/external-verification.md`. The Dabbler
  extension's `dabbler.openExternalVerificationDoc` Command Palette
  action opens or creates this file. No templated header — free-
  form text.
- **Soft gate:** `close_session --no-router` warns (and in
  interactive mode prompts `[y/N]`) when
  `external-verification.md` is missing. Non-interactive mode and
  `--accept-suggestions` force-bypass.
- **Tri-state UAT/E2E (applies to both tiers):** `requiresUAT` and
  `requiresE2E` accept `true | false | "suggested"`. The
  `"suggested"` value triggers a single upfront positive-
  confirmation prompt from the AI orchestrator at session start
  ("E2E tests, UAT checklist, both, or neither?"); the choice is
  recorded once in `activity-log.json`.

### Required agent capability

The copyable review prompts use a **path-reference format** — they
name files relative to repo root rather than embedding contents.
The second AI assistant you paste the prompt into MUST be a
path-aware review agent that can read files itself. Confirmed
working: Claude Code (terminal + IDE), Codex (terminal + IDE),
Cline, Cursor. For chat agents without file access (some
Copilot Chat surfaces, web-based UIs), use the right-click menu's
`Open File ▸ Spec` and manually paste the file contents alongside
the review prompt as a workaround.

### Repo-specific review criteria (optional)

If you want to teach reviewers what THIS repo cares about, create
one or more of:

- `docs/review-criteria/spec.md` — embedded into the spec-review
  prompt.
- `docs/review-criteria/session.md` — embedded into the session-
  accomplishments prompt.
- `docs/review-criteria/set.md` — embedded into the set-
  accomplishments prompt.

Each is optional; missing files fall back to the extension's
default English instructions. Template versions of all three live
in the canonical repo at
[`dabbler-ai-orchestration/docs/review-criteria/`](https://github.com/darndestdabbler/dabbler-ai-orchestration/tree/master/docs/review-criteria).
Copy them once and edit to fit.

### Per-consumer state-file migration (one-time)

If this consumer has hand-edited Lightweight state files that drift
from canonical v4 (e.g., the `sessionLog[]` alias from
`great-psalms-scroll-font`, or a missing `schemaVersion` field on
an otherwise-v3 shape), run the migrator once from the consumer
repo root:

```bash
# Dry run first to see what would change:
python -m ai_router.migrate_lightweight_to_canonical_v4

# Apply when the dry-run looks right:
python -m ai_router.migrate_lightweight_to_canonical_v4 --in-place
```

The migrator writes `session-state.lwbak.json` alongside each
rewritten file. Rollback is one rename. Idempotent: re-running on
canonical v4 files is a no-op.

### Get Started panel — tier branch

`Dabbler: Get Started` (Command Palette) now has a Lightweight /
Full radio toggle. Selecting Lightweight hides the API-key
prerequisite, the cost-reality callout, and the Configure AI
Router / Show Cost Dashboard buttons; surfaces a Lightweight-
specific prerequisite (path-aware review agent) and a no-API-spend
callout. The toggle is UI-only — the actual runtime tier is
recorded in `spec.md`'s `tier:` field.

---

## End of snippet
