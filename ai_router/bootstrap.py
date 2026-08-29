"""Consumer-project bootstrap: orchestrator instruction files, the
``.dabbler/`` ignore rule, the repository's own ``dabbler.yaml``, and the
two setup sessions that plan the project and break the plan into the rest.

One canonical instruction block carries the whole session workflow; it is
written into ``AGENTS.md`` (Codex, Copilot, Gemini — every orchestrator
that reads that convention) and ``CLAUDE.md`` (Claude Code), differing only
in a short engine tail. When a file already exists, only the fenced managed
section is refreshed — user content above and below the fence is never
touched.

Into a project with no session plan at all, bootstrap scaffolds sessions 1
and 2 — author or import the project plan, then break it into numbered
sessions. They are ordinary sessions and run the ordinary lifecycle
(register, work, cross-provider verification, close); neither is an
approval gate, because what makes them safe is being verified hardest, not
being parked in front of a person. A project that already has a plan keeps
its numbering and its history; scaffolding is skipped. The
``--print-*-prompt`` flags remain for running the same work untracked.

Beside them goes ``dabbler.yaml``, and it is the piece without which the
scaffold is unrunnable: ``test_evidence`` refuses a suite the repository
never declared, so a project handed a lifecycle with nowhere to declare
one cannot reach step 4 of it.

Bootstrap also writes the ``.dabbler/`` rule into the project's
``.gitignore``. That directory is the router's machine-side record, and
every round lands there *after* the tree snapshot it describes — so a
tracked ledger presents itself to the close gate as work done after
verification, and no number of re-verifications can clear it.

The last piece of setup is the ``pre-commit`` guard that refuses a manual
commit while a plan step is open. It belongs here rather than at step
open: the guard has to exist in the clone before the first step does, and
a guard installed by the thing it guards is installed too late.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .config import (
    TRANSPORT_COPILOT_CLI,
    TRANSPORT_ENV_VAR,
    VALID_TRANSPORTS,
)
from .evidence import (
    SESSION_PLAN_FILENAME,
    SESSIONS_DIRNAME,
    ensure_round_refspecs,
    repo_root_for,
)

MANAGED_START = "<!-- dabbler:managed:start -->"
MANAGED_END = "<!-- dabbler:managed:end -->"

_IGNORE_RULE = ".dabbler/"

_SHARED_BODY = """\
# AI orchestrator instructions — `{repo_name}`

> `AGENTS.md` is the single source of this managed body; `CLAUDE.md` and
> `GEMINI.md` import it and add only their engine tail. Do not hand-edit
> inside the fence; re-run `python -m ai_router.bootstrap` to refresh it.

## Your role

You are the **orchestrator** for `{repo_name}`, running AI-led work one
session at a time under the Dabbler session workflow. You do the mechanics
(file edits, shell, git) and follow the per-session plan in
`docs/sessions/session-plan.md`.

## The session lifecycle

Sessions are numbered directly in this repository, under one sessions root
(`docs/sessions/`), so no command takes a handle to one.

1. **Resolve the session to run.** The session in flight is the single
   entry in `docs/sessions/sessions.json` whose `status` is
   `"in-progress"`; there is at most one. If none is in flight, the next
   is the lowest-numbered `not-started` one; `complete` and `cancelled`
   are skipped. Never infer state from file presence; read the `status`
   field. Two in flight is a drift error — stop and surface it.

2. **Register the session (state first, work second).**

       python -m ai_router.session start \\
           --engine <claude-code|codex|gemini|copilot> --provider <anthropic|openai|google>

   Copilot seats must also pass `--model` (the seat label is not trusted;
   identity resolves through the model registry). Idempotent — safe to
   re-run after a context reset.

   **Then declare the task list, before you edit anything.**

       python -m ai_router.session declare \\
           --task-file <path> --releasable|--not-releasable

   The declaration says what this session will do and whether it produces a
   releasable artifact. It is refused once the tree carries the session's
   work, refused a second time, and refused after the close — a session
   that declares itself releasable after building is a model deciding in
   hindsight what may be published. Step 8 reads it and fails closed: an
   undeclared session cannot publish.

3. **Do the work.** Follow the session plan's step list for the current
   session. Log progress and make the edits. Do NOT commit yet —
   verification reviews the working tree, and an already-committed tree
   presents an empty diff.

4. **Run the tests this change makes necessary — only those.**

       python -m ai_router.affected

   prints the selected tests, the reason each was selected, and the exact
   command to run. Once a verification round exists, selection is measured
   against that round's snapshot, so a remediation runs what the fix
   touched rather than what the session touched. Run it, then record it:

       python -m ai_router.test_evidence record \\
           --suite <name> --stage preverify-targeted \\
           --command "<the command you ran>" --outcome passed \\
           --duration-seconds <elapsed>

   The complete suite is neither required nor accepted here. A command
   that does not name the selected tests is recorded as a
   `policy_violation` and verification refuses to start. Two exceptions
   exist and both are auditable: the selector proving every test affected
   (it says so, and the bare suite command is then correct), or
   `--allow-full-preverify "<reason>"`, whose reason is mandatory.

5. **Run cross-provider verification (mandatory — there is no skip).**

       python -m ai_router.verify

   The verifier is a different provider than you, on either transport.
   Round outcomes land in `.dabbler/runs/` (machine-written; never edit).
   Blocking findings: remediate, rerun step 4 for the fix, then re-run the
   same command — rounds ≥2 review only your fix delta. The loop suspends
   at the round cap.

6. **Run the complete suite once, against the final verified tree**, and
   record it as the run of record. The command is the `command` the suite
   declares under `testing.suites` in this repository's `dabbler.yaml` —
   the same one `--suite <name>` names here:

       python -m ai_router.test_evidence record \\
           --suite <name> --stage final-full --outcome passed \\
           --duration-seconds <elapsed>

   This is the only stage the close accepts, and it binds to the tree it
   ran against. A failed run of record is not reusable proof: fix, rerun
   the affected tests, re-verify, then run the suite again.

7. **Commit the verified work, then push — once.** Commit as often as the
   work wants; push exactly once, here, immediately before close. CI runs
   on push, so a mid-session push buys a full matrix run of work that is
   not finished.

8. **Package — only if step 2 declared this session releasable.**

       python -m ai_router.packaging

   Packs, then pushes to the declared feed. It refuses an undeclared or
   not-releasable session, refuses a repository that declares no
   `packaging` block, and refuses until the same gates the close reads all
   pass. The feed credential is named in configuration, never held there:
   it resolves at spawn into one argv element and is placed in no
   environment. `--dry-run` previews the gates and runs nothing.

9. **Close via the gate.**

       python -m ai_router.session close

   Five gates run (verification clean, tree clean, pushed, tests fresh,
   verdict vocabulary); use `--dry-run` any time to preview the rows.
   The close flips the state, then commits and pushes its bookkeeping.

## Hard rules

- State files (`docs/sessions/sessions.json`) and everything under
  `.dabbler/runs/`
  are written by the router only — never by hand, never "fixed up".
- Verification verdicts come from the verifier. A verdict token you did
  not receive from `ai_router.verify` does not exist.
- API keys live in env vars (`DABBLER_ANTHROPIC_API_KEY`,
  `DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`), never in files. The
  same rule covers a feed PAT: `packaging.push.secret` names it and never
  holds it.
- Run the router through the project venv:
  `.venv/Scripts/python -m ai_router.<module>` on Windows,
  `.venv/bin/python -m ai_router.<module>` on POSIX. "No module named
  ai_router" is an interpreter problem, not a missing-keys problem.
"""

_CLAUDE_TAIL = """\
## Engine tail (Claude Code)

You are **Claude Code**. The managed body above arrived through the
`@AGENTS.md` import, which Claude Code expands at load time — `AGENTS.md`
is the one copy, so nothing here can drift from what the other engines
read.
"""

_AGENTS_TAIL = """\
## Engine tail (Codex / GitHub Copilot)

You read this `AGENTS.md` directly. `CLAUDE.md` and `GEMINI.md` import
it rather than repeating it, so this file is the one place the body
exists. GitHub Copilot loads all three files at once and de-duplicates
nothing, which is exactly why only this one carries the body.

Copilot seats: declare `--model` at session start and prefer
`DABBLER_TRANSPORT=copilot-cli` when routing through the seat. Cross-
provider verification stays cross-provider on every transport.
"""

_GEMINI_TAIL = """\
## Engine tail (Gemini CLI)

You are **Gemini CLI**. The managed body above arrived through the
`@AGENTS.md` import, expanded by the memory import processor —
`AGENTS.md` is the one copy. If your seat is configured with
`context.fileName`, keep `AGENTS.md` in the list.
"""

# CLAUDE.md and GEMINI.md carry this instead of the body. Both engines
# expand `@file` at load time, so the import is a loader directive, not
# a request the model may decline. Neither reads AGENTS.md natively,
# which is why the file cannot simply be deleted.
_IMPORT_LINE = "@AGENTS.md"

PLAN_PROMPT = """\
You are preparing a project plan for the Dabbler session workflow.

Create — or import — `docs/planning/project-plan.md`, the stable artifact
the decomposition session reads from.

- **Create:** draft the plan directly: overview, goals and success
  criteria, high-level phases or feature areas, and each phase's key
  deliverables. Keep it concise — the decomposition session turns each
  phase into numbered sessions, so scope each phase to a handful of
  focused AI sessions.
- **Import:** if a plan already exists outside this repo (a doc, a ticket,
  notes), bring its content into that path in this same shape, preserving
  intent while conforming to the structure above.

A later revision is just another plan session that amends the same file.
"""

DECOMPOSITION_PROMPT = """\
You are a session architect for an AI-led development workflow (the
Dabbler session workflow).

Read `docs/planning/project-plan.md` in this workspace (it is deliberately
not inlined here) and decompose it into a sequence of numbered sessions.
Each session is a focused unit of work that one AI coding session can
complete.

Append the sessions to `docs/sessions/session-plan.md`, under its
`## Sessions` heading. There is no level above a session: no sets, no
slugs, no directories.

Hard requirements (do not deviate):
- **Numbering:** continue from the highest session number the plan already
  declares. Numbers are never reused and never renumbered, including for
  cancelled sessions.
- **Layout:** one `### Session <N>: <title>` heading per session, and its
  steps as a top-level ordered list. Step 1 registers the session; the last
  steps run the affected tests, cross-provider verification, the complete
  suite once against the verified tree, and close-out; the middle steps are
  the work. Never write a step that says "run the tests" without saying
  which run it means.
- A session may declare `Policy: fast` or `Policy: verified` on its own
  line; omitting it uses the repository default.
- Do NOT hand-author `sessions.json`: the first `session start` bootstraps
  it from this plan — state files are the runtime writers' job, never
  authored by hand.

Authoring guidance:
- Order sessions so earlier ones unblock later ones.
- Keep scope tight: at most ~3 work steps per session. A session whose
  evidence bundle a verifier cannot read is too large, and the evidence cap
  is the measure of that — treat it as a planning signal, not a threshold
  to get under.
"""


_BOOTSTRAP_PLAN = """\
# Session plan

> **Purpose:** the numbered sessions this repository runs, in order. The
> first two set the project up; everything after them is the work.
> **Workflow:** Full

---

## Sessions

### Session 1: Author or import the project plan

1. Register.
2. Create \u2014 or import \u2014 `docs/planning/project-plan.md`: overview, goals
   and success criteria, high-level phases or feature areas, and each
   phase's key deliverables. Keep it concise \u2014 session 2 turns each phase
   into numbered sessions, so scope each phase to a handful of focused AI
   sessions. If a plan already exists outside this repo (a doc, a ticket,
   notes), bring its content into that path in this same shape, preserving
   intent.
3. Affected tests as preverify.
4. Cross-provider verification.
5. Full test suite, recorded as the run of record.
6. Close-out.

**Creates:** `docs/planning/project-plan.md`. A later revision is just
another plan session that amends the same file.

### Session 2: Break the plan into numbered sessions

1. Register.
2. Read `docs/planning/project-plan.md` and break it into numbered
   sessions appended to this file. Each session is a focused unit of work
   one AI coding session can complete: one
   `### Session <N>: <title>` heading, and its steps as a top-level
   ordered list. Step 1 registers the session; the last steps run the
   affected tests, cross-provider verification, the complete suite once
   against the verified tree, and close-out; the middle steps are the
   work. Never write a step that says "run the tests" without saying which
   run it means. Order sessions so earlier ones unblock later ones, and
   keep at most ~3 work steps per session.
3. Affected tests as preverify.
4. Cross-provider verification.
5. Full test suite, recorded as the run of record.
6. Close-out.

**Creates:** the numbered session list the rest of this repository runs.

> Do NOT hand-author `sessions.json`. The first `session start`
> bootstraps it from this plan \u2014 state files are the writers' job.
"""


def scaffold_bootstrap_sessions(project_dir) -> list:
    """Scaffold the two setup sessions into a repository that has no
    session plan at all; return the written path.

    A repository that already has a plan has its own numbering and its own
    history, so nothing is written and nothing is ever overwritten.
    """
    root = Path(project_dir) / "docs" / SESSIONS_DIRNAME
    plan = root / SESSION_PLAN_FILENAME
    if plan.exists():
        return []
    root.mkdir(parents=True, exist_ok=True)
    with open(plan, "w", encoding="utf-8", newline="") as f:
        f.write(_BOOTSTRAP_PLAN)
    return [plan]


@dataclass(frozen=True)
class Ecosystem:
    """One buildable ecosystem, and the suite declaration it implies.

    ``runs_whole`` is true for every runner that takes a filter rather
    than a list of test files. The framework then runs that suite
    complete instead of inventing a narrowing syntax it cannot know --
    ``mvn -q test <file>`` reads the path as a lifecycle argument, and
    ``dotnet test`` wants a project.
    """

    key: str
    command: str
    runs_whole: bool
    test_roots: tuple
    test_glob: str


def _exists(root: Path, *names) -> bool:
    return any((root / name).exists() for name in names)


def _glob_hit(root: Path, pattern: str) -> bool:
    try:
        return next(root.glob(pattern), None) is not None
    except OSError:
        return False


def _reads(root: Path, name: str) -> str:
    try:
        return (root / name).read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return ""


def _wrapped(root: Path, wrapper: str, command: str, fallback: str) -> str:
    """The repository's committed entry point when it has one.

    A wrapper is checked in precisely so the build runs without the tool
    being installed globally, and ``gradle test`` on a machine that has
    only ``gradlew`` fails for a reason the repository already solved.
    The relative form resolves in both shells this framework runs in.
    """
    return command if _exists(root, wrapper) else fallback


def _detect_python(root: Path):
    """pytest, and only where something says pytest.

    ``pyproject.toml`` declares that this is a Python project; it says
    nothing about how the tests run, and plenty of them use ``unittest``
    or ``nox``. A pytest configuration section is the declaration.
    """
    declared = (
        _exists(root, "pytest.ini")
        or "[tool.pytest" in _reads(root, "pyproject.toml")
        or "[tool:pytest]" in _reads(root, "setup.cfg")
        or "[pytest]" in _reads(root, "tox.ini")
    )
    if not declared:
        return None
    return Ecosystem(
        key="python", command="python -m pytest", runs_whole=False,
        test_roots=("tests",), test_glob="test_*.py",
    )


def _detect_maven(root: Path):
    """Maven's ``test`` phase is declared by the POM being a POM: it is a
    lifecycle phase, not a script someone had to write."""
    if not _exists(root, "pom.xml"):
        return None
    return Ecosystem(
        key="maven",
        command=_wrapped(root, "mvnw", "./mvnw -q test", "mvn -q test"),
        runs_whole=True,
        test_roots=("src/test/java",), test_glob="*Test.java",
    )


def _detect_gradle(root: Path):
    if not _exists(root, "build.gradle", "build.gradle.kts"):
        return None
    return Ecosystem(
        key="gradle",
        command=_wrapped(root, "gradlew", "./gradlew test", "gradle test"),
        runs_whole=True,
        test_roots=("src/test/java",), test_glob="*Test.java",
    )


def _detect_dotnet(root: Path):
    """``dotnet test`` is the SDK's own test entry point, and it resolves
    the solution or project in the directory it runs in."""
    if not any(
        _glob_hit(root, p) for p in ("*.sln", "*.slnx", "*.csproj", "*.fsproj")
    ):
        return None
    return Ecosystem(
        key="dotnet", command="dotnet test", runs_whole=True,
        test_roots=("tests",), test_glob="*Tests.cs",
    )


def _is_placeholder_test_script(script: str) -> bool:
    """Whether ``scripts.test`` is a script that exists in order to fail.

    ``npm init`` writes ``echo "Error: no test specified" && exit 1``, and
    a repository that has not replaced it has said the opposite of "my
    tests run this way". Declaring a suite around it produces a standing
    red that blocks the lifecycle until someone edits generated
    configuration -- the failure this detector was narrowed to avoid.
    """
    lowered = " ".join(script.lower().split())
    return "no test specified" in lowered or lowered in ("exit 1", "false")


def _detect_node(root: Path):
    """``npm test`` runs whatever ``scripts.test`` says, so the script is
    the declaration, and both its absence and its placeholder are the
    repository saying nothing."""
    try:
        manifest = json.loads(_reads(root, "package.json") or "{}")
    except json.JSONDecodeError:
        return None
    if not isinstance(manifest, dict):
        return None
    # `scripts` is whatever the file says it is. A manifest that parses is
    # not a manifest that conforms, and a shape error here must leave node
    # undetected rather than end the whole bootstrap.
    scripts = manifest.get("scripts")
    if not isinstance(scripts, dict):
        return None
    script = scripts.get("test")
    if not isinstance(script, str) or not script.strip():
        return None
    if _is_placeholder_test_script(script):
        return None
    return Ecosystem(
        key="node", command="npm test", runs_whole=True,
        test_roots=("test", "tests"), test_glob="*.test.ts",
    )


#: One detector per ecosystem, in the order suites are declared. A
#: repository that is Java and .NET at once matches twice and gets two
#: suites, which is the case ``testing.suites`` was made plural for.
DETECTORS = (
    _detect_python, _detect_maven, _detect_gradle, _detect_dotnet,
    _detect_node,
)


def detect_ecosystems(project_dir) -> list:
    """Which ecosystems this repository declares itself to be, and how it
    says its tests run.

    Two limits keep this a reading rather than a guess, and both are
    deliberate silences:

    - **A build file is not a test command.** Where the ecosystem's
      runner is a script somebody had to write, the script must be there
      -- `package.json` with no `scripts.test` declares nothing, and
      `pyproject.toml` with no pytest section declares nothing about
      pytest. Where the runner is the toolchain's own lifecycle (`mvn
      test`, `dotnet test`), the build file is the declaration.
    - **Only the repository root is read.** A suite declares a command
      and no working directory, so `service/pom.xml` cannot become a
      runnable line -- `mvn -q test` at the root would simply fail. A
      multi-project repository declares its own suites; a scaffold that
      guessed at the layout would hand it a red suite instead.
    """
    root = Path(project_dir)
    return [eco for eco in (detect(root) for detect in DETECTORS) if eco]


def _suite_block(eco: Ecosystem) -> str:
    lines = [
        f"    - name: {eco.key}",
        f"      command: {eco.command}",
        "      expensive: true",
        "      covers:",
        '        - "."',
    ]
    if eco.runs_whole:
        lines.append("      runs_whole: true")
    lines.append("      test_roots:")
    lines += [f"        - {root}" for root in eco.test_roots]
    lines.append(f'      test_glob: "{eco.test_glob}"')
    return "\n".join(lines)


_PROJECT_CONFIG_HEADER = """\
# dabbler.yaml -- what this repository declares about itself.
#
# Tracked, unlike local-overrides.yaml, because CI reads these facts and so
# does the next machine to pick up a session. Precedence is the packaged
# router-config.yaml, then this file, then local-overrides.yaml. Providers,
# models, roles and transports are deliberately absent: those are
# distribution facts, and a repository that restated them here would fork
# the model registry in order to say how to run a test suite.
schema_version: 1
"""

_PROJECT_CONFIG_TESTING_HEADER = """
# Which tests a change makes necessary, and what proves the suite was green.
# Pre-verification runs the selected tests only; the complete suite is
# recorded once, against the final verified tree.
#
# One suite per ecosystem whose root build file says how its tests run, so
# a repository that is Java and .NET at once hands each runner its own
# tests. Check the command before you rely on it: it is read from what this
# repository already carries, and a repository can carry a runner it does
# not actually use. Two fields are the scaffold's, not yours to keep:
#
#   covers      claims the whole repository, because setup cannot know this
#               layout. The failure direction is fixed -- run a suite you
#               did not need rather than skip one you did -- so narrow it as
#               the layout settles.
#   runs_whole  says the runner takes a filter rather than a list of test
#               files, so there is no narrowed form of it to run.
#               Pre-verification runs it complete and the record says so.
testing:
  suites:
"""

_PROJECT_CONFIG_SELECTION = """
  # Which tests answer for which path.
  #
  # A scaffolded repository has declared no mapping yet, and the framework
  # refuses to invent one: a path no rule covers is `selection_unknown`, and
  # pre-verification fails closed rather than let a green run for the mapped
  # half of a change read as covering the other half. So setup declares the
  # only honest starting mapping there is -- every path is repository-wide,
  # every change affects every test, and the complete suite is what
  # pre-verification asks for.
  #
  # It is correct and it is expensive, and it is meant to be replaced. Narrow
  # it as the repository takes shape: `repo_wide` for the few paths that
  # really do change what every test does (the test config, the lockfile),
  # `rules` mapping a source path to the tests that would notice it breaking,
  # and `smoke` for what runs when a path maps to nothing.
  selection:
    repo_wide:
      - "."
"""

_PROJECT_CONFIG_NO_SUITES = """
# No suite is declared, because nothing at the root of this repository says
# how its tests run. Setup reads what is there -- a pytest section, a
# `scripts.test`, a POM, a solution -- and where none of it says how the
# tests run, it declares nothing rather than emitting a command that would
# fail on its first use. That is a declaration, not an omission.
#
# A repository whose build files live BELOW the root reaches this too: a
# suite declares a command and no working directory, so `service/pom.xml`
# has no runnable line to become. Declare the suite yourself -- a name, the
# command that runs it, the paths it covers, and where its tests live:
#
#   testing:
#     suites:
#       - name: python
#         command: python -m pytest
#         expensive: true
#         covers: ["."]
#         test_roots: [tests]
#         test_glob: "test_*.py"
"""

_PROJECT_CONFIG_PACKAGING = """
# Step (f) of the lifecycle: pack, then push to a feed. A session that
# declared itself releasable publishes through these -- both argv, never
# shell strings, and `push` naming the credential rather than holding it.
# This repository declares none, and that is the declaration: it publishes
# to no feed today.
#
#   packaging:
#     pack:
#       argv: ["dotnet", "pack", "-c", "Release", "-o", "{output}"]
#     push:
#       argv: ["dotnet", "nuget", "push", "{artifact}",
#              "--source", "{feed}", "--api-key", "{secret}"]
#       feed: https://pkgs.dev.azure.com/<org>/_packaging/<feed>/nuget/v3/index.json
#       secret: DABBLER_FEED_PAT
"""


def render_project_config(ecosystems) -> str:
    """The scaffolded ``dabbler.yaml`` for a repository of these
    ecosystems. One suite per ecosystem, in detection order."""
    out = [_PROJECT_CONFIG_HEADER]
    if ecosystems:
        out.append(
            _PROJECT_CONFIG_TESTING_HEADER
            + "\n".join(_suite_block(eco) for eco in ecosystems)
            + "\n"
            + _PROJECT_CONFIG_SELECTION
        )
    else:
        out.append(_PROJECT_CONFIG_NO_SUITES)
    out.append(_PROJECT_CONFIG_PACKAGING)
    return "".join(out)


def scaffold_project_config(project_dir) -> Optional[Path]:
    """Write the repository's tracked ``dabbler.yaml``; return the path
    when it was written.

    Without this file a scaffolded project cannot reach step 4 of the
    lifecycle it was just handed: ``test_evidence`` refuses a suite the
    repository never declared, and there is nowhere tracked to declare
    one. An existing file is never touched -- it is the repository's own
    statement about itself, and later runs of bootstrap refresh
    instructions, not declarations.
    """
    from .config import PROJECT_CONFIG_FILENAME

    path = Path(project_dir) / PROJECT_CONFIG_FILENAME
    if path.exists():
        return None
    try:
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(render_project_config(detect_ecosystems(project_dir)))
    except OSError:
        return None
    return path


def ensure_gitignore(project_dir) -> bool:
    """Ensure the consumer project ignores the router's machine-side
    ``.dabbler/`` directory; return True when the rule was added.

    The run ledger is appended *after* the tree snapshot each round
    describes. A tracked ledger therefore reports itself as work done
    after verification, and the close gate correctly refuses — so the
    ignore rule is part of setup, not a convention the operator is
    trusted to know. Existing content is preserved; the rule is added
    once and never duplicated.
    """
    path = Path(project_dir) / ".gitignore"
    try:
        existing = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        existing = ""
    target = _IGNORE_RULE.rstrip("/")
    for line in existing.splitlines():
        stripped = line.strip()
        # `.dabbler/*` governs the same directory as `.dabbler/`, and a
        # repository that wrote it that way did so to re-include something
        # underneath. Adding the blunter rule after it would exclude the
        # parent directory outright, and git cannot re-include through an
        # excluded parent -- the ledger a project deliberately tracks would
        # silently stop being added.
        if stripped.endswith("/*"):
            stripped = stripped[:-2]
        if stripped.rstrip("/") in (target, "*"):
            return False
    block = "" if not existing.strip() else (
        existing if existing.endswith("\n") else existing + "\n"
    )
    if block:
        block += "\n"
    block += (
        "# Dabbler router machine-side state: the run ledger records each\n"
        "# verification round after the tree it describes, so committing it\n"
        "# makes verified work look like it changed post-verification.\n"
        f"{_IGNORE_RULE}\n"
    )
    try:
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(block)
    except OSError:
        return False
    return True


_HOOK_MARKER = "# dabbler-ai-router: step-execution commit guard"
_PRE_COMMIT_HOOK = """\
#!/bin/sh
{marker}
# The framework commits a step, and only once the step's evidence is
# satisfied. A commit landed mid-step leaves the step with no diff of its
# own to be judged by, so this refuses rather than advises.
#
# Only exit {blocking} -- the guard saying "a step is open" -- blocks the commit.
# A missing interpreter, an uninstalled package or an unreadable ledger
# exit differently and are let through: none of them is the guard's
# verdict, and a repository nobody can commit to is a worse failure than
# an unguarded one. The binding check is `verify step close`, which
# refuses outright when HEAD has moved off the commit the step opened on.
"{python}" -m ai_router.verify step guard-commit
if [ $? -eq {blocking} ]; then
  exit 1
fi
exit 0
"""


def ensure_commit_guard(project_dir) -> Optional[Path]:
    """Install the pre-commit guard that refuses a manual commit while a
    step is open; return the hook path when it was written.

    An existing hook this function did not write is never clobbered -- a
    project's own pre-commit checks are not ours to delete, and a guard
    that silently ate them would be worse than no guard. The interpreter
    is baked in rather than resolved from PATH, because a hook that ran
    against a different environment is answering about a different
    repository.
    """
    from .verify import EXIT_BLOCKING

    hooks = Path(project_dir) / ".git" / "hooks"
    if not hooks.parent.is_dir():
        return None
    path = hooks / "pre-commit"
    try:
        existing = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        existing = ""
    if existing and _HOOK_MARKER not in existing:
        return None
    content = _PRE_COMMIT_HOOK.format(
        marker=_HOOK_MARKER, python=Path(sys.executable).as_posix(),
        blocking=EXIT_BLOCKING,
    )
    if existing == content:
        return None
    try:
        hooks.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
        os.chmod(path, 0o755)
    except OSError:
        return None
    return path


def detect_copilot_seat(binary: str = "copilot") -> Optional[str]:
    """The live Copilot CLI version string, or None when no seat resolves.
    Detection is a fact about the machine, so nobody should be asked."""
    from .transports.copilot import get_cli_version

    try:
        return get_cli_version(binary=binary)
    except Exception:
        return None


_WIN_SYSTEM_ENV_KEY = (
    r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"
)
_WIN_USER_ENV_KEY = "Environment"

#: What a persistence attempt achieved. ``None`` means nothing was written.
SCOPE_MACHINE = "machine"
SCOPE_USER = "user"


def _broadcast_environment_change() -> None:
    """Tell running shells the environment changed. Without it the value is
    live only for processes started after the next sign-out."""
    try:
        import ctypes

        HWND_BROADCAST, WM_SETTINGCHANGE, SMTO_ABORTIFHUNG = 0xFFFF, 0x001A, 0x0002
        ctypes.windll.user32.SendMessageTimeoutW(
            HWND_BROADCAST, WM_SETTINGCHANGE, 0, "Environment",
            SMTO_ABORTIFHUNG, 5000, ctypes.byref(ctypes.c_ulong()),
        )
    except Exception:
        pass  # the value is written; only the live broadcast is best-effort


def _persist_env_var_windows(name: str, value: str, *, machine: bool) -> bool:
    """Write an environment variable to the user hive (HKCU) or, when
    *machine* is set and the process is elevated, the machine hive (HKLM)."""
    import winreg

    root, key_path = (
        (winreg.HKEY_LOCAL_MACHINE, _WIN_SYSTEM_ENV_KEY) if machine
        else (winreg.HKEY_CURRENT_USER, _WIN_USER_ENV_KEY)
    )
    try:
        with winreg.OpenKey(root, key_path, 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)
    except OSError:
        return False
    _broadcast_environment_change()
    return True


def is_elevated() -> bool:
    """True when this process can write machine-scope settings."""
    if os.name == "nt":
        try:
            import ctypes

            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        except Exception:
            return False
    try:
        return os.geteuid() == 0
    except AttributeError:
        return False


_POSIX_MARKER = "# dabbler-ai-router: transport preference"
_POSIX_SYSTEM_PROFILE = Path("/etc/profile.d/dabbler-ai-router.sh")
_POSIX_USER_PROFILE = Path.home() / ".profile"


def _persist_env_var_posix(name: str, value: str, *, machine: bool) -> bool:
    """Write the system-wide profile drop-in (requires root) or a marked
    block in the user's own ``~/.profile``."""
    line = f'{_POSIX_MARKER}\nexport {name}="{value}"\n'
    if machine:
        try:
            _POSIX_SYSTEM_PROFILE.parent.mkdir(parents=True, exist_ok=True)
            _POSIX_SYSTEM_PROFILE.write_text(line, encoding="utf-8")
            os.chmod(_POSIX_SYSTEM_PROFILE, 0o644)
        except OSError:
            return False
        return True
    try:
        existing = (
            _POSIX_USER_PROFILE.read_text(encoding="utf-8")
            if _POSIX_USER_PROFILE.exists() else ""
        )
        kept = [
            ln for ln in existing.splitlines()
            if _POSIX_MARKER not in ln and not ln.startswith(f"export {name}=")
        ]
        _POSIX_USER_PROFILE.write_text(
            "\n".join(kept).rstrip("\n") + ("\n\n" if kept else "") + line,
            encoding="utf-8",
        )
    except OSError:
        return False
    return True


def persist_transport_preference(
    value: str, *, machine: bool = False
) -> Optional[str]:
    """Remember the operator's transport in a durable environment variable
    and return the scope that actually landed, or ``None`` if none did.

    User scope is the default because the preference is a property of the
    operator's account, not of the hardware: a workstation whose admin
    account is a *different user* gains nothing from a machine-scope write,
    and the account that actually runs the router would still never see it.
    ``machine=True`` asks for every account and needs elevation; when that
    is unavailable the write falls back to user scope rather than failing,
    because a preference that landed for the operator beats one that landed
    nowhere. The return value names the scope reached, so a caller can
    report the downgrade — the fallback is announced, never silent.

    The value is also applied to this process so the current run sees it
    whatever happened durably.
    """
    os.environ[TRANSPORT_ENV_VAR] = value
    writer = (
        _persist_env_var_windows if os.name == "nt" else _persist_env_var_posix
    )
    if machine and is_elevated() and writer(
        TRANSPORT_ENV_VAR, value, machine=True
    ):
        return SCOPE_MACHINE
    if writer(TRANSPORT_ENV_VAR, value, machine=False):
        return SCOPE_USER
    return None


def _manual_persist_hint(value: str) -> str:
    """The command an operator can run themselves. It must never require an
    account they are not signed into — a hint that says "re-run elevated" is
    useless when the admin account is a different user."""
    if os.name == "nt":
        return (
            "[Environment]::SetEnvironmentVariable("
            f"'{TRANSPORT_ENV_VAR}','{value}','User')"
        )
    return f'echo \'export {TRANSPORT_ENV_VAR}="{value}"\' >> ~/.profile'


def resolve_bootstrap_transport(explicit=None) -> tuple:
    """``(value, reason)`` for what to persist, or ``(None, reason)`` to
    leave the preference alone. Precedence: an explicit ``--transport``
    wins; otherwise an already-persisted preference is respected; failing
    both, a detected seat decides. Detection never overrides a choice the
    operator already made."""
    if explicit:
        return explicit, f"--transport {explicit}"
    current = (os.environ.get(TRANSPORT_ENV_VAR) or "").strip().lower()
    if current in VALID_TRANSPORTS:
        return None, f"{TRANSPORT_ENV_VAR} is already set to {current!r}"
    version = detect_copilot_seat()
    if version:
        return TRANSPORT_COPILOT_CLI, f"detected a Copilot seat ({version})"
    return None, "no Copilot seat detected; leaving the default (api)"


def render_engine_file(existing: str, repo_name: str, tail: str,
                       body: str = None) -> str:
    """The managed section replaced in place, or appended after existing
    user content. User text outside the fence is never modified.

    *body* defaults to the shared managed body; the importing files pass
    the one-line `@AGENTS.md` directive instead, so the body exists in
    exactly one file."""
    rendered_body = (
        _SHARED_BODY.format(repo_name=repo_name) if body is None
        else body.rstrip("\n") + "\n"
    )
    managed = (
        f"{MANAGED_START}\n"
        + rendered_body
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
    """Write the three engine files. `AGENTS.md` carries the body;
    `CLAUDE.md` and `GEMINI.md` import it.

    All three are written because no engine reads all three: Codex and
    Copilot read `AGENTS.md`, Claude Code reads only `CLAUDE.md`, and
    Gemini CLI reads only `GEMINI.md` unless its `context.fileName` is
    reconfigured. Copilot reads every one of them and de-duplicates
    nothing, so only one may carry the body."""
    project = Path(project_dir)
    name = repo_name or project.resolve().name
    written = []
    for filename, tail, body in (
        ("AGENTS.md", _AGENTS_TAIL, None),
        ("CLAUDE.md", _CLAUDE_TAIL, _IMPORT_LINE),
        ("GEMINI.md", _GEMINI_TAIL, _IMPORT_LINE),
    ):
        path = project / filename
        existing = ""
        try:
            existing = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            pass
        content = render_engine_file(existing, name, tail, body)
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
    parser.add_argument(
        "--transport", choices=sorted(VALID_TRANSPORTS), default=None,
        help=(
            "remember this transport in the persistent "
            f"{TRANSPORT_ENV_VAR} environment variable. Omitted: an "
            "existing preference is kept, otherwise a detected Copilot "
            "seat sets it automatically."
        ),
    )
    parser.add_argument(
        "--no-transport-detect", action="store_true",
        help="do not touch the transport preference at all",
    )
    parser.add_argument(
        "--machine-scope", action="store_true",
        help=(
            "persist the transport preference for every account on the "
            "machine instead of this one. Requires elevation, and is the "
            "wrong choice when the admin account is a different user."
        ),
    )
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
    if ensure_gitignore(project):
        print(f"bootstrap: added {_IGNORE_RULE} to {project / '.gitignore'}")
    # Re-run on an existing clone, this is the migration: a clone made
    # before round refs existed carries neither refspec, and the fix only
    # reaches the machine a session moves to once its clone fetches them.
    if repo_root_for(project):
        for entry in ensure_round_refspecs(project):
            print(f"bootstrap: configured {entry} so verification-round "
                  "baselines travel with a push and a fetch")
    hook = ensure_commit_guard(project)
    if hook is not None:
        print(f"bootstrap: installed the step-execution commit guard at {hook}")
    if not args.no_transport_detect:
        value, reason = resolve_bootstrap_transport(args.transport)
        if value is None:
            print(f"bootstrap: transport unchanged — {reason}")
        else:
            scope = persist_transport_preference(
                value, machine=args.machine_scope
            )
            if scope is not None:
                downgrade = (
                    " (machine scope was requested but unavailable, so this "
                    "applies to your account only)"
                    if args.machine_scope and scope == SCOPE_USER else ""
                )
                print(
                    f"bootstrap: {reason}; persisted {TRANSPORT_ENV_VAR}="
                    f"{value} at {scope} scope{downgrade} (open a new "
                    "terminal to pick it up)"
                )
            else:
                print(
                    f"bootstrap: {reason}, but {TRANSPORT_ENV_VAR} could not "
                    f"be written at {SCOPE_USER} scope either. Set it "
                    f"yourself: {_manual_persist_hint(value)}",
                    file=sys.stderr,
                )
    config_path = scaffold_project_config(project)
    if config_path is not None:
        declared = detect_ecosystems(project)
        print(f"bootstrap: scaffolded {config_path}")
        print(
            "bootstrap: it declares "
            + (
                ", ".join(eco.key for eco in declared) + " — check the "
                "command and narrow what each suite covers"
                if declared else
                "no test suite, because nothing at the root of this "
                "repository says how its tests run; declare one before the "
                "first session that writes code"
            )
        )
    scaffolded = scaffold_bootstrap_sessions(project)
    for path in scaffolded:
        print(f"bootstrap: scaffolded {path}")
    if scaffolded:
        print(
            "bootstrap: commit what this just wrote — the declaration a "
            "session makes comes before its work, so session 1 is refused "
            "while setup's own files sit uncommitted in the tree."
        )
        print(
            "bootstrap: then tell your AI agent to \"start the next "
            "session\" — session 1 authors the project plan, then session 2 "
            "breaks it into numbered sessions. Neither waits on anyone."
        )
    else:
        print(
            "bootstrap: a session plan already exists; scaffolding skipped "
            "(instruction files refreshed only)."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
