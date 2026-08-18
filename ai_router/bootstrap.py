"""Consumer-project bootstrap: orchestrator instruction files plus the two
scaffolded bootstrap session sets (plan the project, then decompose it
into work sets).

One canonical instruction block carries the whole session workflow; it is
written into ``AGENTS.md`` (Codex, Copilot, Gemini — every orchestrator
that reads that convention) and ``CLAUDE.md`` (Claude Code), differing only
in a short engine tail. When a file already exists, only the fenced managed
section is refreshed — user content above and below the fence is never
touched.

Into a project with no session sets at all, bootstrap also scaffolds
``001-default-plan`` and ``002-default-decomposition`` — ordinary
spec-only sets that run the planning and decomposition work through the
standard tracked pipeline (register, work, cross-provider verification,
close), so the very first thing the Work Explorer shows is the on-ramp
and the plan itself lands on the record. A project that already has any
set keeps its numbering and history; scaffolding is skipped. The
``--print-*-prompt`` flags remain for running the same work untracked.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

MANAGED_START = "<!-- dabbler:managed:start -->"
MANAGED_END = "<!-- dabbler:managed:end -->"

_SHARED_BODY = """\
# AI orchestrator instructions — `{repo_name}`

> `CLAUDE.md` and `AGENTS.md` share this managed body and differ only in
> the engine tail. The next session may be run by a different engine —
> that is why both files exist. Do not hand-edit inside the fence; re-run
> `python -m ai_router.bootstrap` to refresh it.

## Your role

You are the **orchestrator** for `{repo_name}`, running AI-led work one
session at a time under the Dabbler session-set workflow. You do the
mechanics (file edits, shell, git) and follow the per-session plan in the
active set's `spec.md`.

## The session lifecycle

1. **Resolve the active session set.** The active set is the single
   directory `docs/session-sets/<NNN-slug>/` whose `session-state.json`
   has `status: "in-progress"`. There must be at most one. If none is
   in-progress, the next set to start is the `not-started` set with the
   lowest `NNN-` prefix; `complete` and `cancelled` sets are skipped.
   Never infer state from file presence; read the `status` field. Two
   in-progress sets is a drift error — stop and surface it.

2. **Register the session (state first, work second).**

       python -m ai_router.session start --session-set-dir docs/session-sets/<slug> \\
           --engine <claude-code|codex|gemini|copilot> --provider <anthropic|openai|google>

   Copilot seats must also pass `--model` (the seat label is not trusted;
   identity resolves through the model registry). Idempotent — safe to
   re-run after a context reset.

3. **Do the work.** Follow the active spec's step list for the current
   session. Log progress, make the edits, run the tests. Do NOT commit
   yet — verification reviews the working tree, and an already-committed
   tree presents an empty diff.

4. **Run cross-provider verification (mandatory — there is no skip).**

       python -m ai_router.verify --session-set-dir docs/session-sets/<slug>

   The verifier is a different provider than you, on either transport.
   Round outcomes land in `.dabbler/runs/` (machine-written; never edit).
   Blocking findings: remediate, re-run the same command — rounds ≥2
   review only your fix delta. The loop suspends at the round cap.

5. **Record the test run of record** after your last code change, then
   **commit and push the verified work**:

       python -m ai_router.test_evidence record --session-set-dir <dir> \\
           --suite <name> --outcome passed --duration-seconds <elapsed>

6. **Close via the gate.**

       python -m ai_router.session close --session-set-dir docs/session-sets/<slug>

   Five gates run (verification clean, tree clean, pushed, tests fresh,
   verdict vocabulary); use `--dry-run` any time to preview the rows.
   The close flips the state, then commits and pushes its bookkeeping.

## Hard rules

- State files (`session-state.json`) and everything under `.dabbler/runs/`
  are written by the router only — never by hand, never "fixed up".
- Verification verdicts come from the verifier. A verdict token you did
  not receive from `ai_router.verify` does not exist.
- API keys live in env vars (`DABBLER_ANTHROPIC_API_KEY`,
  `DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`), never in files.
- Run the router through the project venv:
  `.venv/Scripts/python -m ai_router.<module>` on Windows,
  `.venv/bin/python -m ai_router.<module>` on POSIX. "No module named
  ai_router" is an interpreter problem, not a missing-keys problem.
"""

_CLAUDE_TAIL = """\
## Engine tail (Claude Code)

You are **Claude Code**; you read this `CLAUDE.md` automatically. Codex,
GitHub Copilot, and Gemini read `AGENTS.md` — the managed body is
identical, so hand-off between engines is seamless.
"""

_AGENTS_TAIL = """\
## Engine tail (Codex / GitHub Copilot / Gemini)

You read this `AGENTS.md`; Claude Code reads `CLAUDE.md` (same managed
body). Copilot seats: declare `--model` at session start and prefer
`DABBLER_TRANSPORT=copilot-cli` when routing through the seat. Cross-
provider verification stays cross-provider on every transport.
"""

PLAN_PROMPT = """\
You are preparing a project plan for the Dabbler session-set workflow.

Create — or import — `docs/planning/project-plan.md`, the stable artifact
the decomposition session reads from.

- **Create:** draft the plan directly: overview, goals and success
  criteria, high-level phases or feature areas, and each phase's key
  deliverables. Keep it concise — the decomposition session turns each
  phase into session sets, so scope each phase to a handful of focused AI
  sessions.
- **Import:** if a plan already exists outside this repo (a doc, a ticket,
  notes), bring its content into that path in this same shape, preserving
  intent while conforming to the structure above.

A later revision is just another plan session that amends the same file.
"""

DECOMPOSITION_PROMPT = """\
You are a session-set architect for an AI-led development workflow (the
Dabbler session-set workflow).

Read `docs/planning/project-plan.md` in this workspace (it is deliberately
not inlined here) and decompose it into a sequence of session sets. Each
session set is a focused, independently deployable unit of work that one
AI coding session can complete.

For EACH session set, scaffold `docs/session-sets/<NNN-slug>/spec.md`.

Hard requirements (do not deviate):
- **Slug:** `NNN-kebab-title` — three-digit, zero-padded, monotonically
  increasing prefix continuing after the highest existing set number,
  then a kebab-case title (e.g. `003-user-auth` when the scaffolded
  bootstrap sets 001/002 exist). Never a bare, un-prefixed slug; never
  two sets sharing a prefix.
- **spec.md layout:** one `# <Title>` heading; a `## Sessions` section;
  one `### Session K of N: <title>` heading per session; each session's
  steps as a top-level ordered list. Step 1 registers the session; the
  last steps run cross-provider verification, the required test suites,
  and close-out; the middle steps are the work.
- Do NOT hand-author `session-state.json`: each set's own first
  `session start` bootstraps it from the spec — state files are the
  runtime writers' job, never authored by hand.

Authoring guidance:
- Order sets so earlier ones unblock later ones.
- Keep scope tight: prefer 2-4 sessions per set, at most ~3 work steps
  per session.
"""


_PLAN_SET_DIRNAME = "001-default-plan"
_DECOMPOSITION_SET_DIRNAME = "002-default-decomposition"

_PLAN_SPEC = """\
# Project plan

> **Purpose:** Create — or import — `docs/planning/project-plan.md`, the
> stable artifact the decomposition set reads from. The plan is the
> deliverable: it runs through the normal pipeline — cross-provider
> verification reviews it — like any other session-set output.
> **Session Set:** `docs/session-sets/001-default-plan/`
> **Workflow:** Full
> **Prerequisite:** none.

---

## Session Set Configuration

```yaml
module: default
totalSessions: 1
```

---

## Sessions

### Session 1 of 1: Author or import the project plan

1. Register.
2. Create — or import — `docs/planning/project-plan.md`: overview, goals
   and success criteria, high-level phases or feature areas, and each
   phase's key deliverables. Keep it concise — the decomposition set
   turns each phase into session sets, so scope each phase to a handful
   of focused AI sessions. If a plan already exists outside this repo (a
   doc, a ticket, notes), bring its content into that path in this same
   shape, preserving intent.
3. Cross-provider verification.
4. Close-out.

**Creates:** `docs/planning/project-plan.md`. A later revision is just
another plan session that amends the same file.
"""

_DECOMPOSITION_SPEC = """\
# Session-set decomposition

> **Purpose:** Decompose `docs/planning/project-plan.md` into the work
> session sets — each a focused, independently deployable unit of work.
> **Session Set:** `docs/session-sets/002-default-decomposition/`
> **Workflow:** Full
> **Prerequisite:** `001-default-plan` closed (the plan is its input).

---

## Session Set Configuration

```yaml
module: default
totalSessions: 1
```

---

## Sessions

### Session 1 of 1: Decompose the plan into session sets

1. Register.
2. Read `docs/planning/project-plan.md` and decompose it into a sequence
   of session sets, scaffolding `docs/session-sets/<NNN-slug>/spec.md`
   for each. Hard requirements: the slug is `NNN-kebab-title` — a
   three-digit, zero-padded, monotonically increasing prefix continuing
   after the highest existing set number (003 onward here), then a
   kebab-case title; never two sets sharing a prefix. Each spec.md has
   one `# <Title>` heading, a `## Sessions` section, one
   `### Session K of N: <title>` heading per session, and each session's
   steps as a top-level ordered list — step 1 registers the session, the
   last steps run cross-provider verification and close-out, the middle
   steps are the work. Order sets so earlier ones unblock later ones;
   prefer 2-4 sessions per set and at most ~3 work steps per session.
   Do NOT hand-author `session-state.json` — each set's own first
   `session start` bootstraps it from the spec.
3. Cross-provider verification.
4. Close-out.

**Creates:** one `docs/session-sets/<NNN-slug>/spec.md` per work set.
"""

_BOOTSTRAP_SETS = (
    (_PLAN_SET_DIRNAME, _PLAN_SPEC),
    (_DECOMPOSITION_SET_DIRNAME, _DECOMPOSITION_SPEC),
)


def scaffold_bootstrap_sets(project_dir) -> list:
    """Scaffold the two bootstrap sets into a project with NO session
    sets at all; return the written spec paths. Any existing set — work
    set or bootstrap set, any state — means the project has its own
    numbering and history, so nothing is written and nothing is ever
    overwritten."""
    root = Path(project_dir) / "docs" / "session-sets"
    if root.is_dir() and any(p.is_dir() for p in root.iterdir()):
        return []
    written = []
    for dirname, content in _BOOTSTRAP_SETS:
        set_dir = root / dirname
        set_dir.mkdir(parents=True, exist_ok=True)
        spec = set_dir / "spec.md"
        with open(spec, "w", encoding="utf-8", newline="") as f:
            f.write(content)
        written.append(spec)
    return written


def render_engine_file(existing: str, repo_name: str, tail: str) -> str:
    """The managed section replaced in place, or appended after existing
    user content. User text outside the fence is never modified."""
    managed = (
        f"{MANAGED_START}\n"
        + _SHARED_BODY.format(repo_name=repo_name)
        + "\n---\n\n" + tail
        + f"\n{MANAGED_END}\n"
    )
    if MANAGED_START in existing and MANAGED_END in existing:
        head, _, rest = existing.partition(MANAGED_START)
        _, _, tail_text = rest.partition(MANAGED_END)
        return head + managed.rstrip("\n") + tail_text
    if existing.strip():
        return existing.rstrip("\n") + "\n\n" + managed
    return managed


def write_instruction_files(project_dir, repo_name=None) -> list:
    project = Path(project_dir)
    name = repo_name or project.resolve().name
    written = []
    for filename, tail in (
        ("AGENTS.md", _AGENTS_TAIL), ("CLAUDE.md", _CLAUDE_TAIL),
    ):
        path = project / filename
        existing = ""
        try:
            existing = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            pass
        content = render_engine_file(existing, name, tail)
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(content)
        written.append(path)
    return written


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m ai_router.bootstrap")
    parser.add_argument("--project-dir", default=".",
                        help="consumer project root (default: cwd)")
    parser.add_argument("--repo-name")
    parser.add_argument("--print-plan-prompt", action="store_true")
    parser.add_argument("--print-decomposition-prompt", action="store_true")
    args = parser.parse_args(argv)

    if args.print_plan_prompt:
        print(PLAN_PROMPT)
        return 0
    if args.print_decomposition_prompt:
        print(DECOMPOSITION_PROMPT)
        return 0

    project = Path(args.project_dir)
    if not project.is_dir():
        print(f"bootstrap: not a directory: {project}", file=sys.stderr)
        return 2
    written = write_instruction_files(project, args.repo_name)
    for path in written:
        print(f"bootstrap: wrote managed section in {path}")
    scaffolded = scaffold_bootstrap_sets(project)
    for path in scaffolded:
        print(f"bootstrap: scaffolded {path}")
    if scaffolded:
        print(
            "bootstrap: next, tell your AI agent to \"start the next "
            "session\" — 001-default-plan authors the project plan, then "
            "002-default-decomposition turns it into work sets."
        )
    else:
        print(
            "bootstrap: session sets already exist; set scaffolding "
            "skipped (instruction files refreshed only)."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
