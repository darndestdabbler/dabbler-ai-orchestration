#!/usr/bin/env python3
"""Set 107 S2 — the tutorial-fidelity gate.

Successor to Set 106's ``s3-check-literals.py``. That script was real work and
its checks are inherited here, but it lived under
``docs/session-sets/106-.../`` and was referenced by no CI job, no pytest test
and no npm script — so it was a re-runnable artifact, not a gate. Set 107 split
one tutorial into two (``hello-world.md``, the 15-minute first run, and
``adopt-dabbler.md``, the adoption walkthrough), which is exactly the shape that
drifts silently: two documents, one product, one sample bundle. This module
lives at repo level, is exercised by ``ai_router/tests/test_tutorial_gate.py``,
and therefore runs in CI on every push.

All output is ASCII-only so it is safe on a Windows ``cp1252`` console
(``lessons-learned.md`` L-079-1).

This module lives under ``ai_router/scripts/`` (NOT in the packaged wheel — the
dir has no ``__init__.py``), so it does not change the PyPI surface. Tests
import it by bare filename via the conftest ``SCRIPTS_DIR`` shim; CI runs it
directly::

    python ai_router/scripts/tutorial_gate.py [--repo-root .]

Exit status is ``0`` when every check passes, ``1`` on any violation.

The six checks:

1. **command-titles** — every ``Dabbler: <Title>`` string in ``docs/tutorials/``
   resolves to a real contributed command title in the extension's
   ``package.json``. Inherited from Set 106: this is the check that catches a
   reader being told to run a command that does not exist.

2. **bundle-output** — every line of ``bundle.json``'s ``expectedProgramOutput``
   appears verbatim in ``hello-world.md``. Set 107 S1 declared the tutorial the
   third consumer of the sample bundle and could not bind it, because the file
   on disk was still the old tutorial; this check is that binding.

3. **bundle-test-count** — the tutorial's ``Ran N tests`` lines agree with
   ``bundle.json``'s ``expectedTestCount``.

4. **bundle-literals** — ``programEntryPoint``, ``sampleSetSlug`` and
   ``missingFunction`` appear literally in the tutorial, and every sample file
   path the tutorial quotes exists in the rendered bundle (applying the bundle's
   ``dot-`` prefix rule).

5. **links** — every relative markdown link under ``docs/tutorials/`` resolves
   on disk. A two-document split breaks links first.

6. **first-run-constraint** — ``hello-world.md`` contains no git command, no
   YAML block, and none of the host/governance vocabulary the set's spec forbids
   on the first-run path. This is the check most specific to Set 107: the
   deliverable is defined by what is ABSENT, and absence is what a human
   re-reader stops noticing. The whole point of the set was that the previous
   tutorial taught branch protection, worktrees, CI and pull requests before the
   reader had seen an AI session do anything.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

# ---------------------------------------------------------------------------
# Shared types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Violation:
    """One gate finding. ``location`` is a repo-relative path (+ optional
    ``:line``); ``detail`` is a human-readable, ASCII-only explanation."""

    check: str
    location: str
    detail: str

    def render(self) -> str:
        return f"  {self.location}: {self.detail}"


# The document that must stay a 15-minute first run.
FIRST_RUN_DOC = "docs/tutorials/hello-world.md"


def _tutorials_dir(repo_root: Path) -> Path:
    return repo_root / "docs" / "tutorials"


def _markdown_files(repo_root: Path) -> list[Path]:
    d = _tutorials_dir(repo_root)
    return sorted(d.rglob("*.md")) if d.is_dir() else []


def _rel(repo_root: Path, p: Path) -> str:
    return str(p.relative_to(repo_root)).replace("\\", "/")


def _normalise(text: str) -> str:
    """Whitespace-normalised copy, with blockquote markers stripped.

    Markdown reflows prose across lines and a blockquote prefixes each
    continuation with ``> ``; neither is a content difference. Checks that look
    for a SUBSTRING run on this copy. Checks where whitespace IS the content
    (code blocks) deliberately do not use it.
    """
    text = re.sub(r"(?m)^\s*>\s?", " ", text)
    return re.sub(r"\s+", " ", text)


# ---------------------------------------------------------------------------
# Check 1 — command titles resolve to real contributed commands
# ---------------------------------------------------------------------------

# A dot is allowed only when a letter or digit follows it, so a title that
# genuinely contains one (`Dabbler: Open modules.yaml`) is captured whole while
# a sentence-final period stays outside the match ("Run Dabbler: New Module.").
# Set 108 S3: without the lookahead this matched `Dabbler: Open modules` and
# reported the repo's own correct tutorial text as a non-existent command.
_COMMAND_RE = re.compile(
    r"Dabbler: ([A-Z](?:[A-Za-z0-9 \-]|\.(?=[A-Za-z0-9]))*[A-Za-z0-9])"
)


def contributed_command_titles(repo_root: Path) -> set[str]:
    pkg_path = (
        repo_root / "tools" / "dabbler-ai-orchestration" / "package.json"
    )
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    titles = set()
    for c in pkg["contributes"]["commands"]:
        title = f"{c.get('category', '')}: {c['title']}".strip()
        titles.add(title)
    return titles


def check_command_titles(repo_root: Path) -> list[Violation]:
    try:
        titles = contributed_command_titles(repo_root)
    except (OSError, KeyError, json.JSONDecodeError):
        return []  # no extension in this tree; nothing to check against
    violations: list[Violation] = []
    for f in _markdown_files(repo_root):
        text = _normalise(f.read_text(encoding="utf-8"))
        for m in sorted({m.group(0) for m in _COMMAND_RE.finditer(text)}):
            # The trailing-punctuation-stripped form is what package.json holds;
            # markdown may bold or quote the title, which _normalise leaves.
            if m not in titles:
                violations.append(
                    Violation(
                        check="command-titles",
                        location=_rel(repo_root, f),
                        detail=(
                            f"'{m}' is not a contributed command title in the "
                            "extension's package.json"
                        ),
                    )
                )
    return violations


# ---------------------------------------------------------------------------
# Checks 2-4 — the tutorial is bound to the sample bundle
# ---------------------------------------------------------------------------


def load_bundle(repo_root: Path) -> dict | None:
    p = repo_root / "docs" / "templates" / "sample-project" / "bundle.json"
    if not p.is_file():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def _first_run_text(repo_root: Path) -> str | None:
    p = repo_root / FIRST_RUN_DOC
    if not p.is_file():
        return None
    return p.read_text(encoding="utf-8")


def check_bundle_output(repo_root: Path) -> list[Violation]:
    bundle = load_bundle(repo_root)
    text = _first_run_text(repo_root)
    if bundle is None or text is None:
        return []
    violations: list[Violation] = []
    for line in bundle.get("expectedProgramOutput", []):
        if line not in text:
            violations.append(
                Violation(
                    check="bundle-output",
                    location=FIRST_RUN_DOC,
                    detail=(
                        f"bundle.json expectedProgramOutput line {line!r} does "
                        "not appear in the tutorial"
                    ),
                )
            )
    return violations


_RAN_TESTS_RE = re.compile(r"Ran (\d+) tests?\b")
_FAILED_RE = re.compile(r"^FAILED \(errors=\d+\)", re.MULTILINE)
_OK_RE = re.compile(r"^OK\s*$", re.MULTILINE)


def check_bundle_test_count(repo_root: Path) -> list[Violation]:
    bundle = load_bundle(repo_root)
    text = _first_run_text(repo_root)
    if bundle is None or text is None:
        return []
    expected = bundle.get("expectedTestCount")
    if expected is None:
        return []
    found = _RAN_TESTS_RE.findall(text)
    if not found:
        return [
            Violation(
                check="bundle-test-count",
                location=FIRST_RUN_DOC,
                detail=(
                    "the tutorial shows no 'Ran N tests' output, so a reader "
                    "cannot check the test result against what they see"
                ),
            )
        ]
    violations: list[Violation] = []
    for n in sorted(set(found)):
        if int(n) != int(expected):
            violations.append(
                Violation(
                    check="bundle-test-count",
                    location=FIRST_RUN_DOC,
                    detail=(
                        f"tutorial shows 'Ran {n} tests' but bundle.json's "
                        f"expectedTestCount is {expected}"
                    ),
                )
            )

    # The red-to-green transition IS the first-run experience, so the tutorial
    # has to show BOTH ends of it. Round 1 of this session's verification caught
    # the check accepting a single tally -- which would have passed a tutorial
    # that quietly dropped the failing state, the very thing that makes the
    # sample worth running.
    for needle, which in ((_FAILED_RE, "failing"), (_OK_RE, "passing")):
        if not needle.search(text):
            violations.append(
                Violation(
                    check="bundle-test-count",
                    location=FIRST_RUN_DOC,
                    detail=(
                        f"the tutorial never shows the {which} test result; a "
                        "reader cannot see the red-to-green transition the "
                        "sample exists to demonstrate"
                    ),
                )
            )

    # ...and a tally at BOTH ends, not just one. The close backstop (round 4)
    # caught the version above passing a tutorial with only one `Ran N tests`
    # block: `FAILED` and `OK` were both present, so the endpoints looked
    # covered while a reader had nothing to compare the first run against.
    if len(found) < 2:
        violations.append(
            Violation(
                check="bundle-test-count",
                location=FIRST_RUN_DOC,
                detail=(
                    f"the tutorial shows only {len(found)} 'Ran N tests' "
                    "block; the reader needs one before the AI's change and "
                    "one after, or there is nothing to compare"
                ),
            )
        )
    return violations


def rendered_bundle_paths(repo_root: Path) -> set[str]:
    """Every path the bundle renders into the developer's folder.

    Mirrors the command's ``dot-`` basename rule: ``files/dot-gitignore``
    renders as ``.gitignore``. Basename-only, at every depth.
    """
    files_root = repo_root / "docs" / "templates" / "sample-project" / "files"
    if not files_root.is_dir():
        return set()
    out = set()
    for f in files_root.rglob("*"):
        if not f.is_file():
            continue
        rel = f.relative_to(files_root)
        name = rel.name
        if name.startswith("dot-"):
            rel = rel.with_name("." + name[len("dot-"):])
        out.add(str(rel).replace("\\", "/"))
    return out


# A backticked token that looks like a path into the sample: has a slash or a
# known sample extension, and no spaces.
_PATH_TOKEN_RE = re.compile(r"`([A-Za-z0-9_./\\-]+\.(?:py|json|md|yml|yaml))`")


def check_bundle_literals(repo_root: Path) -> list[Violation]:
    bundle = load_bundle(repo_root)
    text = _first_run_text(repo_root)
    if bundle is None or text is None:
        return []
    violations: list[Violation] = []

    for field in ("programEntryPoint", "sampleSetSlug", "missingFunction"):
        value = bundle.get(field)
        if not value:
            continue
        # A bare substring test is not enough: `missingFunction` is "shout" and
        # `sampleSetSlug` is "001-add-a-shout", so a plain `in` check passes on
        # the slug alone even if the function is never named. Require the value
        # as a standalone token -- neither word characters nor hyphens either
        # side. (Set 107 S1's third-provider opinion caught the same class: a
        # presence check that a coincidence satisfied.)
        token = re.compile(rf"(?<![\w-]){re.escape(value)}(?![\w-])")
        if not token.search(text):
            violations.append(
                Violation(
                    check="bundle-literals",
                    location=FIRST_RUN_DOC,
                    detail=(
                        f"bundle.json {field} {value!r} does not appear as a "
                        "standalone literal in the tutorial"
                    ),
                )
            )

    rendered = rendered_bundle_paths(repo_root)
    # Paths the tutorial legitimately names that the bundle does not render:
    # the venv the install step creates, and sibling documents.
    allowed_extra = {
        "main.py",  # also in the bundle; listed for clarity
        "adopt-dabbler.md",
        "hello-world.md",
        "release-and-recovery.md",
    }
    for token in sorted({m.group(1) for m in _PATH_TOKEN_RE.finditer(text)}):
        norm = token.replace("\\", "/").lstrip("./")
        if norm in rendered or norm in allowed_extra:
            continue
        if norm.startswith(".venv/"):
            continue
        violations.append(
            Violation(
                check="bundle-literals",
                location=FIRST_RUN_DOC,
                detail=(
                    f"the tutorial quotes sample path '{token}', which the "
                    "bundle does not render"
                ),
            )
        )
    return violations


# ---------------------------------------------------------------------------
# Check 4b — the tutorial's quoted UI strings match the shipped constants
# ---------------------------------------------------------------------------

# The strings live across two modules: the reusable constants in
# utils/sampleProject.ts, and the progress-notification title in the VS Code
# wiring that owns `withProgress`. Search both rather than assuming one.
SAMPLE_PROJECT_SOURCES = (
    "tools/dabbler-ai-orchestration/src/utils/sampleProject.ts",
    "tools/dabbler-ai-orchestration/src/commands/trySampleProject.ts",
)

# Each entry: the exported constant (or the distinctive fragment of a builder's
# return) in sampleProject.ts, and whether the tutorial must quote it. The
# tutorial tells the reader what to look for on screen; if the product's wording
# changes and the tutorial's does not, the reader is hunting for text that no
# longer exists. Round 1 of this session's verification named this gap: "the
# gate never reads sampleProject.ts, so the tutorial's dialog title, button
# labels, notifications and clipboard confirmation are not bound to their
# product constants."
_BOUND_UI_STRINGS = (
    "Create Sample Project",
    "Select an Empty Folder for the Sample Project",
    "Creating your sample project...",
    "Copy Starter Prompt",
    "Copied to clipboard. Paste it into your AI chat to begin.",
    "Your sample project is ready.",
)

# The starter line the landing copies, as a format with the slug substituted.
# `buildSampleStarterLine` builds it, and `Dabbler: Copy: Start next session`
# must produce the identical string -- v3 section 12.2 exposes the EXISTING
# affordance rather than inventing a second one, so the two can never drift.
_STARTER_LINE_TEMPLATE = "Start the next session of `{slug}`."
# The backtick-free prefix. Used where a backtick would not survive the round
# trip: the TypeScript escapes it inside a template literal
# (``Start the next session of \`${slug}\`.``), and the adoption tutorial
# substitutes the reader's own slug rather than the sample's.
_STARTER_LINE_PREFIX = "Start the next session of"


def check_ui_strings(repo_root: Path) -> list[Violation]:
    text = _first_run_text(repo_root)
    if text is None:
        return []
    violations: list[Violation] = []
    norm_doc = _normalise(text)

    sources = [repo_root / rel for rel in SAMPLE_PROJECT_SOURCES]
    present = [p for p in sources if p.is_file()]
    ts = "\n".join(p.read_text(encoding="utf-8") for p in present) if present else None

    for literal in _BOUND_UI_STRINGS:
        # Fail closed on the SOURCE side: if the constant is not in the shipped
        # modules any more, the tutorial is quoting something the product no
        # longer says, and that is the drift this check exists to catch.
        if ts is not None and literal not in ts:
            violations.append(
                Violation(
                    check="ui-strings",
                    location=SAMPLE_PROJECT_SOURCES[0],
                    detail=(
                        f"the tutorial quotes {literal!r} but no such string "
                        "remains in the shipped modules"
                    ),
                )
            )
            continue
        if _normalise(literal) not in norm_doc:
            violations.append(
                Violation(
                    check="ui-strings",
                    location=FIRST_RUN_DOC,
                    detail=(
                        f"the product shows {literal!r} but the tutorial does "
                        "not quote it, so a reader cannot match what is on "
                        "screen"
                    ),
                )
            )

    # The starter-line TEMPLATE is itself pinned to the shipped implementation.
    # The close backstop (round 4) pointed out that hard-coding it here just
    # moves the drift one level up: if `buildSampleStarterLine` changes wording,
    # this gate would happily keep enforcing the old form against the tutorial
    # and report everything green.
    prefix = _STARTER_LINE_PREFIX
    if ts is not None and prefix not in ts:
        violations.append(
            Violation(
                check="ui-strings",
                location=SAMPLE_PROJECT_SOURCES[0],
                detail=(
                    f"the gate pins the starter line as {prefix!r}, but the "
                    "shipped buildSampleStarterLine no longer produces that "
                    "wording -- update the gate and both tutorials together"
                ),
            )
        )

    bundle = load_bundle(repo_root)
    if bundle and bundle.get("sampleSetSlug"):
        starter = _STARTER_LINE_TEMPLATE.format(slug=bundle["sampleSetSlug"])
        if starter not in text:
            violations.append(
                Violation(
                    check="ui-strings",
                    location=FIRST_RUN_DOC,
                    detail=(
                        f"the tutorial does not carry the starter line "
                        f"{starter!r} verbatim -- that exact string is what "
                        "the landing copies to the clipboard"
                    ),
                )
            )

    # The adoption tutorial carries the same starter-line mechanic for its own
    # sets, so it drifts from the product the same way. It is checked on the
    # PREFIX rather than the whole line, because its slugs are the reader's own
    # (`003-greeter-plan`), not the sample's. Round 3's adjudication named this
    # exact residual -- "pinned only by the command-title check" -- and the
    # close backstop was right that naming it is not the same as closing it.
    adopt = repo_root / "docs" / "tutorials" / "adopt-dabbler.md"
    if adopt.is_file() and prefix not in adopt.read_text(encoding="utf-8"):
        violations.append(
            Violation(
                check="ui-strings",
                location="docs/tutorials/adopt-dabbler.md",
                detail=(
                    f"the adoption tutorial no longer shows the starter line "
                    f"{prefix!r}; it and hello-world.md must not drift apart "
                    "on the one string a reader copies"
                ),
            )
        )
    return violations


# ---------------------------------------------------------------------------
# Check 4c — every Windows interpreter command has its POSIX twin
# ---------------------------------------------------------------------------

# The close backstop (round 4) named the gap that mattered most: nothing checked
# the interpreter commands, so THIS SESSION'S OWN DEFECT -- step 4 shipping only
# `.venv\Scripts\python.exe` while step 2 gave both forms -- would have stayed
# green. A macOS or Linux reader hits a path that does not exist, at the exact
# step where the tutorial pays off.
#
# The contract is a pair: every argument list shown for the Windows interpreter
# must also be shown for the POSIX one. Comparing ARGUMENTS rather than whole
# lines means a reworded surrounding sentence cannot break the check, and a
# typo'd or dropped platform alternative cannot pass it.
_WIN_PY_RE = re.compile(r"\.venv\\Scripts\\python\.exe([^\n`]*)")
_POSIX_PY_RE = re.compile(r"\.venv/bin/python([^\n`]*)")


def _interpreter_invocations(text: str) -> tuple[Counter, Counter]:
    """Counted, not de-duplicated.

    Round 5 caught the set-based version being unable to detect the very
    regression it was written for. `-m unittest` is shown TWICE (once before the
    AI's change, once after), so deleting section 4's POSIX line left
    `-m unittest` still present in the POSIX set via section 2, and the check
    reported green. Multiplicity is the contract: N Windows occurrences require
    N POSIX ones.
    """
    win = Counter(m.group(1).strip() for m in _WIN_PY_RE.finditer(text))
    posix = Counter(m.group(1).strip() for m in _POSIX_PY_RE.finditer(text))
    return win, posix


def canonical_invocations(bundle: dict) -> set[str]:
    """The argument strings the tutorial is allowed to show, from bundle.json.

    Round 6 (close backstop) found symmetry to be the wrong contract: editing
    BOTH platform lines to `-m unitest` left the Counters equal and the gate
    green, while every reader got `No module named unitest`. Symmetry cannot
    catch a symmetric typo. The bundle already carries the canonical forms --
    `testCommandArgs` and `programEntryPoint` are the same fields the smoke test
    runs -- so validating against them closes the whole class (symmetric typo,
    asymmetric typo, and a dropped platform) instead of one shape of it.
    """
    out = set()
    args = bundle.get("testCommandArgs")
    if args:
        out.add(" ".join(args))
    entry = bundle.get("programEntryPoint")
    if entry:
        out.add(entry)
    return out


def check_platform_pairs(repo_root: Path) -> list[Violation]:
    text = _first_run_text(repo_root)
    if text is None:
        return []
    win, posix = _interpreter_invocations(text)
    violations: list[Violation] = []

    bundle = load_bundle(repo_root)
    canonical = canonical_invocations(bundle) if bundle else set()
    if canonical:
        for args in sorted(set(win) | set(posix)):
            if args and args not in canonical:
                violations.append(
                    Violation(
                        check="platform-pairs",
                        location=FIRST_RUN_DOC,
                        detail=(
                            f"the tutorial runs the project's Python with "
                            f"{args!r}, which is not a command bundle.json "
                            f"defines (expected one of "
                            f"{sorted(canonical)}) -- a reader following this "
                            "literally gets an error"
                        ),
                    )
                )
        # Both canonical commands must actually appear, or the tutorial has
        # silently dropped a step rather than mistyped one.
        for args in sorted(canonical):
            if args not in win and args not in posix:
                violations.append(
                    Violation(
                        check="platform-pairs",
                        location=FIRST_RUN_DOC,
                        detail=(
                            f"bundle.json defines {args!r} but the tutorial "
                            "never shows the reader running it"
                        ),
                    )
                )

    for args in sorted(set(win) | set(posix)):
        w, p = win.get(args, 0), posix.get(args, 0)
        if w == p:
            continue
        shown = f"python -- {args}".strip() if args else "python"
        if w > p:
            violations.append(
                Violation(
                    check="platform-pairs",
                    location=FIRST_RUN_DOC,
                    detail=(
                        f"'{shown}' is shown {w} time(s) for Windows but "
                        f"{p} time(s) for macOS/Linux; at least one step "
                        "leaves a POSIX reader with no runnable command"
                    ),
                )
            )
        else:
            violations.append(
                Violation(
                    check="platform-pairs",
                    location=FIRST_RUN_DOC,
                    detail=(
                        f"'{shown}' is shown {p} time(s) for macOS/Linux but "
                        f"{w} time(s) for Windows; at least one step leaves a "
                        "Windows reader with no runnable command"
                    ),
                )
            )
    return violations


# ---------------------------------------------------------------------------
# Check 5 — relative links resolve
# ---------------------------------------------------------------------------

_LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")


def check_links(repo_root: Path) -> list[Violation]:
    violations: list[Violation] = []
    for f in _markdown_files(repo_root):
        for m in _LINK_RE.finditer(f.read_text(encoding="utf-8")):
            target = m.group(1).split("#", 1)[0].strip()
            if not target or "://" in target or target.startswith("mailto:"):
                continue
            resolved = (f.parent / target).resolve()
            if not resolved.exists():
                violations.append(
                    Violation(
                        check="links",
                        location=_rel(repo_root, f),
                        detail=f"relative link '{target}' does not resolve",
                    )
                )
    return violations


# ---------------------------------------------------------------------------
# Check 6 — the first-run document stays a first run
# ---------------------------------------------------------------------------

# A git command the reader would have to type. `git` alone is not banned --
# `.gitignore`, `git-scm.com` and prose about version history are fine; being
# told to RUN git is not.
#
# This deliberately matches `git <any-subcommand>` rather than an allowlist of
# subcommands. Round 1 of this session's verification caught the allowlist
# version letting `git diff`, `git log`, `git show`, `git reset`, `git clean`,
# `git rm`, `git cherry-pick` and `git worktree` straight through -- a
# hand-maintained list of things to forbid always falls behind, which is the
# same reason the sample bundle derives its own file list instead of hardcoding
# one. The negative lookahead carries the two forms that are prose, not
# instructions.
# Round 6 caught the option forms: `git --version`, `git -C <dir>` and
# `git -c user.email=...` all start with a dash, and the subcommand branch below
# requires a letter. `git --version` beside the new Git prerequisite is an
# especially plausible edit.
_GIT_COMMAND_RE = re.compile(
    r"\bgit\s+(?:-{1,2}[A-Za-z]"
    r"|(?!commands?\b|history\b|identity\b)[a-z][a-z-]{1,20}\b)",
    re.IGNORECASE,
)

# Host, governance and team vocabulary that has an owner OTHER than the
# first-run document. Each entry is a whole-word regex.
# Each entry is (regex, why, re-flags).
#
# Nearly all are case-INSENSITIVE, because Round 1 of this session's
# verification found a sentence-initial "Commit your work first." walking past
# the case-sensitive version. The two exceptions are deliberate: `CI`,
# `CODEOWNERS` and the key names are acronyms whose lowercase forms are either
# ordinary English or nothing at all.
_I = re.IGNORECASE
_BANNED_TERMS: tuple[tuple[str, str, int], ...] = (
    (r"\bGitHub\b(?!\s+Copilot)", "git host configuration", _I),
    (r"\bAzure\s+DevOps\b", "git host configuration", _I),
    (r"\bGitLab\b|\bBitbucket\b", "git host configuration", _I),
    (r"\bpull\s+requests?\b", "pull-request workflow", _I),
    # Round 1 caught the narrow form: only `branch protection` / `branch
    # polic...` were banned, so an ordinary "start a branch" instruction passed.
    (r"\bbranch(?:es|ing)?\b", "branching", _I),
    (r"\bcommit(?:s|ted|ting)?\b", "commit workflow", _I),
    (r"\brepositor(?:y|ies)\b", "repository setup", _I),
    (r"\bmerges?\b|\bmerging\b", "merge workflow", _I),
    (r"\bCODEOWNERS\b", "review routing", 0),
    (r"\bworktrees?\b", "worktree terminology", _I),
    (r"\bteammates?\b|\bcollaborators?\b", "teammate setup", _I),
    (r"\bcontinuous\s+integration\b", "CI configuration", _I),
    (r"\bCI\b", "CI configuration", 0),
    (r"\bpipelines?\b", "CI configuration", _I),
    (r"\bapprovals?\b|\breviewers?\b", "review/approval workflow", _I),
    (r"\bDABBLER_[A-Z_]*KEY\b", "provider-key configuration", 0),
    (r"\bbudget\b", "budget configuration", _I),
)

_YAML_FENCE_RE = re.compile(r"^\s*```\s*ya?ml\b", re.MULTILINE | re.IGNORECASE)

# A line that looks like YAML content: `key:` or `- key:` at some indent, with
# no shell-ish or prose-ish giveaway. Round 1 caught the label-only check: EVERY
# fence in this tutorial is unlabelled, so a contributor pasting configuration
# in the document's own established style would have sailed past.
_YAML_CONTENT_RE = re.compile(r"^\s*(?:-\s+)?[A-Za-z_][A-Za-z0-9_-]*:(?:\s|$)")
# An indented scalar list item under a mapping key (`providers:` / `  - codex`).
# Round 3's nit: requiring EVERY line to be a `key:` missed exactly this shape.
_YAML_LIST_ITEM_RE = re.compile(r"^\s+-\s+\S")
# Comment lines and document markers: YAML furniture, skipped when classifying.
_YAML_FURNITURE_RE = re.compile(r"^\s*(?:#|---\s*$|\.\.\.\s*$)")
# A block-scalar header: `script: |`, `run: >-`, etc. Its continuation lines are
# arbitrary text at a deeper indent.
_BLOCK_SCALAR_RE = re.compile(
    r"^\s*(?:-\s+)?[A-Za-z_][A-Za-z0-9_-]*:\s*[|>][+-]?\d*\s*$"
)


def _fenced_blocks(lines: list[str]) -> list[tuple[int, list[str]]]:
    """Every fenced block as ``(1-based start line, body lines)``."""
    blocks: list[tuple[int, list[str]]] = []
    inside = False
    start = 0
    body: list[str] = []
    for i, line in enumerate(lines, start=1):
        if line.lstrip().startswith("```"):
            if inside:
                blocks.append((start, body))
                body = []
            else:
                start = i
            inside = not inside
            continue
        if inside:
            body.append(line)
    return blocks


def _untagged_yaml_blocks(lines: list[str]) -> list[int]:
    """Start lines of fenced blocks whose body reads as YAML.

    Round 3 raised two shapes the first version missed. One is taken and one is
    deliberately declined:

    - **Taken:** a mapping key followed by an indented scalar list
      (``providers:`` / ``  - codex``). The first version required EVERY line to
      be a ``key:``, so the list items disqualified the block.
    - **Declined:** a lone ``tier: lightweight``. A ONE-LINE ``word: value``
      fence is not distinguishable from configuration by shape, and this
      tutorial legitimately contains two of them —
      ``Dabbler: Try a sample project`` and ``close_session: succeeded``.
      Widening to single lines flagged both. Two real lines stay the threshold;
      the residual is named in the session disposition rather than traded for
      false positives on the document the gate exists to protect.

    At least one ``key:`` line is required, so a shell transcript carrying a
    ``-`` flag cannot be mistaken for configuration.
    """
    out = []
    for start, body in _fenced_blocks(lines):
        # Comment-only lines and document markers are YAML furniture, not
        # content. Round 5 caught the previous version failing open on an
        # ordinary commented block: a `# ...` line matched neither pattern, so
        # the `all(...)` went false and the block was silently accepted --
        # exactly the shape a maintainer pastes when copying real config.
        real = [
            b
            for b in body
            if b.strip() and not _YAML_FURNITURE_RE.match(b)
        ]
        if len(real) < 2:
            continue
        if not any(_YAML_CONTENT_RE.match(b) for b in real):
            continue
        # Block scalars: `script: |` (or `>`) followed by indented continuation
        # lines that are arbitrary text. Round 5 asked for these and the round-5
        # remediation did not implement them; round 6 caught the omission. Once
        # a block-scalar header is seen, its more-indented continuation lines
        # are part of that scalar, not disqualifying content.
        classified = []
        scalar_indent: int | None = None
        for b in real:
            indent = len(b) - len(b.lstrip())
            if scalar_indent is not None and indent > scalar_indent:
                classified.append(True)
                continue
            scalar_indent = None
            ok = bool(
                _YAML_CONTENT_RE.match(b) or _YAML_LIST_ITEM_RE.match(b)
            )
            if ok and _BLOCK_SCALAR_RE.match(b):
                scalar_indent = indent
            classified.append(ok)
        if all(classified):
            out.append(start)
    return out


# The one sanctioned mention of anything beyond the sample (the set's spec
# requires it, so its ABSENCE is as much a defect as forbidden content).
_FULL_TIER_SENTENCE_RE = re.compile(
    r"Full tier adds independent cross-provider verification", re.IGNORECASE
)


def check_first_run_constraint(repo_root: Path) -> list[Violation]:
    p = repo_root / FIRST_RUN_DOC
    if not p.is_file():
        return []
    text = p.read_text(encoding="utf-8")
    lines = text.splitlines()
    violations: list[Violation] = []

    def flag(pattern: re.Pattern[str], detail: str) -> None:
        for i, line in enumerate(lines, start=1):
            m = pattern.search(line)
            if m:
                violations.append(
                    Violation(
                        check="first-run-constraint",
                        location=f"{FIRST_RUN_DOC}:{i}",
                        detail=f"{detail} ({m.group(0).strip()!r})",
                    )
                )

    flag(
        _GIT_COMMAND_RE,
        "the first run must not ask the reader to type a git command",
    )
    flag(
        _YAML_FENCE_RE,
        "the first run must not contain YAML for the reader to edit",
    )
    for start in _untagged_yaml_blocks(lines):
        violations.append(
            Violation(
                check="first-run-constraint",
                location=f"{FIRST_RUN_DOC}:{start}",
                detail=(
                    "this unlabelled code fence reads as YAML; the first run "
                    "must not contain YAML for the reader to edit"
                ),
            )
        )
    for pattern, why, flags in _BANNED_TERMS:
        flag(
            re.compile(pattern, flags),
            f"{why} is owned by adopt-dabbler.md, not by the first run",
        )

    # The required closing sentence, exactly once. Matched on the
    # whitespace-normalised copy: markdown reflows the sentence across lines,
    # and a line break is not a content difference.
    hits = len(_FULL_TIER_SENTENCE_RE.findall(_normalise(text)))
    if hits != 1:
        violations.append(
            Violation(
                check="first-run-constraint",
                location=FIRST_RUN_DOC,
                detail=(
                    "the spec requires exactly ONE sentence noting that Full "
                    "tier adds independent cross-provider verification; found "
                    f"{hits}"
                ),
            )
        )
    return violations


# ---------------------------------------------------------------------------
# Aggregate + CLI
# ---------------------------------------------------------------------------

# Every surface the gate reads to do its job. The individual checks return no
# violations when a surface is absent, so that they can run on a synthetic tree
# -- but on a tree that HAS docs/tutorials/, an absent surface means the gate is
# silently checking nothing. Round 1 of this session's verification named that
# fail-open path; this check closes it.
_REQUIRED_SURFACES = (
    FIRST_RUN_DOC,
    "docs/tutorials/adopt-dabbler.md",
    "docs/templates/sample-project/bundle.json",
    "tools/dabbler-ai-orchestration/package.json",
)


def check_required_surfaces(repo_root: Path) -> list[Violation]:
    if not _tutorials_dir(repo_root).is_dir():
        return []  # not a tree this gate applies to at all
    return [
        Violation(
            check="required-surfaces",
            location=rel,
            detail=(
                "required by the tutorial gate but missing; without it the "
                "gate silently checks nothing"
            ),
        )
        for rel in _REQUIRED_SURFACES
        if not (repo_root / rel).is_file()
    ]


ALL_CHECKS = (
    ("required-surfaces", check_required_surfaces),
    ("command-titles", check_command_titles),
    ("bundle-output", check_bundle_output),
    ("bundle-test-count", check_bundle_test_count),
    ("bundle-literals", check_bundle_literals),
    ("ui-strings", check_ui_strings),
    ("platform-pairs", check_platform_pairs),
    ("links", check_links),
    ("first-run-constraint", check_first_run_constraint),
)


def run_all(repo_root: Path) -> list[Violation]:
    violations: list[Violation] = []
    for _name, fn in ALL_CHECKS:
        violations.extend(fn(repo_root))
    return violations


def _default_repo_root() -> Path:
    # scripts/ -> ai_router/ -> repo root
    return Path(__file__).resolve().parent.parent.parent


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Set 107 S2 tutorial-fidelity gate."
    )
    parser.add_argument(
        "--repo-root",
        default=str(_default_repo_root()),
        help="Repository root to scan (defaults to this checkout).",
    )
    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve()

    print(f"[tutorial-gate] scanning {repo_root}")
    violations = run_all(repo_root)
    if not violations:
        print("[tutorial-gate] OK - tutorials match the product and the bundle.")
        return 0

    by_check: dict[str, list[Violation]] = {}
    for v in violations:
        by_check.setdefault(v.check, []).append(v)
    print(f"[tutorial-gate] FAILED - {len(violations)} violation(s):")
    for check, items in by_check.items():
        print(f"- {check} ({len(items)}):")
        for v in items:
            print(v.render())
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
