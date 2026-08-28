"""What the machine already knows about a change, before a model sees it.

Three kinds of fact live here, and they share a module because they share a
deadline: all of them are settled before the first token is bought.

- **The changed surface.** The diff, the untracked files the diff only names,
  and the rendered bundle a verifier reviews. It is a rendering of a fact, not
  a judgement about one.
- **The declared controls.** Compile, typecheck, lint, analyzer — normalized
  into one closed vocabulary so a reader never has to know which tool spoke.
- **The changed lines.** Which lines the change adds, per path. Context for
  whoever reads the record; nothing is judged by it.

The vocabulary is closed at four words and the missing one is the point: a
control this repository does not declare reads ``not_applicable``, a control
that could not be executed reads ``unknown``, and neither is ever ``pass``.
An absent tool that reports success is worse than no tool at all, because the
record then carries a green row nobody ran.

Facts are cheap and models are not, so a red *required* fact returns to the
author here rather than riding into a verification round as something for a
verifier to discover.
"""

from __future__ import annotations

import datetime
import json
import os
import re
import shlex
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .evidence import (
    repo_root_for,
    resolve_sessions_dir,
    run_git,
    snapshot_worktree_tree,
)
from .ledger import LIFECYCLE_WRITTEN_FILES, RUNS_DIRNAME

DEFAULT_EVIDENCE_CHAR_CAP = 600 * 1024
_UNTRACKED_INLINE_CAP = 64 * 1024

DEFAULT_DIFF_EXCLUDES = (
    "dist", "out", "node_modules", ".venv", "__pycache__", "*.vsix",
    ".dabbler",
)

FACTS_FILENAME = "deterministic-facts.jsonl"

# A control gets one word, and the four are not interchangeable. "pass" is
# reserved for a control that ran and was green; nothing else may borrow it.
STATUS_PASS = "pass"
STATUS_FAIL = "fail"
STATUS_NOT_APPLICABLE = "not_applicable"
STATUS_UNKNOWN = "unknown"
STATUSES = (STATUS_PASS, STATUS_FAIL, STATUS_NOT_APPLICABLE, STATUS_UNKNOWN)

# Declared once each. A second lint control would need a name to be told
# apart, and a name is a thing to get wrong; the kind is the identity.
CONTROL_KINDS = ("compile", "typecheck", "lint", "analyzer")
CONTROL_FIELDS = frozenset({"kind", "command", "required"})

CONTROL_TIMEOUT_SECONDS = 600

KIND_TESTS = "tests"

_BOOKKEEPING_BASENAMES = frozenset(LIFECYCLE_WRITTEN_FILES)


class FactsError(RuntimeError):
    pass


class EvidenceEmptyError(FactsError):
    """Nothing to review: a bundle a verifier cannot review must never be
    routed — a session that already committed its work once verified
    nothing and nearly closed clean."""


class EvidenceTooLargeError(FactsError):
    pass


# --- The changed surface -----------------------------------------------------

def evidence_char_cap() -> int:
    raw = os.environ.get("AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS")
    try:
        return int(raw) if raw else DEFAULT_EVIDENCE_CHAR_CAP
    except ValueError:
        return DEFAULT_EVIDENCE_CHAR_CAP


def build_diff_pathspecs(excludes=DEFAULT_DIFF_EXCLUDES) -> list:
    """Depth-agnostic exclusions: the anchored form missed nested
    ``tools/x/dist``.

    The lifecycle's own files are excluded too. They are the record of the
    session, not its work, and a session that rewrites or relocates them
    would otherwise spend the reviewer's whole evidence budget showing the
    reviewer its own bookkeeping. Their paths are still listed, so the
    exclusion is visible rather than silent.
    """
    pathspecs = ["."]
    for pattern in excludes:
        pathspecs.append(f":(exclude,glob)**/{pattern}")
        if "*" not in pattern:
            pathspecs.append(f":(exclude,glob)**/{pattern}/**")
    for basename in LIFECYCLE_WRITTEN_FILES:
        pathspecs.append(f":(exclude,glob)**/{basename}")
    return pathspecs


def _tracked_bookkeeping(repo_root) -> list:
    """The lifecycle files this change touches, by path only."""
    rc, out, _ = run_git(
        repo_root, "diff", "--name-only", "-z", "HEAD", "--",
        *(f"**/{name}" for name in LIFECYCLE_WRITTEN_FILES),
    )
    if rc != 0:
        return []
    return [p for p in out.split("\0") if p]


def _untracked_contents(repo_root, pathspecs) -> tuple:
    """(inlined, omitted, bookkeeping): git diff shows only names for new
    files, so their contents ride separately. Exclusion is never silent —
    omitted files are listed with the reason."""
    rc, out, _ = run_git(
        repo_root, "ls-files", "--others", "--exclude-standard", "-z", "--",
        *pathspecs,
    )
    if rc != 0:
        return [], [], []
    inlined, omitted, bookkeeping = [], [], []
    for rel in (p for p in out.split("\0") if p):
        basename = rel.replace("\\", "/").rsplit("/", 1)[-1]
        if basename in _BOOKKEEPING_BASENAMES:
            bookkeeping.append(rel)
            continue
        full = Path(repo_root) / rel
        try:
            if full.is_symlink():
                omitted.append((rel, "symlink (not followed)"))
                continue
            size = full.stat().st_size
            if size > _UNTRACKED_INLINE_CAP:
                omitted.append((rel, f"oversized ({size} bytes)"))
                continue
            text = full.read_bytes().decode("utf-8")
        except UnicodeDecodeError:
            omitted.append((rel, "binary / non-UTF-8"))
            continue
        except OSError:
            omitted.append((rel, "unreadable"))
            continue
        inlined.append((rel, text))
    return inlined, omitted, bookkeeping


def _render_evidence(
    status: str, diff: str, diff_heading: str, inlined, omitted, bookkeeping
) -> str:
    parts = [
        "The session's work, as the working tree presents it.",
        "",
        "#### git status --short",
        "```",
        status or "(clean -- no changes reported)",
        "```",
        "",
        f"#### {diff_heading}",
        "",
        "```diff",
        diff or "(empty diff)",
        "```",
    ]
    if inlined:
        parts.append(
            "\n#### Untracked file contents (new files, absent from the diff)"
        )
        for rel, text in inlined:
            parts.extend([f"\n**{rel}**", "```", text, "```"])
    if omitted:
        parts.append("\n#### Untracked paths NOT inlined")
        parts.extend(f"- {rel} — {reason}" for rel, reason in omitted)
    if bookkeeping:
        parts.append("\n#### Expected framework bookkeeping (paths only)")
        parts.extend(f"- {rel}" for rel in bookkeeping)
    return "\n".join(parts)


def assemble_evidence(repo_root, sessions_dir, session_number: int) -> str:
    """Round 1: full working-tree evidence vs HEAD."""
    pathspecs = build_diff_pathspecs()
    rc, status, err = run_git(repo_root, "status", "--short")
    if rc != 0:
        raise FactsError(f"git status failed: {err}")
    rc, diff, err = run_git(
        repo_root, "diff", "--no-color", "HEAD", "--", *pathspecs
    )
    if rc != 0:
        raise FactsError(f"git diff failed: {err}")
    inlined, omitted, bookkeeping = _untracked_contents(repo_root, pathspecs)
    bookkeeping = bookkeeping + _tracked_bookkeeping(repo_root)
    if not diff.strip() and not inlined:
        raise EvidenceEmptyError(
            "the evidence bundle is empty (no diff vs HEAD, no untracked "
            "files). If the session's work is already committed, verify "
            "against the commit range instead of routing an empty review."
        )
    heading = (
        "Complete diff (working tree vs `HEAD`; generated-bundle "
        f"exclusions: {', '.join(DEFAULT_DIFF_EXCLUDES)})"
    )
    rendered = _render_evidence(
        status, diff, heading, inlined, omitted, bookkeeping
    )
    check_evidence_cap(rendered)
    return rendered


def assemble_fix_delta_evidence(
    repo_root, sessions_dir, session_number: int, baseline_tree: str
) -> str:
    """Rounds ≥2: tree-to-tree fix delta only. The untracked collector is
    deliberately absent — the tree diff already carries new files as added
    hunks."""
    current_tree = snapshot_worktree_tree(repo_root)
    if current_tree is None:
        raise FactsError(
            "could not snapshot the working tree for the fix delta "
            "(failing closed)"
        )
    pathspecs = build_diff_pathspecs()
    rc, status, _ = run_git(repo_root, "status", "--short")
    rc, diff, err = run_git(
        repo_root, "diff", "--no-color", baseline_tree, current_tree, "--",
        *pathspecs,
    )
    if rc != 0:
        raise FactsError(f"fix-delta diff failed: {err}")
    heading = (
        f"FIX DELTA ONLY (tree-to-tree: previous round "
        f"{baseline_tree[:12]} -> current working tree "
        f"{current_tree[:12]}). This is NOT the full session diff — new "
        "defects are admissible only within these hunks."
    )
    rendered = _render_evidence(status, diff, heading, [], [], [])
    check_evidence_cap(rendered)
    return rendered


def check_evidence_cap(rendered: str) -> None:
    cap = evidence_char_cap()
    if len(rendered) > cap:
        raise EvidenceTooLargeError(
            f"evidence bundle is {len(rendered)} chars (cap {cap}). Split "
            "the session or raise AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS."
        )


# --- Changed lines -----------------------------------------------------------

_HUNK = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


def _posix(path: str) -> str:
    return str(path).replace("\\", "/").strip()


def parse_changed_lines(diff: str) -> dict:
    """``{path: (line number, ...)}`` for the lines the diff ADDS, numbered
    in the post-image.

    Deletions are deliberately absent: the added lines are the ones a reader
    can go and look at in the tree as it now stands."""
    out: dict = {}
    path = None
    for line in diff.splitlines():
        if line.startswith("+++ "):
            target = line[4:].strip()
            path = None
            if target != "/dev/null":
                path = _posix(target[2:] if target[1:2] == "/" else target)
            continue
        if path is None or not line.startswith("@@"):
            continue
        match = _HUNK.match(line)
        if not match:
            continue
        start = int(match.group(1))
        count = 1 if match.group(2) is None else int(match.group(2))
        if count == 0:  # a pure deletion hunk adds nothing
            continue
        out.setdefault(path, set()).update(range(start, start + count))
    return {path: tuple(sorted(lines)) for path, lines in sorted(out.items())}


def changed_lines(repo_root, baseline_tree=None) -> Optional[dict]:
    """The lines this working tree adds against *baseline_tree*, or against
    HEAD when none is given. ``None`` when git cannot answer — an
    unmeasurable change is never "no change"."""
    current = snapshot_worktree_tree(repo_root)
    if current is None:
        return None
    if not baseline_tree:
        rc, head, _ = run_git(repo_root, "rev-parse", "HEAD^{tree}")
        if rc != 0 or not head:
            return None
        baseline_tree = head
    rc, diff, _ = run_git(
        repo_root, "-c", "core.quotepath=false", "diff", "--no-color",
        "--no-ext-diff", "--unified=0", baseline_tree, current, "--",
        *build_diff_pathspecs(),
    )
    if rc != 0:
        return None
    return parse_changed_lines(diff)


# --- The declared controls ---------------------------------------------------

@dataclass(frozen=True)
class ControlSpec:
    kind: str
    command: str
    required: bool = False


@dataclass(frozen=True)
class ControlLoadResult:
    controls: tuple = ()
    errors: tuple = ()

    @property
    def ok(self) -> bool:
        return not self.errors


@dataclass(frozen=True)
class ControlFact:
    kind: str
    status: str
    command: str = ""
    required: bool = False
    detail: str = ""

    @property
    def red(self) -> bool:
        """A required control is red on anything but green. ``unknown`` is
        red on purpose: the author is the only one who can turn "the tool did
        not run" into an answer, and a verifier cannot."""
        return self.required and self.status in (STATUS_FAIL, STATUS_UNKNOWN)

    def to_dict(self) -> dict:
        out = {"kind": self.kind, "status": self.status,
               "required": self.required}
        if self.command:
            out["command"] = self.command
        if self.detail:
            out["detail"] = self.detail
        return out


def load_controls_checked(config) -> ControlLoadResult:
    """The declared controls plus every declaration error. A control lost to
    a typo and a control never declared both end up ``not_applicable``, and
    only the error list tells them apart."""
    if not isinstance(config, dict):
        return ControlLoadResult()
    raw = (config.get("testing") or {}).get("controls")
    if raw is None:
        return ControlLoadResult()
    if not isinstance(raw, list):
        return ControlLoadResult(errors=("testing.controls must be a list",))
    controls, errors, seen = [], [], set()
    for index, entry in enumerate(raw):
        label = f"testing.controls[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{label} must be a mapping")
            continue
        unknown = sorted(set(entry) - CONTROL_FIELDS)
        if unknown:
            errors.append(f"{label} has unknown key(s) {unknown}")
        kind = entry.get("kind")
        command = entry.get("command")
        if kind not in CONTROL_KINDS:
            errors.append(
                f"{label}.kind must be one of {list(CONTROL_KINDS)}"
            )
            continue
        if kind in seen:
            errors.append(f"{label}.kind '{kind}' is declared more than once")
            continue
        if not isinstance(command, str) or not command.strip():
            errors.append(f"{label}.command must be a non-empty string")
            continue
        seen.add(kind)
        controls.append(ControlSpec(
            kind=kind, command=command.strip(),
            required=bool(entry.get("required")),
        ))
    return ControlLoadResult(tuple(controls), tuple(errors))


def run_control(repo_root, spec: ControlSpec) -> ControlFact:
    """One control, normalized. A tool that exits non-zero FAILED; a tool
    that could not be launched at all is UNKNOWN, never a quiet pass."""
    try:
        argv = shlex.split(spec.command)
    except ValueError as exc:
        return ControlFact(
            spec.kind, STATUS_UNKNOWN, spec.command, spec.required,
            f"the declared command could not be parsed: {exc}",
        )
    if not argv:
        return ControlFact(
            spec.kind, STATUS_UNKNOWN, spec.command, spec.required,
            "the declared command is empty",
        )
    if argv[0] in ("python", "python3"):
        # The interpreter running the router, not whatever PATH resolves: a
        # control that silently ran against a different environment is not a
        # fact about this one.
        argv[0] = sys.executable
    try:
        proc = subprocess.run(
            argv, cwd=str(repo_root), capture_output=True, text=True,
            encoding="utf-8", errors="replace",
            timeout=CONTROL_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return ControlFact(
            spec.kind, STATUS_UNKNOWN, spec.command, spec.required,
            f"no result within {CONTROL_TIMEOUT_SECONDS}s",
        )
    except (OSError, ValueError) as exc:
        return ControlFact(
            spec.kind, STATUS_UNKNOWN, spec.command, spec.required,
            f"could not be executed: {exc}",
        )
    if proc.returncode == 0:
        return ControlFact(
            spec.kind, STATUS_PASS, spec.command, spec.required,
        )
    tail = ((proc.stdout or "") + (proc.stderr or "")).strip()
    return ControlFact(
        spec.kind, STATUS_FAIL, spec.command, spec.required,
        f"exit {proc.returncode}: {tail[-1500:]}" if tail
        else f"exit {proc.returncode}",
    )


def collect_control_facts(repo_root, config) -> tuple:
    """One row per kind, always all four. A kind nobody declared is
    ``not_applicable`` — the record says the control does not apply here
    rather than leaving a reader to infer it from an absence."""
    loaded = load_controls_checked(config)
    declared = {spec.kind: spec for spec in loaded.controls}
    facts = []
    for kind in CONTROL_KINDS:
        spec = declared.get(kind)
        if spec is None:
            facts.append(ControlFact(
                kind, STATUS_NOT_APPLICABLE,
                detail="no control of this kind is declared",
            ))
            continue
        facts.append(run_control(repo_root, spec))
    return tuple(facts), loaded.errors


# --- The record --------------------------------------------------------------

@dataclass(frozen=True)
class FactRecord:
    controls: tuple = ()
    changed: Optional[dict] = None  # {path: (line, ...)}, None when unknown
    session_number: Optional[int] = None
    round_number: Optional[int] = None
    recorded_at: str = ""
    errors: tuple = ()

    @property
    def red_required(self) -> tuple:
        return tuple(fact for fact in self.controls if fact.red)

    def to_dict(self) -> dict:
        out = {
            "recordedAt": self.recorded_at,
            "controls": [fact.to_dict() for fact in self.controls],
            "changedLines": (
                None if self.changed is None
                else {path: len(lines) for path, lines in self.changed.items()}
            ),
        }
        if self.session_number is not None:
            out["sessionNumber"] = self.session_number
        if self.round_number is not None:
            out["round"] = self.round_number
        if self.errors:
            out["declarationErrors"] = list(self.errors)
        return out


def _tests_facts(gate) -> tuple:
    """The selected-test run, as a fact rather than a verdict.

    A refusing gate never reaches here — the round ends before any fact is
    collected — so there is no failing case to write. A gate that accepted
    nothing accepted nothing *because nothing had to run*: no expensive
    suite, or a change the selector maps to no test. That is
    ``not_applicable``, and calling it ``pass`` would put a green test row
    on a change no test ever saw."""
    if gate is None:
        return ()
    if not gate.accepted:
        return (ControlFact(
            KIND_TESTS, STATUS_NOT_APPLICABLE, "", False,
            gate.reason
            or "no selected test run was required for this change set",
        ),)
    return tuple(
        ControlFact(
            KIND_TESTS, STATUS_PASS, command, False,
            f"{suite}: accepted as {policy}",
        )
        for suite, command, policy in gate.accepted
    )


def collect_facts(
    repo_root, sessions_dir, config, *, gate=None, round_number=None,
    session_number=None,
) -> FactRecord:
    """Every deterministic fact about the tree as it now stands, in one
    record: the declared controls, the pre-verification test command the
    selector sanctioned, and the lines the change adds.

    The test row is a record, not a second gate. The refusal that keeps an
    unproved change out of a round lives in ``affected.preverify_gate`` and
    stays there; repeating it here would be a guard guarding a guard. The
    changed lines are context of the same kind: nothing is judged by them."""
    from .affected import preverify_baseline

    controls, errors = collect_control_facts(repo_root, config)
    controls = controls + _tests_facts(gate)
    return FactRecord(
        controls=controls,
        changed=changed_lines(
            repo_root, preverify_baseline(repo_root, sessions_dir)
        ),
        session_number=session_number, round_number=round_number,
        recorded_at=datetime.datetime.now().astimezone().isoformat(),
        errors=tuple(errors),
    )


def facts_path(repo_root) -> Path:
    return Path(repo_root) / RUNS_DIRNAME / FACTS_FILENAME


def append_facts(repo_root, record: FactRecord) -> Path:
    """Machine-owned, append-only, one line per collection."""
    path = facts_path(repo_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record.to_dict(), sort_keys=True) + "\n")
    return path


def red_facts_refusal(record: FactRecord, prefix: str = "verify") -> str:
    """The message that returns red required facts to their author, or ``""``
    when nothing is red. Deterministic controls are the cheapest reader this
    work will ever get; spending a verification round to be told the build is
    broken buys nothing the exit code already said."""
    red = record.red_required
    if not red:
        return ""
    rows = "\n".join(
        f"  {fact.kind:<10} {fact.status.upper():<14} {fact.command}"
        + (f"\n{'':<14}{fact.detail.splitlines()[0][:200]}"
           if fact.detail else "")
        for fact in red
    )
    return (
        f"{prefix}: refused -- "
        f"{len(red)} required deterministic control(s) are not green:\n"
        f"{rows}\n"
        "These are facts, not opinions, and they cost nothing to obtain -- "
        "so they come back to you before a verifier is paid to notice them. "
        "An UNKNOWN row means the declared tool never ran; that is yours to "
        "fix too, because a control nobody can execute proves nothing.\n"
        "Fix them, rerun the affected tests, then re-run this command."
    )


# --- CLI ---------------------------------------------------------------------

def main(argv=None) -> int:
    import argparse

    from .config import load_config

    parser = argparse.ArgumentParser(
        prog="python -m ai_router.facts",
        description="what the machine knows about this change already",
    )
    parser.add_argument("--sessions-dir",
                        help="the repository's sessions root; derived from "
                             "the working directory when omitted")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    repo_root = repo_root_for(".")
    if repo_root is None:
        print("facts: no git repository here", file=sys.stderr)
        return 2
    record = collect_facts(
        repo_root, resolve_sessions_dir(args.sessions_dir, repo_root),
        load_config(),
    )
    if args.json:
        print(json.dumps(record.to_dict(), indent=2, sort_keys=True))
        return 0
    for fact in record.controls:
        print(f"  {fact.kind:<10} {fact.status:<15} {fact.command}")
    if record.changed is None:
        print("  changed lines: the change set could not be determined")
    else:
        total = sum(len(lines) for lines in record.changed.values())
        print(
            f"  changed lines: {total} added across "
            f"{len(record.changed)} file(s)"
        )
    for error in record.errors:
        print(f"  DECLARATION ERROR {error}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

