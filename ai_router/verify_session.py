"""Set 083 S1 -- the ``verify_session`` CLI: Step 6 as a first-class command.

A live incident (2026-07-06) showed the affordance gap at Step 6
(end-of-session cross-provider verification): it was the ONLY lifecycle
boundary step with no CLI. Every orchestrator had to hand-compose a
``route()`` call, an evidence bundle, the artifact writes, and a verdict
parse -- so evidence quality varied by which engine ran the session, and
one orchestrator bypassed the step entirely by writing a self-attested
verdict into ``disposition.json``. This module is the **affordance** half
of the Set 083 fix (Session 2 ships the **enforcement** half: the
verification-integrity close gate).

One command performs Step 6 the way every other boundary step already
works (``start_session``, ``routed_gate``, ``close_session``,
``pull_critique``)::

    python -m ai_router.verify_session --session-set-dir <set> \
        [--diff-base <ref>] [--round N] [--max-tier T] [--dry-run] \
        [--wording-only] [--exclude <pathspec> ...] [--no-default-excludes] \
        [--conventions-file <path>]

What it does, in order:

1. Resolves the in-progress session number from ``session-state.json``
   (the same reader path every other lifecycle CLI uses).
2. Assembles the evidence bundle deterministically: the session's spec
   excerpt, ``git status --short`` (untracked deliverables stay visible
   -- L-064-9), and the complete unfiltered diff of the working tree vs
   ``--diff-base`` (default ``HEAD``), with generated-bundle exclusions
   (``dist/`` etc.) on by default and overridable.
3. Fills ``ai_router/prompt-templates/verification.md`` (which carries
   the structured verdict schema) and routes
   ``task_type="session-verification"`` -- cross-provider selection is
   the router's existing rule set; this CLI never picks a verifier.
4. Writes ``sN-verification.md`` / ``sN-verification-round-<R>.md`` RAW,
   before any display (L-064-3), and ``sN-issues[-round-<R>].json`` when
   the round bears findings (Set 055 envelope).
5. Classifies blocking-ness through ``is_blocking_verdict`` /
   ``classify_blocking`` (L-071-1) -- a Minor-only round never opens a
   remediation loop.
6. Patches ``disposition.json`` (``verification_method: "api"``, the
   verdict token verbatim) preserving every unrelated field, and prints
   the verdict, the blocking classification, and the exact next action.

``--max-tier`` exists for wording-only re-verifies (L-064-7). The pin is
directional: it is only ever a ceiling, and on a substantive re-verify it
must never sit below the round-1 verifier's tier -- so the CLI REFUSES a
``--round >= 2`` call whose ``--max-tier`` is below the round-1
verifier's tier unless ``--wording-only`` is passed (the L-064-7
symmetric failure, encoded).

Exit codes:

- ``0``  -- verification ran; result is non-blocking (VERIFIED or
  Minor-only). Also the ``--dry-run`` exit.
- ``2``  -- usage error (bad args, tier-pin refusal, artifact collision).
- ``3``  -- state error (set dir not found, no session in flight).
- ``4``  -- verification ran; result is BLOCKING (>=1 Critical/Major or
  unknown-severity finding). Artifacts are written; remediate and re-run.
- ``6``  -- the routed call itself failed (provider/transport error).

Output is ASCII-only (the cp1252 console convention); artifacts are
written ``encoding="utf-8"``.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, List, Optional, Sequence

try:
    from progress import (  # type: ignore[import-not-found]
        SessionStateInvariantError,
        read_progress,
    )
    from session_state import read_session_state  # type: ignore[import-not-found]
    from resolve_set import (  # type: ignore[import-not-found]
        SetResolutionError,
        resolve_session_set_dir,
    )
    from verification import (  # type: ignore[import-not-found]
        build_verification_prompt,
        classify_blocking,
        parse_verification_response,
    )
except ImportError:
    from .progress import (  # type: ignore[no-redef]
        SessionStateInvariantError,
        read_progress,
    )
    from .session_state import read_session_state  # type: ignore[no-redef]
    from .resolve_set import (  # type: ignore[no-redef]
        SetResolutionError,
        resolve_session_set_dir,
    )
    from .verification import (  # type: ignore[no-redef]
        build_verification_prompt,
        classify_blocking,
        parse_verification_response,
    )


EXIT_OK = 0
EXIT_USAGE = 2
EXIT_STATE = 3
EXIT_BLOCKING = 4
EXIT_ROUTE_FAILED = 6

SESSION_VERIFICATION_TASK_TYPE = "session-verification"
DEFAULT_COMPLEXITY_HINT = 70

# Generated-bundle exclusions applied to the evidence diff by default.
# These are build outputs / vendored trees whose churn drowns the real
# change set; every one is overridable (--exclude adds more,
# --no-default-excludes drops these). git pathspec :(exclude) form.
DEFAULT_DIFF_EXCLUDES = (
    "dist",
    "out",
    "node_modules",
    ".venv",
    "__pycache__",
    "*.vsix",
)


class VerifySessionError(Exception):
    """Raised for deterministic pre-route failures (usage / state)."""


# ---------------------------------------------------------------------------
# Session / round resolution
# ---------------------------------------------------------------------------

def resolve_in_progress_session(session_set_dir: Path) -> int:
    """Return the in-flight session number for *session_set_dir*.

    Reads ``session-state.json`` through the canonical reader path
    (``read_progress`` -- the same normalize shim every lifecycle CLI
    uses). Raises :class:`VerifySessionError` when no session is in
    flight: Step 6 verifies an open session's work, so a between-sessions
    or not-started set has nothing to verify.
    """
    state = read_session_state(str(session_set_dir)) or {}
    if not state:
        raise VerifySessionError(
            f"no session-state.json in {session_set_dir} -- run "
            "start_session first (Step 1) so the session is in flight."
        )
    spec_md_path = session_set_dir / "spec.md"
    try:
        view = read_progress(state, spec_md_path)
    except (SessionStateInvariantError, TypeError, ValueError) as exc:
        raise VerifySessionError(
            f"could not read session progress for {session_set_dir}: {exc}"
        ) from exc
    if view.current_session is None:
        raise VerifySessionError(
            "no session is in flight for this set (between sessions or "
            "not started). verify_session verifies the in-progress "
            "session's work; run start_session first."
        )
    return int(view.current_session)


def verification_artifact_path(
    session_set_dir: Path, session_number: int, round_number: int
) -> Path:
    """The round's raw verifier-output artifact path (never edited)."""
    if round_number <= 1:
        return session_set_dir / f"s{session_number}-verification.md"
    return session_set_dir / (
        f"s{session_number}-verification-round-{round_number}.md"
    )


def issues_artifact_path(
    session_set_dir: Path, session_number: int, round_number: int
) -> Path:
    """The round's structured-findings artifact path (Set 055 naming)."""
    if round_number <= 1:
        return session_set_dir / f"s{session_number}-issues.json"
    return session_set_dir / (
        f"s{session_number}-issues-round-{round_number}.json"
    )


def resolve_round(
    session_set_dir: Path,
    session_number: int,
    explicit_round: Optional[int],
) -> int:
    """Return the effective verification round number.

    When ``--round`` is explicit, the round's artifact must not already
    exist (verification artifacts are never overwritten or edited --
    workflow convention). When omitted, the next free round is inferred
    from the artifacts on disk: 1 if ``sN-verification.md`` is absent,
    else the first round whose artifact is missing.
    """
    if explicit_round is not None:
        if explicit_round < 1:
            raise VerifySessionError(
                f"--round must be >= 1 (got {explicit_round})"
            )
        existing = verification_artifact_path(
            session_set_dir, session_number, explicit_round
        )
        if existing.exists():
            raise VerifySessionError(
                f"round {explicit_round} artifact already exists at "
                f"{existing.name}; verification artifacts are never "
                "overwritten. Omit --round to auto-select the next round."
            )
        return explicit_round

    round_number = 1
    while verification_artifact_path(
        session_set_dir, session_number, round_number
    ).exists():
        round_number += 1
    return round_number


# ---------------------------------------------------------------------------
# The L-064-7 tier-pin guard
# ---------------------------------------------------------------------------

def round1_verifier_tier(
    metrics_path: Path,
    session_set_name: str,
    session_number: int,
) -> Optional[int]:
    """The tier of the ROUND-1 session-verification row for this
    (set, session) in ``router-metrics.jsonl``, or ``None`` when no row
    (or no readable tier) is found.

    Metrics rows append chronologically and do not carry a round number,
    so round 1 IS the first matching session-verification row --
    unconditionally. Its tier is returned when readable; an unreadable
    tier on that row returns ``None`` (fail open) rather than falling
    through to a later row, because a later row is a later ROUND and
    comparing the pin against it is exactly the drift L-064-7's guard
    exists to refuse (a round-2 call at a lower tier must not lower the
    floor for round 3).

    Used only by the tier-pin guard below; a missing answer fails OPEN
    (the guard cannot refuse on evidence it does not have -- the refusal
    exists to stop an *encoded* mistake, not to invent one).
    """
    try:
        raw_lines = metrics_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in raw_lines:
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(row, dict):
            continue
        if row.get("task_type") != SESSION_VERIFICATION_TASK_TYPE:
            continue
        if row.get("session_number") != session_number:
            continue
        row_set = str(row.get("session_set") or "")
        # Metrics rows are slug-keyed at the write boundary, but older
        # rows carry path shapes; match on the trailing slug component.
        row_slug = row_set.replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]
        if row_slug != session_set_name:
            continue
        # First matching row = round 1, unconditionally. Readable tier
        # -> return it; unreadable -> fail open (never fall through to a
        # later row, which would be a later round's tier).
        row_tier = row.get("tier")
        if isinstance(row_tier, int) and not isinstance(row_tier, bool):
            return row_tier
        return None
    return None


def check_tier_pin(
    round_number: int,
    max_tier: Optional[int],
    round1_tier: Optional[int],
    wording_only: bool,
) -> Optional[str]:
    """Return the refusal message when the ``--max-tier`` pin is illegal.

    Encodes L-064-7 and its symmetric failure: the pin is a ceiling for
    *wording-only* re-verifies. A substantive re-verify (``--round >= 2``
    without ``--wording-only``) must stay on (or above) the round-1
    verifier's tier, so a ``--max-tier`` below that tier is refused.
    Returns ``None`` when the call is legal (including when the round-1
    tier is unknown -- the guard fails open on missing evidence).
    """
    if max_tier is None or round_number < 2 or wording_only:
        return None
    if round1_tier is None:
        return None
    if max_tier < round1_tier:
        return (
            f"--max-tier {max_tier} is below the round-1 verifier's tier "
            f"({round1_tier}) on a substantive re-verify (--round "
            f"{round_number}). A substantive re-verify must stay on or "
            "above the round-1 verifier's tier -- dropping the tier can "
            "silently break the cross-provider guarantee (L-064-7 "
            "symmetric failure). Pass --wording-only if this re-verify "
            "only fixes verdict wording, or raise/omit --max-tier."
        )
    return None


# ---------------------------------------------------------------------------
# Evidence assembly
# ---------------------------------------------------------------------------

def extract_spec_excerpt(spec_text: str, session_number: int) -> str:
    """Return the ``### Session N of M`` section of *spec_text*.

    Falls back to the whole spec when the heading is not found (a spec
    without per-session headings is unusual but must not silently
    produce an empty task statement).
    """
    pattern = re.compile(r"(?m)^###\s+Session\s+(\d+)\s+of\s+\d+\b")
    matches = list(pattern.finditer(spec_text))
    for i, m in enumerate(matches):
        if int(m.group(1)) == session_number:
            start = m.start()
            end = (
                matches[i + 1].start()
                if i + 1 < len(matches)
                else len(spec_text)
            )
            return spec_text[start:end].strip()
    return spec_text.strip()


def _run_git(repo_root: Path, args: Sequence[str]) -> str:
    """Run a git command in *repo_root*, returning stdout (utf-8).

    Bytes are captured and decoded explicitly (errors="replace") so a
    non-ASCII diff never trips the Windows cp1252 text layer (L-079-1).
    """
    proc = subprocess.run(
        ["git", "-C", str(repo_root), *args],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        stderr = proc.stderr.decode("utf-8", errors="replace").strip()
        raise VerifySessionError(
            f"git {' '.join(args[:2])}... failed (exit {proc.returncode}): "
            f"{stderr}"
        )
    return proc.stdout.decode("utf-8", errors="replace")


def repo_root_for(session_set_dir: Path) -> Path:
    """The git repo root containing the set dir (never ``Path.cwd()``)."""
    cur = session_set_dir.resolve()
    for candidate in (cur, *cur.parents):
        if (candidate / ".git").exists():
            return candidate
    raise VerifySessionError(
        f"no git repository found containing {session_set_dir}"
    )


def build_diff_pathspecs(excludes: Sequence[str]) -> List[str]:
    """Return the pathspec arguments implementing the exclusions."""
    if not excludes:
        return []
    return [".", *(f":(exclude){pattern}" for pattern in excludes)]


@dataclass
class EvidenceBundle:
    """The deterministic evidence a verification round reviews."""

    spec_excerpt: str
    git_status: str
    diff: str
    diff_base: str
    excludes: List[str] = field(default_factory=list)

    def as_response_under_review(self) -> str:
        """The evidence rendered for the template's Response Under
        Review slot: status first (untracked deliverables visible --
        L-064-9), then the complete diff."""
        status = self.git_status.strip() or "(clean -- no changes reported)"
        diff = self.diff.strip() or "(empty diff)"
        exclude_note = (
            ", ".join(self.excludes) if self.excludes else "(none)"
        )
        return (
            "The session's work, as the working tree presents it.\n\n"
            f"#### git status --short\n\n```\n{status}\n```\n\n"
            f"#### Complete diff (working tree vs `{self.diff_base}`; "
            f"generated-bundle exclusions: {exclude_note})\n\n"
            f"```diff\n{diff}\n```"
        )


def assemble_evidence(
    session_set_dir: Path,
    session_number: int,
    diff_base: str,
    excludes: Sequence[str],
    run_git: Callable[[Path, Sequence[str]], str] = _run_git,
) -> EvidenceBundle:
    """Assemble the evidence bundle for the round.

    - spec excerpt for this session (what the work was supposed to be);
    - ``git status --short`` so untracked deliverables are visible
      (L-064-9: a diff-only bundle silently omits new files);
    - the complete unfiltered diff, working tree vs *diff_base*, less
      the generated-bundle *excludes*.
    """
    spec_path = session_set_dir / "spec.md"
    try:
        spec_text = spec_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise VerifySessionError(
            f"could not read {spec_path}: {exc}"
        ) from exc
    excerpt = extract_spec_excerpt(spec_text, session_number)

    root = repo_root_for(session_set_dir)
    status = run_git(root, ["status", "--short"])
    diff_args = ["diff", "--no-color", diff_base, "--"]
    diff_args.extend(build_diff_pathspecs(excludes) or ["."])
    diff = run_git(root, diff_args)

    return EvidenceBundle(
        spec_excerpt=excerpt,
        git_status=status,
        diff=diff,
        diff_base=diff_base,
        excludes=list(excludes),
    )


def load_verification_template() -> str:
    """The push verification template (carries the structured verdict
    schema the workflow requires in every session-verification prompt)."""
    path = Path(__file__).resolve().parent / "prompt-templates" / "verification.md"
    return path.read_text(encoding="utf-8")


def build_prompt(
    evidence: EvidenceBundle,
    session_number: int,
    round_number: int,
    conventions: str = "",
    template: Optional[str] = None,
) -> str:
    """Fill the verification template with the session's evidence.

    ``conventions`` (optional, from ``--conventions-file``) is the
    up-front conventions block the guidance requires session-verification
    prompts to open with (suite baseline, release contract, by-design
    exclusions) -- it rides at the top of the Original Task slot.
    """
    if template is None:
        template = load_verification_template()
    task_parts: List[str] = []
    if conventions.strip():
        task_parts.append(
            "#### Conventions and baseline (read first)\n\n"
            + conventions.strip()
        )
    task_parts.append(
        f"Session {session_number} of the active session set "
        f"(verification round {round_number}). The session's plan, "
        "verbatim from spec.md:\n\n" + evidence.spec_excerpt
    )
    original_task = "\n\n".join(task_parts)
    return build_verification_prompt(
        original_task=original_task,
        original_response=evidence.as_response_under_review(),
        task_type=SESSION_VERIFICATION_TASK_TYPE,
        template=template,
    )


# ---------------------------------------------------------------------------
# Artifact + disposition writes
# ---------------------------------------------------------------------------

def write_issues_artifact(
    path: Path,
    session_number: int,
    round_number: int,
    verdict: str,
    issues: List[dict],
) -> None:
    """Write the Set 055 findings envelope (only called on a
    findings-bearing round; presence of the file means issues found)."""
    envelope = {
        "schemaVersion": 1,
        "sessionNumber": session_number,
        "verificationRound": round_number,
        "verificationVerdict": verdict,
        "issues": issues,
    }
    path.write_text(
        json.dumps(envelope, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def patch_disposition(session_set_dir: Path, verdict: str) -> Path:
    """Patch ``disposition.json``: ``verification_method: "api"`` and the
    verdict token verbatim, preserving every unrelated field.

    Operates on the raw JSON dict (never a dataclass round-trip, which
    would drop unknown keys), writes atomically (temp + ``os.replace``),
    and is idempotent. When no disposition exists yet, a minimal partial
    record carrying only the two fields is created -- Step 8 authors the
    full disposition later and must preserve them.
    """
    path = session_set_dir / "disposition.json"
    data: dict = {}
    if path.is_file():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                data = loaded
        except (OSError, json.JSONDecodeError):
            # A malformed disposition must not eat the verdict: keep the
            # broken content aside and start a fresh patchable record.
            backup = path.with_suffix(".json.malformed")
            try:
                os.replace(path, backup)
                print(
                    f"WARNING: existing disposition.json was malformed; "
                    f"moved to {backup.name}",
                    file=sys.stderr,
                )
            except OSError:
                pass
            data = {}
    data["verification_method"] = "api"
    data["verification_verdict"] = verdict
    serialized = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    tmp_path = f"{path}.tmp.{os.getpid()}"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(serialized)
        f.flush()
        try:
            os.fsync(f.fileno())
        except OSError:
            pass
    os.replace(tmp_path, path)
    return path


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="verify_session",
        description=(
            "Step 6 as a first-class command: assemble the session's "
            "evidence bundle deterministically (spec excerpt + git "
            "status --short + the complete working-tree diff), route it "
            "to a cross-provider verifier "
            "(task_type=session-verification), write the raw "
            "sN-verification*.md artifact before any display, write "
            "sN-issues*.json when the round bears findings, classify "
            "blocking-ness (a Minor-only round never opens a "
            "remediation loop), patch disposition.json "
            "(verification_method=api + the verdict token verbatim), "
            "and print the exact next action. Exit codes: 0 "
            "non-blocking (VERIFIED or Minor-only), 2 usage, 3 state "
            "(no session in flight), 4 blocking findings, 6 routed "
            "call failed."
        ),
    )
    p.add_argument(
        "--session-set-dir",
        required=True,
        help=(
            "Path to the session-set directory (or a bare set number, "
            "resolved like the other lifecycle CLIs)."
        ),
    )
    p.add_argument(
        "--diff-base",
        default="HEAD",
        help=(
            "Git ref the working-tree diff is taken against "
            "(default: HEAD). Use the pre-session ref when session work "
            "has already been committed."
        ),
    )
    p.add_argument(
        "--round",
        type=int,
        default=None,
        dest="round_number",
        help=(
            "Verification round number. Default: inferred as the next "
            "free round from the sN-verification*.md artifacts on disk. "
            "An explicit round whose artifact already exists is refused "
            "(artifacts are never overwritten)."
        ),
    )
    p.add_argument(
        "--max-tier",
        type=int,
        default=None,
        help=(
            "Pin route()'s maximum tier. For WORDING-ONLY re-verifies "
            "(L-064-7): pin to the round-1 verifier's own tier so the "
            "short-response escalation heuristic cannot cross providers. "
            "On a substantive --round >= 2 call, a --max-tier below the "
            "round-1 verifier's tier is refused unless --wording-only "
            "is passed."
        ),
    )
    p.add_argument(
        "--wording-only",
        action="store_true",
        help=(
            "Declare this re-verify as wording/schema-only (the round-1 "
            "substance stands; only the verdict format is being "
            "re-collected). Lifts the tier-pin refusal for --round >= 2."
        ),
    )
    p.add_argument(
        "--exclude",
        action="append",
        default=None,
        metavar="PATHSPEC",
        help=(
            "Additional git pathspec to exclude from the evidence diff "
            "(repeatable). Added on top of the defaults: "
            + ", ".join(DEFAULT_DIFF_EXCLUDES)
        ),
    )
    p.add_argument(
        "--no-default-excludes",
        action="store_true",
        help="Drop the default generated-bundle exclusions from the diff.",
    )
    p.add_argument(
        "--conventions-file",
        default=None,
        help=(
            "Optional path to an up-front conventions block (suite "
            "baseline, release contract, by-design exclusions) prepended "
            "to the verification prompt, per the project-guidance "
            "convention."
        ),
    )
    p.add_argument(
        "--complexity-hint",
        type=int,
        default=DEFAULT_COMPLEXITY_HINT,
        help=(
            "Complexity hint passed to route() "
            f"(default {DEFAULT_COMPLEXITY_HINT}; the workflow suggests "
            "85 when re-verifying after Critical/Major fixes)."
        ),
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Assemble the evidence and print what would run -- writes "
            "nothing, routes nothing."
        ),
    )
    return p


def _resolve_metrics_path() -> Optional[Path]:
    """Best-effort resolution of router-metrics.jsonl for the tier-pin
    guard. Never raises -- a missing answer fails open."""
    try:
        try:
            from metrics import _log_path  # type: ignore[import-not-found]
            from config import load_config  # type: ignore[import-not-found]
        except ImportError:
            from .metrics import _log_path  # type: ignore[no-redef]
            from .config import load_config  # type: ignore[no-redef]
        return Path(_log_path(load_config()))
    except Exception:
        return None


def _default_route(prompt: str, session_set: str, session_number: int,
                   complexity_hint: int, max_tier: Optional[int]):
    """Production route() invocation (injectable seam for tests)."""
    from ai_router import route  # lazy: keeps --dry-run and tests hermetic

    kwargs = dict(
        content=prompt,
        task_type=SESSION_VERIFICATION_TASK_TYPE,
        complexity_hint=complexity_hint,
        session_set=session_set,
        session_number=session_number,
    )
    if max_tier is not None:
        kwargs["max_tier"] = max_tier
    return route(**kwargs)


def run(args: argparse.Namespace, route_fn=None) -> int:
    """Execute the verify_session flow. Returns the exit code."""
    # -- Resolve the set dir (number handles accepted, like every CLI).
    try:
        session_set_dir = Path(resolve_session_set_dir(args.session_set_dir))
    except SetResolutionError as exc:
        print(f"verify_session: {exc}", file=sys.stderr)
        return EXIT_USAGE
    if not session_set_dir.is_dir():
        print(
            f"verify_session: session-set directory not found: "
            f"{session_set_dir}",
            file=sys.stderr,
        )
        return EXIT_STATE

    set_name = session_set_dir.resolve().name

    # -- Resolve the in-progress session (state error) and the round
    #    (usage error: bad/colliding --round).
    try:
        session_number = resolve_in_progress_session(session_set_dir)
    except VerifySessionError as exc:
        print(f"verify_session: {exc}", file=sys.stderr)
        return EXIT_STATE
    try:
        round_number = resolve_round(
            session_set_dir, session_number, args.round_number
        )
    except VerifySessionError as exc:
        print(f"verify_session: {exc}", file=sys.stderr)
        return EXIT_USAGE

    # -- L-064-7 tier-pin guard (before any metered call).
    if args.max_tier is not None and round_number >= 2 and not args.wording_only:
        metrics_path = _resolve_metrics_path()
        r1_tier = (
            round1_verifier_tier(metrics_path, set_name, session_number)
            if metrics_path is not None
            else None
        )
        refusal = check_tier_pin(
            round_number, args.max_tier, r1_tier, args.wording_only
        )
        if refusal:
            print(f"verify_session: refused -- {refusal}", file=sys.stderr)
            return EXIT_USAGE
    if args.wording_only and round_number < 2:
        print(
            "verify_session: NOTE -- --wording-only has no effect on "
            "round 1 (nothing to re-collect); proceeding.",
            file=sys.stderr,
        )

    # -- Evidence bundle.
    excludes: List[str] = []
    if not args.no_default_excludes:
        excludes.extend(DEFAULT_DIFF_EXCLUDES)
    if args.exclude:
        excludes.extend(args.exclude)
    try:
        evidence = assemble_evidence(
            session_set_dir, session_number, args.diff_base, excludes
        )
    except VerifySessionError as exc:
        print(f"verify_session: {exc}", file=sys.stderr)
        return EXIT_USAGE

    conventions = ""
    if args.conventions_file:
        try:
            conventions = Path(args.conventions_file).read_text(
                encoding="utf-8"
            )
        except OSError as exc:
            print(
                f"verify_session: could not read --conventions-file: {exc}",
                file=sys.stderr,
            )
            return EXIT_USAGE

    prompt = build_prompt(
        evidence, session_number, round_number, conventions=conventions
    )

    review_path = verification_artifact_path(
        session_set_dir, session_number, round_number
    )
    issues_path = issues_artifact_path(
        session_set_dir, session_number, round_number
    )

    if args.dry_run:
        print("verify_session: DRY RUN -- nothing written, nothing routed")
        print(f"  session set:        {set_name}")
        print(f"  session:            {session_number}")
        print(f"  round:              {round_number}")
        print(f"  diff base:          {args.diff_base}")
        print(f"  diff exclusions:    {', '.join(excludes) or '(none)'}")
        print(f"  evidence diff:      {len(evidence.diff)} chars")
        print(f"  git status lines:   {len(evidence.git_status.splitlines())}")
        print(f"  prompt size:        {len(prompt)} chars")
        print(f"  would write:        {review_path.name}"
              f" (+ {issues_path.name} if findings)")
        print(f"  max tier:           {args.max_tier if args.max_tier is not None else '(router default)'}")
        return EXIT_OK

    # -- Route to the cross-provider verifier.
    if route_fn is None:
        route_fn = _default_route
    try:
        result = route_fn(
            prompt,
            str(session_set_dir),
            session_number,
            args.complexity_hint,
            args.max_tier,
        )
    except Exception as exc:  # noqa: BLE001 -- report any transport failure
        print(
            f"verify_session: routed verification call failed: {exc}\n"
            "Nothing was written. Follow the verifier-failure escalation "
            "ladder (retry once, fall back to the remaining cross-provider "
            "verifier) -- see docs/ai-led-session-workflow.md Step 6.",
            file=sys.stderr,
        )
        return EXIT_ROUTE_FAILED

    # -- Persist RAW output BEFORE any display or parsing (L-064-3).
    review_path.write_text(result.content, encoding="utf-8")

    verdict, issues = parse_verification_response(result.content)
    classification = classify_blocking(verdict, issues)

    if issues:
        write_issues_artifact(
            issues_path, session_number, round_number, verdict, issues
        )

    disposition_path = patch_disposition(session_set_dir, verdict)

    # -- Report (ASCII-only).
    truncated = bool(getattr(result, "truncated", False))
    print(f"verify_session: session {session_number}, round {round_number}")
    print(f"  verifier model:     {result.model_name}")
    print(f"  verdict:            {verdict}")
    print(f"  blocking:           {'YES' if classification.blocking else 'no'}"
          f" ({classification.reason})")
    print(f"  findings:           {len(classification.blocking_issues)} blocking, "
          f"{len(classification.nit_issues)} minor/nit")
    print(f"  raw output:         {review_path}")
    if issues:
        print(f"  structured issues:  {issues_path}")
    print(f"  disposition patch:  {disposition_path} "
          f"(verification_method=api, verification_verdict={verdict})")
    print(f"  cost:               ${getattr(result, 'total_cost_usd', 0.0):.4f}")
    if truncated:
        print(
            "  WARNING: the verifier response appears TRUNCATED "
            "(L-064-1). Treat this round as unreliable; re-run with a "
            "smaller evidence bundle or a higher-capacity verifier.",
        )

    if classification.blocking:
        next_round = round_number + 1
        print("\nNext action: BLOCKING findings -- remediate each "
              "Critical/Major finding, then re-verify:")
        print(
            f"  python -m ai_router.verify_session --session-set-dir "
            f"{session_set_dir} --round {next_round} --complexity-hint 85"
        )
        print(
            "  (max 2 automatic rounds; a 3rd round or an unfixed "
            "Critical/Major stops to a human. Track findings in the "
            "cross-round issue ledger -- do not resurrect settled points.)"
        )
        return EXIT_BLOCKING

    print("\nNext action: result is non-blocking (effectively VERIFIED "
          "for the loop). Record any nits, then proceed to Step 8:")
    print("  author the full disposition.json (preserving the patched "
          "verification fields), commit and push, then run:")
    print(
        f"  python -m ai_router.close_session --session-set-dir "
        f"{session_set_dir}"
    )
    return EXIT_OK


def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
