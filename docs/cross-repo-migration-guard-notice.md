# Cross-repo CLAUDE.md notice — Schema-drift guard + number-prefix addressing (Set 050)

**Authored:** 2026-05-29 (Set 050 Session 5)
**Audience:** consumer-repo CLAUDE.md authors (dabbler-platform,
dabbler-access-harvester, dabbler-homehealthcare-accessdb, and any
consumer not yet listed).

## Purpose

This is a one-time copy source. Paste the snippet below into each
consumer repo's top-level `CLAUDE.md`, install the SessionStart drift
guard once per machine, and adopt the `NNN-` slug prefix for new sets.
The `dabbler-ai-router` package and the
`DarndestDabbler.dabbler-ai-orchestration` extension carry the code;
this notice is purely an instructions-side + one-time-setup update.

No PRs are filed from this repo — the operator pulls the snippet into
each consumer manually per the established pattern, the same way
[`cross-repo-checkout-notice.md`](cross-repo-checkout-notice.md),
[`cross-repo-harvest-notice.md`](cross-repo-harvest-notice.md), and
[`cross-repo-lightweight-notice.md`](cross-repo-lightweight-notice.md)
are propagated.

## What changed (one-paragraph summary)

The "remember to fetch the canonical schema before hand-authoring a
state file" rule was unreliable — on 2026-05-29 a consumer
(`dabbler-access-harvester`) hand-authored two `session-state.json`
files at `"schemaVersion": 2` from stale memory while the other 47 were
`v4`. Set 050 replaces the soft rule with a **deterministic guard**: a
pure-JS drift scan chained into the Claude Code `SessionStart` hook
reports any local state files behind the current schema version, every
session start, with **no router dependency and no network** (so it works
even on a repo with an ancient pinned router). A richer
`python -m ai_router.check_migrations` CLI gives detect-only CI/manual
detail, optionally consulting a GitHub-published advisory manifest
(`docs/schema-current.json`) so a *stale local router* can still learn
of a newer upstream schema. Old schema files are **not** force-migrated
— the `normalize_to_v4_shape` reader shim consumes v2/v3 transparently,
so they keep working; the Explorer flags them with an unobtrusive
asterisk + "Ran under schema v\<N\>" tooltip (no per-row nag) and offers
a single repo-level "Upgrade older session sets" bulk action. Set 050
also standardizes a monotonic `NNN-` slug prefix and adds a
number→slug resolver so an operator can say "Set 50" instead of typing
the full slug.

Ships in `dabbler-ai-router` `0.12.0` (PyPI) and the
`DarndestDabbler.dabbler-ai-orchestration` VS Code Marketplace extension
`0.25.0` (Set 050).

---

## One-time setup (per machine, operator-run)

### 1. Install the SessionStart drift guard

**With the extension (recommended):** run **`Dabbler: Install
Orchestrator Hook (Claude Code)`** from the Command Palette
(`dabbler.installOrchestratorHook.claudeCode`). It writes (or refreshes)
the `SessionStart` hook in `~/.claude/settings.json` so that, on every
session boundary, it (a) invokes `python -m ai_router.start_session` to
mark the in-progress set's orchestrator block, and (b) runs the pure-JS
drift scan and prints a one-line summary into session context when any
local set is behind the current schema. Restart Claude Code or run
`/clear` to activate. The hook lives in the **shared global**
`~/.claude/settings.json`, so installing it once covers **every** repo
on the machine — the invoker walks up from `cwd` to find the in-progress
set. The harvester is the first adopter via this same global install.

**Without the extension (router-less / manual):** in the install toast,
click **"Copy manual setup"**, or do it by hand:

```bash
# 1. Download the invoker into the repo (no router needed to run it):
curl -o scripts/claude-session-start-invoker.js \
  "https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/tools/dabbler-ai-orchestration/scripts/claude-session-start-invoker.js"
```

```jsonc
// 2. Merge into ~/.claude/settings.json (replace <absolute-path>):
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node \"<absolute-path>/scripts/claude-session-start-invoker.js\""
          }
        ]
      }
    ]
  }
}
```

The invoker's drift scan is pure JS — it reads
`docs/session-sets/*/session-state.json` and compares each
`schemaVersion` to a bundled `CURRENT_SCHEMA_VERSION` constant. It needs
**no `ai_router` import and no network**, so it still warns even if the
repo's router pin is ancient. (The `start_session` spawn it also performs
is best-effort: if no router is importable, that step logs to stderr and
the scan still runs.)

### 2. Raise the router pin

Set the consumer's `dabbler-ai-router` pin to the latest published
release:

```
dabbler-ai-router>=0.10.0
```

(0.12.0 ships the `check_migrations` + `resolve_set` CLIs; pin `>=0.12.0`
if you want those locally. `>=0.10.0` is the floor that keeps the v4
reader shim and `--no-router` mode available.) Reinstall:
`pip install -U dabbler-ai-router` in the repo's venv.

### 3. Run a one-time drift check

```bash
# Detect-only; exits non-zero if any set is behind. --verbose lists each.
python -m ai_router.check_migrations --verbose
```

If it reports drift, run the bulk upgrade — either the Explorer's
**"Upgrade older session sets"** title-bar icon, or the three existing
migrators in sequence (idempotent, `.bak`-backed, reversible):

```bash
python -m ai_router.migrate_session_state --in-place              # v2 -> v3
python -m ai_router.migrate_lightweight_to_canonical_v4 --in-place # lightweight/v2 -> v4
python -m ai_router.migrate_v3_to_v4 --in-place                    # v3 -> v4
```

> **Chain note (Set 050 S2 empirical correction):** a *genuine* v2 file
> (explicit `schemaVersion: 2` + the legacy
> `currentSession`/`totalSessions`/`completedSessions` triple) is skipped
> by both v4 migrators on their own — it needs the `migrate_session_state`
> (v2→v3) step **first**. Run all three in the order above; each is a
> no-op on files already at its target.

---

## Snippet to paste into each consumer's CLAUDE.md

> Copy from the next horizontal-rule line through the trailing
> horizontal-rule line. The snippet is self-contained: it uses external
> raw GitHub URLs rather than referencing the consumer repo's own file
> layout, so it works unchanged in all target repos.

---

### Schema-drift guard + number-prefix addressing (dabbler-ai-router 0.12.0 + dabbler-ai-orchestration 0.25.0)

**Schema currency is now machine-enforced.** A `SessionStart` hook runs
a pure-JS drift scan every session start: it reads
`docs/session-sets/*/session-state.json`, compares each `schemaVersion`
to the current canonical version, and prints a one-line summary into
session context when any set is behind. You can no longer silently skip
the check. If you see a `[Dabbler] N session-set(s) at vX need schema
migration` line, run `python -m ai_router.check_migrations --verbose`.

**Hand-authoring a state file (still applies):**

- **Stamp `"schemaVersion": 4`** (current canonical) on every write.
- Use **raw** GitHub URLs when fetching the canonical schema, not blob
  URLs — raw returns the file content, blob returns an HTML page:
  - Schema doc:
    `https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/session-state-schema.md`
  - Current-version manifest (advisory; machine-readable):
    `https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/schema-current.json`
- If you are not certain the inlined rules are current, fetch the schema
  doc (raw URL) first. The manifest's `currentSchemaVersion` is the
  authoritative number if the canonical version has advanced past 4.
- **Omit-null:** omit unknown fields (`startedAt`, `completedAt`,
  `orchestrator`, `verificationVerdict`) rather than writing `null`.

**Old schema is acceptable — no forced per-set migration.** A set that
ran under an older schema may stay on it; the `normalize_to_v4_shape`
reader shim consumes v2/v3 transparently. The Explorer marks such rows
with an unobtrusive asterisk + "Ran under schema v\<N\>" tooltip (no
per-row nag) and offers a single repo-level **"Upgrade older session
sets"** title-bar icon. Migration stays operator-invoked, `.bak`-backed,
reversible — never silent.

**Number-prefix addressing.** New session sets get a monotonic `NNN-`
prefix (e.g. `050-schema-drift-…`). This is **required for new sets**
and **recommended + forward-only for existing consumer repos** (do NOT
mass-rename existing dirs — it breaks `prerequisites:` references,
`sessionSetName`, and git history). Discover the next number with the
widest-existing-prefix + 1 rule, zero-padded to `max(3, widest)`:

```bash
python -m ai_router.resolve_set --next        # prints the next NNN- prefix
python -m ai_router.resolve_set 50            # resolves "50" -> full slug
```

`start_session --session-set-dir 50` accepts a bare number that resolves
within `./docs/session-sets`. In the extension, the Command-Palette
command **`Dabbler: Resolve Set Number`**
(`dabblerSessionSets.resolveSetNumber`) takes a number and resolves it to
the slug (works router-less via a pure-TS resolver). Semantic
date/phase slugs (`phase-3-week-2`) remain banned — the `NNN-` prefix is
a creation-order sequence number, not a semantic name.

---

## End of snippet

---

## Adoption status (2026-05-29)

| Repo | v4 migration | Router pin | CLAUDE.md stamp/raw-URL | Drift hook |
|---|---|---|---|---|
| `dabbler-access-harvester` | ✅ all 49 sets v4 | ✅ `>=0.10.0` | ✅ done ahead of set | operator-run install (global hook) |
| `dabbler-platform` | (re-scan) | (verify pin) | paste snippet | operator-run install |
| `dabbler-homehealthcare-accessdb` | (re-scan) | Lightweight (no router) | paste snippet | operator-run install |

The harvester's v2→v4 migration, pin bump, and CLAUDE.md stamp/raw-URL
edits were completed 2026-05-29 ahead of this set (the immediate
incident unblock). The remaining adopter action is the one-time
`SessionStart` hook install, which — because the hook lives in the
shared global `~/.claude/settings.json` — covers the harvester and every
other repo on the machine at once.
