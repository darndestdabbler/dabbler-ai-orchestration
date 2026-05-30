# Cross-repo notice — Claude `SessionStart` hook retired (Set 051 S3)

**Authored:** 2026-05-30 (Set 051 Session 3)
**Audience:** consumer-repo CLAUDE.md authors + every operator who ran
`Dabbler: Install Orchestrator Hook (Claude Code)` on their machine
(dabbler-platform, dabbler-access-harvester,
dabbler-homehealthcare-accessdb, and any consumer not yet listed).

## What changed (one-paragraph summary)

Set 050 shipped the schema-drift warning as a **pure-JS scan chained
into a Claude-only `SessionStart` hook** (installed via the
`dabbler.installOrchestratorHook.claudeCode` command, backed by
`scripts/claude-session-start-invoker.js`). Set 053 then moved the same
advisory into the **router lifecycle** — `start_session` and
`close_session` now print the drift summary themselves via
`summarize_drift`. Because **every** orchestrator (Claude, GitHub
Copilot, Codex, a human) runs `start_session` / `close_session` at every
session boundary on every host, the lifecycle advisory reaches everyone
with no editor hook required. That made the Claude-only hook a
redundant, divergence-prone duplicate (the JS scan and the Python
advisory could print different messages), and its `start_session`
auto-invocation was a non-load-bearing Claude-only convenience under the
portability rule. **Set 051 S3 retired the hook, its installer command,
and the invoker script.** Nothing about drift coverage is lost — it now
rides the lifecycle for every engine.

Ships in the `DarndestDabbler.dabbler-ai-orchestration` VS Code
Marketplace extension (Set 051; hook surface removed) and rides the
`dabbler-ai-router` lifecycle advisory already published with Set 053.

---

## Operator remediation (per machine, one-time)

The hook lived in the **shared global** `~/.claude/settings.json`, so it
was installed once per machine. Removing it is also a one-time per-machine
action. **This repo does not edit your machine settings for you** —
remove the entry by hand.

Open `~/.claude/settings.json` and delete any `hooks.SessionStart`
command entry whose `command` string contains
**`claude-session-start-invoker.js`**. For example, remove the bolded
block:

```jsonc
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node \"<abs-path>/scripts/claude-session-start-invoker.js\""
          }
        ]
      }
    ]
  }
}
```

If `SessionStart` (or `hooks`) has no other entries after removing the
dabbler command, you can delete the now-empty array/object too. Leaving a
stale entry is harmless but noisy: the invoker script no longer ships, so
the hook command will simply fail to find the file and Claude Code logs a
benign error on each session start. Removing it is the clean fix.

No reinstall step replaces this — drift coverage is automatic via the
router lifecycle (below). Keep the router pin current
(`dabbler-ai-router>=0.10.0`; `>=0.12.0` for the `check_migrations` /
`resolve_set` CLIs locally).

---

## Drift coverage now (no setup required)

`start_session` and `close_session` print a one-line advisory to stderr
after the boundary write when any sibling set is behind the current
schema:

```
[dabbler] N session-set(s) below the current schema v4. Run: python -m ai_router.check_migrations --verbose
```

Clean repos produce no output. The advisory is non-blocking and
fail-open — it never changes the command's exit status, and a scan error
is swallowed silently. `.venv/Scripts/python.exe -m
ai_router.check_migrations --verbose` (run it through your workspace venv
interpreter, not a bare `python`) remains the optional, richer
detect-only tool, and anyone who wants a hard CI gate can wire it in
themselves; it is never required.

---

## Consumer-repo CLAUDE.md edit

If you pasted the Set 050 snippet
([`cross-repo-migration-guard-notice.md`](cross-repo-migration-guard-notice.md)),
**remove its "Install the SessionStart drift guard" / hook-install
instruction**. Replace any "a `SessionStart` hook runs a drift scan every
session start" wording with:

> **Schema currency is machine-enforced via the router lifecycle.**
> `start_session` / `close_session` print a one-line drift advisory when
> any local session set is behind the current schema — no editor hook to
> install. If you see `[dabbler] N session-set(s) below the current
> schema vX`, run `python -m ai_router.check_migrations --verbose`.

The rest of the Set 050 snippet (hand-authoring rules: stamp
`"schemaVersion": 4`, raw GitHub URLs, omit-null; "old schema is
acceptable — no forced per-set migration"; number-prefix addressing) is
unchanged and still applies.

---

## Adoption status (2026-05-30)

| Repo | Hook removal (operator) | CLAUDE.md hook-instruction removed |
|---|---|---|
| `dabbler-access-harvester` | pending (remove global `SessionStart` entry) | paste edit |
| `dabbler-platform` | pending | paste edit |
| `dabbler-homehealthcare-accessdb` | pending (Lightweight; likely never installed) | paste edit |

Because the hook lived in the shared global `~/.claude/settings.json`,
one removal covers every repo on the machine at once.
