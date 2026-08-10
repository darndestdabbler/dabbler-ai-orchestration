"""Test run-of-record: recording an expensive suite run, and proving it fresh.

**Who uses this:** the orchestrator at Step 8 (record each applicable full
run, after remediation) and ``close_session``'s ``test_run_fresh`` gate in
the same step.
**See also:** ``docs/planning/session-set-authoring-guide.md`` -> *The
test-run policy*; ``gate_checks.py`` (the gate wrapper);
``verification_stamp.compute_work_diff_sha256`` (the same content-digest
idea, applied to the verification freshness question).

---

Why this exists
---------------
The test-run policy (piloted in Set 110's operator notes, canonized by Set
111 S4) says an expensive suite runs **fully exactly once per session,
after the last code change**. Set 110 S3 tried to close on a full run that
predated three test fixes, *disclosed it in the sidecar*, and was correctly
refused by the backstop -- the orchestrator agreed with the policy and
slipped anyway. Prose does not survive end-of-session pressure. A timestamp
comparison does.

Set 116 S3 fixed the two things that made the policy unlivable rather than
merely strict. **When**: "after the last code change" now names Step 8,
after remediation, because Step 7 remediation *is* a code change and
verification finds something in nearly every session -- at Step 5 the
instruction was unsatisfiable wherever it mattered, and Set 112 S3 obeyed
it into 15 runs and 186 minutes. **What**: all three layers are now
``expensive``. ``pytest`` and ``mocha`` were declared cheap, so the gate
had no opinion about the 14-minute suite it was written to govern.

Why a content digest and not an mtime
-------------------------------------
``git checkout``, a stash pop, or a fresh clone all rewrite mtimes without
changing a byte of content, and an editor that saves a file unchanged bumps
the mtime without changing anything either. Both directions produce a wrong
answer: a stale run that looks fresh, or a fresh run that looks stale. So
freshness is decided by a **content digest over the covered surfaces**
(:func:`surface_digest`), exactly as
``verification_stamp.compute_work_diff_sha256`` decides verification
freshness. The run is fresh iff the surfaces it covers hash to the same
value now as they did when the run was recorded.

The record is append-only
-------------------------
``test-runs.jsonl`` in the session-set directory gets one line per recorded
run. A re-run appends; nothing is ever rewritten. A session that invalidates
its own run and re-runs therefore leaves both records, and the honest
history of "I had to run it twice" survives.

What the gate does NOT do
-------------------------
It does not run the suite, and it cannot tell a passing run from a failing
one beyond the ``outcome`` string the recorder was handed -- recording a
green result for a red run is a false attestation, not a defeated check.
It also only governs suites whose covered surfaces this session actually
touched, so a session that touched nothing under any suite's ``covers``
owes nothing and the gate stays silent, even though every declared suite
is now ``expensive``.

Say that precisely, because the loose version ("a docs-only session owes
nothing") is FALSE here: ``covers`` is a path prefix, not a file type.
``pytest`` covers ``ai_router/``, so editing ``ai_router/docs/close-out.md``
-- documentation, no code -- owes a pytest run. That is deliberate: the
prefix is what makes the rule cheap to evaluate and impossible to argue
with, and the failure direction is running a suite you did not need
rather than skipping one you did.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

try:
    from .verification_stamp import sha256_hex  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover - direct-script fallback
    from verification_stamp import sha256_hex  # type: ignore[no-redef]


TEST_RUNS_FILENAME = "test-runs.jsonl"


def _posix(path: str) -> str:
    """Normalise a declared path to posix separators on EVERY platform.

    ``os.sep`` alone is the wrong tool here and the bug is asymmetric: on
    Windows it rewrites backslashes, and on Linux/macOS ``os.sep`` is
    already ``"/"`` so a Windows-authored ``files_changed`` entry like
    ``src\\nested\\a.ts`` passes through untouched and matches nothing.
    Dispositions are authored on one machine and evaluated on another
    (the required CI matrix runs ubuntu and macOS), so the separator a
    path was WRITTEN with must never decide whether it is recognised.
    """
    return path.replace("\\", "/")

# Recognised outcomes. ``passed`` is the only one that can satisfy the gate;
# the others exist so an honest record of a red or aborted run can still be
# written (silence is worse than a recorded failure).
OUTCOME_PASSED = "passed"
OUTCOME_FAILED = "failed"
OUTCOME_ABORTED = "aborted"
OUTCOMES = (OUTCOME_PASSED, OUTCOME_FAILED, OUTCOME_ABORTED)


@dataclass(frozen=True)
class SuiteSpec:
    """One declared test suite.

    ``covers`` is a list of repo-relative path prefixes (posix separators).
    ``expensive`` marks the suites the once-per-session-at-close rule
    governs; cheap suites are recordable but never gate-required. It is
    a statement about *whether the gate has an opinion*, not about the
    clock -- all three of this repo's layers carry it since Set 116 S3,
    and a consumer repo is free to declare a suite cheap.
    """

    name: str
    command: str
    covers: Tuple[str, ...]
    expensive: bool = False


# Locked defaults for this repo's three layers. A consumer repo with no
# ``testing:`` block inherits these; one with a block replaces them wholesale.
DEFAULT_SUITES: Tuple[SuiteSpec, ...] = (
    SuiteSpec(
        name="pytest",
        # Set 116 S1 made this the parallel default: 3.61x faster
        # (845.76s serial -> 234.55s with -n auto) with identical
        # results, measured at commit 9277e104.
        command=".venv/Scripts/python.exe -m pytest ai_router/tests -q -n auto",
        covers=("ai_router/",),
        # Set 116 S3, the operator's gate ruling: `test_run_fresh` is one
        # of the three gates that survive, and it was BROKEN — pytest was
        # declared cheap, so the once-per-session-after-the-last-code-
        # change rule never governed the suite that costs the time. Set
        # 112 S3 ran 15 test runs across 186 minutes (59% of the session)
        # entirely unremarked by this gate.
        #
        # `expensive` is not a statement about the clock; it is the flag
        # that decides whether the gate has an opinion. A 4-minute suite
        # that guards every close-out path in the framework is exactly
        # what a close should have to prove it ran.
        expensive=True,
    ),
    SuiteSpec(
        name="mocha",
        # Set 112 S3 (round-1 verification): this said ``npm test``, which
        # is the Layer 2 @vscode/test-electron harness -- documented broken
        # on Windows 11 + VS Code 1.120 and skipped in CI for that reason
        # (CONTRIBUTING.md -> Layer 2). Every session that actually ran
        # Layer 2 ran ``npm run test:unit`` and then recorded its run of
        # record against a command it had not run, so the release-boundary
        # evidence named a suite nobody could execute on the dev platform.
        command="npm run test:unit",
        covers=("tools/dabbler-ai-orchestration/src/",),
        # Set 116 S3: same repair as pytest, and Set 114 S3 is the
        # evidence. Layer 2 is in CONTRIBUTING.md's canonical full pass,
        # but Sessions 1 and 2 of that set recorded only pytest and
        # Playwright — and when Layer 2 was finally run during a
        # remediation it found `sampleProjectSmoke` broken by that set's
        # own new gates, a regression that would have reached every
        # consumer following the sample path. A suite that is in the
        # contributing guide but not in the recorded run set is a suite
        # that will not notice.
        expensive=True,
    ),
    SuiteSpec(
        name="playwright",
        command="npm run test:playwright",
        # The policy's non-negotiable Layer 3 trigger list, spelled out.
        # The authoring guide names FOUR surfaces that must pay their own
        # full Layer 3 -- the Explorer rendering surface, a state-file
        # writer, the extension manifest, and the fixture harness -- but
        # this map originally carried only the first and third. A session
        # that changed a blessed writer or the harness that stages the
        # fixtures could therefore close with Playwright reported "not
        # required", which is precisely the rendering-regression class
        # Layer 2 and the static gates cannot see. The writers are listed
        # file-by-file rather than as `ai_router/`, because arming the
        # expensive suite for every router change would make the gate
        # something sessions route around instead of satisfy.
        covers=(
            "tools/dabbler-ai-orchestration/src/",
            "tools/dabbler-ai-orchestration/package.json",
            "tools/dabbler-ai-orchestration/media/",
            # the fixture/walk harness that stages what Layer 3 looks at
            "tools/dabbler-ai-orchestration/scripts/",
            "tools/dabbler-ai-orchestration/test-fixtures/",
            "ai_router/tests/e2e/",
            # the blessed state-file writers whose shape the views render
            "ai_router/session_state.py",
            "ai_router/start_session.py",
            "ai_router/close_session.py",
        ),
        expensive=True,
    ),
)


@dataclass
class TestRunRecord:
    """One recorded suite run."""

    suite: str
    command: str
    outcome: str
    surface_digest: str
    recorded_at: str
    session_number: Optional[int] = None
    detail: str = ""
    duration_seconds: Optional[float] = None

    def to_dict(self) -> dict:
        d = {
            "suite": self.suite,
            "command": self.command,
            "outcome": self.outcome,
            "surfaceDigest": self.surface_digest,
            "recordedAt": self.recorded_at,
        }
        if self.session_number is not None:
            d["sessionNumber"] = self.session_number
        if self.detail:
            d["detail"] = self.detail
        if self.duration_seconds is not None:
            d["durationSeconds"] = self.duration_seconds
        return d


@dataclass
class FreshnessVerdict:
    """The gate's answer for one expensive suite."""

    suite: str
    required: bool
    passed: bool
    reason: str = ""


def _repo_root_for(path: str) -> Optional[str]:
    cur = Path(path).resolve()
    for candidate in (cur, *cur.parents):
        if (candidate / ".git").exists():
            return str(candidate)
    return None


def load_suites(config: Optional[dict] = None) -> Tuple[SuiteSpec, ...]:
    """Build the suite list from ``testing.suites``, else the defaults.

    Tolerant by design (a config typo must not crash a session boundary):
    an entry that is not a mapping, or that lacks a usable ``name`` or a
    non-empty ``covers`` list, is skipped. A ``suites:`` key present but
    yielding zero usable entries returns an EMPTY tuple rather than the
    defaults -- an operator who deliberately declares no suites gets no
    suites, and silently resurrecting the defaults would re-arm a gate
    they just turned off.
    """
    if not isinstance(config, dict):
        return DEFAULT_SUITES
    block = config.get("testing")
    if not isinstance(block, dict) or "suites" not in block:
        return DEFAULT_SUITES
    raw = block.get("suites")
    if not isinstance(raw, list):
        return DEFAULT_SUITES
    out: List[SuiteSpec] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        covers_raw = item.get("covers")
        if not isinstance(covers_raw, list):
            continue
        covers = tuple(
            _posix(c.strip())
            for c in covers_raw
            if isinstance(c, str) and c.strip()
        )
        if not covers:
            continue
        command = item.get("command")
        out.append(
            SuiteSpec(
                name=name.strip(),
                command=command if isinstance(command, str) else "",
                covers=covers,
                expensive=item.get("expensive") is True,
            )
        )
    return tuple(out)


def _git_z(repo_root: str, *args: str) -> Optional[List[str]]:
    proc = subprocess.run(
        ["git", "-C", repo_root, "-c", "core.quotepath=false", *args],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        return None
    out = proc.stdout.decode("utf-8", errors="replace")
    return [p for p in out.split("\0") if p]


def surface_digest(repo_root: str, covers: Sequence[str]) -> Optional[str]:
    """SHA-256 over the current content of every file under *covers*.

    One ``path\\0blob-hash`` line per tracked-or-untracked-not-ignored file
    whose repo-relative path starts with one of the *covers* prefixes,
    sorted for determinism. Ignored files (``node_modules``, build output)
    never enter, because they are not in ``git ls-files``.

    Returns ``None`` when git is unavailable or fails, so every caller
    fails **closed** rather than treating an unmeasurable surface as
    unchanged.
    """
    prefixes = tuple(_posix(c) for c in covers if c)
    if not prefixes:
        return None
    tracked = _git_z(repo_root, "ls-files", "-z", "--")
    untracked = _git_z(
        repo_root, "ls-files", "--others", "--exclude-standard", "-z", "--"
    )
    if tracked is None or untracked is None:
        return None

    def _covered(rel: str) -> bool:
        return any(
            rel == p.rstrip("/") or rel.startswith(p if p.endswith("/") else p + "/")
            or rel == p
            for p in prefixes
        )

    lines: List[str] = []
    for rel in sorted(set(tracked) | set(untracked)):
        if not _covered(rel):
            continue
        target = Path(repo_root) / rel
        try:
            file_hash = sha256_hex(target.read_bytes())
        except OSError:
            file_hash = "deleted"
        lines.append(f"{rel}\0{file_hash}")
    return sha256_hex("\n".join(lines).encode("utf-8"))


def _runs_path(session_set_dir: str) -> str:
    return os.path.join(session_set_dir, TEST_RUNS_FILENAME)


def read_records(session_set_dir: str) -> List[TestRunRecord]:
    """Read every well-formed record from ``test-runs.jsonl``.

    A malformed line is skipped rather than raising: the file is an
    append-only journal and one bad line must not blind the gate to the
    good ones. A missing file yields an empty list.
    """
    path = _runs_path(session_set_dir)
    out: List[TestRunRecord] = []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(d, dict):
                    continue
                suite = d.get("suite")
                digest = d.get("surfaceDigest")
                if not isinstance(suite, str) or not isinstance(digest, str):
                    continue
                session_number = d.get("sessionNumber")
                duration = d.get("durationSeconds")
                out.append(
                    TestRunRecord(
                        suite=suite,
                        command=d.get("command") or "",
                        outcome=d.get("outcome") or "",
                        surface_digest=digest,
                        recorded_at=d.get("recordedAt") or "",
                        session_number=(
                            session_number
                            if isinstance(session_number, int)
                            and not isinstance(session_number, bool)
                            else None
                        ),
                        detail=d.get("detail") or "",
                        duration_seconds=(
                            float(duration)
                            if isinstance(duration, (int, float))
                            and not isinstance(duration, bool)
                            and math.isfinite(duration)
                            else None
                        ),
                    )
                )
    except OSError:
        return []
    return out


def record_run(
    session_set_dir: str,
    suite: SuiteSpec,
    outcome: str,
    *,
    duration_seconds: float,
    session_number: Optional[int] = None,
    detail: str = "",
    repo_root: Optional[str] = None,
) -> TestRunRecord:
    """Append a run-of-record for *suite* and return it.

    ``duration_seconds`` is REQUIRED (Set 116 S1 round-2 remediation-review):
    an optional field at the write boundary never gets populated, which is
    the exact "sometimes there is no measurement" condition this exists to
    fix. Only ``read_records`` stays lenient, for legacy rows recorded
    before this field existed.

    Raises ``ValueError`` on an unknown *outcome* or a non-finite/non-positive
    *duration_seconds*, and ``RuntimeError`` when the covered surfaces
    cannot be digested -- an unrecordable run is an error, not a
    silently-empty record.
    """
    if outcome not in OUTCOMES:
        raise ValueError(
            f"outcome must be one of {OUTCOMES!r} (got {outcome!r})"
        )
    if (
        isinstance(duration_seconds, bool)
        or not isinstance(duration_seconds, (int, float))
        or not math.isfinite(duration_seconds)
        or duration_seconds <= 0
    ):
        raise ValueError(
            f"duration_seconds must be a finite positive number "
            f"(got {duration_seconds!r})"
        )
    root = repo_root or _repo_root_for(session_set_dir)
    if root is None:
        raise RuntimeError(
            f"no git repository found above {session_set_dir!r}; "
            "cannot digest the covered surfaces"
        )
    digest = surface_digest(root, suite.covers)
    if digest is None:
        raise RuntimeError(
            f"could not digest the surfaces covered by suite {suite.name!r} "
            f"({', '.join(suite.covers)})"
        )
    record = TestRunRecord(
        suite=suite.name,
        command=suite.command,
        outcome=outcome,
        surface_digest=digest,
        recorded_at=datetime.now().astimezone().isoformat(),
        session_number=session_number,
        detail=detail,
        duration_seconds=duration_seconds,
    )
    os.makedirs(session_set_dir, exist_ok=True)
    with open(_runs_path(session_set_dir), "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record.to_dict(), ensure_ascii=False) + "\n")
    return record


def session_touched(
    repo_root: str,
    covers: Sequence[str],
    files_changed: Sequence[str],
) -> bool:
    """True when any path in *files_changed* falls under *covers*.

    ``files_changed`` is the disposition's declared surface. Paths are
    normalised to posix separators before comparison so a Windows-authored
    disposition matches a posix-style ``covers`` prefix.
    """
    _ = repo_root
    prefixes = tuple(_posix(c) for c in covers if c)
    for raw in files_changed:
        if not isinstance(raw, str) or not raw.strip():
            continue
        rel = _posix(raw.strip()).lstrip("./")
        for p in prefixes:
            norm = p if p.endswith("/") else p + "/"
            if rel == p.rstrip("/") or rel.startswith(norm):
                return True
    return False


def evaluate_freshness(
    session_set_dir: str,
    files_changed: Sequence[str],
    suites: Sequence[SuiteSpec],
    *,
    repo_root: Optional[str] = None,
) -> List[FreshnessVerdict]:
    """Judge every expensive suite this session's declared surface touched.

    A suite is **required** when it is expensive AND *files_changed* names
    at least one path under its ``covers``. A required suite passes only
    when the most recent record for it is ``passed`` and its
    ``surface_digest`` still equals the surfaces' current digest.
    """
    verdicts: List[FreshnessVerdict] = []
    root = repo_root or _repo_root_for(session_set_dir)
    records = read_records(session_set_dir)

    for suite in suites:
        if not suite.expensive:
            continue
        if root is None:
            verdicts.append(
                FreshnessVerdict(
                    suite=suite.name,
                    required=True,
                    passed=False,
                    reason=(
                        "no git repository found; cannot digest the covered "
                        "surfaces (failing closed)"
                    ),
                )
            )
            continue
        if not session_touched(root, suite.covers, files_changed):
            verdicts.append(
                FreshnessVerdict(
                    suite=suite.name,
                    required=False,
                    passed=True,
                    reason="session touched none of this suite's surfaces",
                )
            )
            continue

        current = surface_digest(root, suite.covers)
        if current is None:
            verdicts.append(
                FreshnessVerdict(
                    suite=suite.name,
                    required=True,
                    passed=False,
                    reason=(
                        "could not digest the covered surfaces "
                        "(failing closed)"
                    ),
                )
            )
            continue

        mine = [r for r in records if r.suite == suite.name]
        if not mine:
            verdicts.append(
                FreshnessVerdict(
                    suite=suite.name,
                    required=True,
                    passed=False,
                    reason=(
                        f"this session changed {suite.name}'s covered "
                        f"surfaces but no run of record exists; run "
                        f"`{suite.command}` after your last code change, "
                        f"then `python -m ai_router.run_of_record record "
                        f"--suite {suite.name} --outcome passed "
                        f"--duration-seconds <elapsed>`"
                    ),
                )
            )
            continue

        latest = mine[-1]
        if latest.surface_digest != current:
            verdicts.append(
                FreshnessVerdict(
                    suite=suite.name,
                    required=True,
                    passed=False,
                    reason=(
                        f"the {suite.name} run of record (recorded "
                        f"{latest.recorded_at or 'at an unknown time'}) "
                        f"PREDATES a change to the surfaces it covers; "
                        f"re-run `{suite.command}` after your last code "
                        f"change and record it again"
                    ),
                )
            )
            continue

        if latest.outcome != OUTCOME_PASSED:
            verdicts.append(
                FreshnessVerdict(
                    suite=suite.name,
                    required=True,
                    passed=False,
                    reason=(
                        f"the {suite.name} run of record is fresh but its "
                        f"outcome is {latest.outcome!r}; a close needs a "
                        f"green run of record"
                    ),
                )
            )
            continue

        verdicts.append(
            FreshnessVerdict(
                suite=suite.name,
                required=True,
                passed=True,
                reason=f"fresh, green, recorded {latest.recorded_at}",
            )
        )
    return verdicts


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _load_router_config() -> Optional[dict]:
    try:
        from .config import load_config  # type: ignore[import-not-found]
    except ImportError:  # pragma: no cover
        try:
            from config import load_config  # type: ignore[no-redef]
        except ImportError:
            return None
    try:
        return load_config()
    except Exception:  # pragma: no cover - config is advisory here
        return None


def _find_suite(
    suites: Sequence[SuiteSpec], name: str
) -> Optional[SuiteSpec]:
    for s in suites:
        if s.name == name:
            return s
    return None


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="run_of_record",
        description=(
            "Record an expensive suite's run of record, or check that the "
            "recorded run postdates the last change to the surfaces it "
            "covers."
        ),
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    rec = sub.add_parser("record", help="Append a run of record.")
    rec.add_argument("--session-set-dir", required=True)
    rec.add_argument("--suite", required=True)
    rec.add_argument(
        "--outcome", choices=OUTCOMES, default=OUTCOME_PASSED
    )
    rec.add_argument("--session-number", type=int, default=None)
    rec.add_argument(
        "--detail", default="", help="e.g. '35 passed / 0 failed'."
    )
    rec.add_argument(
        "--duration-seconds",
        type=float,
        required=True,
        help=(
            "Wall-clock seconds the run took. REQUIRED (Set 116 S1): a "
            "structured field that is optional at the writer boundary "
            "never gets populated, which is the exact 'sometimes there is "
            "no measurement' condition this exists to fix. `record_run()` "
            "requires it too -- this CLI flag is required for the same "
            "reason, one level up."
        ),
    )

    chk = sub.add_parser(
        "check", help="Report freshness for every expensive suite."
    )
    chk.add_argument("--session-set-dir", required=True)
    chk.add_argument(
        "--files-changed",
        nargs="*",
        default=None,
        help=(
            "Paths this session changed. Defaults to the disposition's "
            "files_changed."
        ),
    )
    chk.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero when a required suite is stale or missing.",
    )

    sub.add_parser("suites", help="List the declared suites.")
    return p


def _files_changed_from_disposition(session_set_dir: str) -> List[str]:
    path = os.path.join(session_set_dir, "disposition.json")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            d = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return []
    fc = d.get("files_changed")
    return [f for f in fc if isinstance(f, str)] if isinstance(fc, list) else []


def run(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    suites = load_suites(_load_router_config())

    if args.cmd == "suites":
        for s in suites:
            tag = "expensive" if s.expensive else "cheap"
            print(f"{s.name:<12} [{tag}]  covers: {', '.join(s.covers)}")
            if s.command:
                print(f"{'':<12}  command: {s.command}")
        return 0

    if args.cmd == "record":
        suite = _find_suite(suites, args.suite)
        if suite is None:
            known = ", ".join(s.name for s in suites) or "<none declared>"
            print(
                f"run_of_record: unknown suite {args.suite!r} "
                f"(declared: {known})",
                file=sys.stderr,
            )
            return 2
        try:
            rec = record_run(
                args.session_set_dir,
                suite,
                args.outcome,
                session_number=args.session_number,
                detail=args.detail,
                duration_seconds=args.duration_seconds,
            )
        except (ValueError, RuntimeError) as exc:
            print(f"run_of_record: {exc}", file=sys.stderr)
            return 2
        duration_note = (
            f" duration={rec.duration_seconds:.1f}s"
            if rec.duration_seconds is not None
            else ""
        )
        print(
            f"Recorded {rec.suite} run: outcome={rec.outcome} "
            f"digest={rec.surface_digest[:12]}{duration_note} at {rec.recorded_at}"
        )
        return 0

    files_changed = (
        args.files_changed
        if args.files_changed is not None
        else _files_changed_from_disposition(args.session_set_dir)
    )
    verdicts = evaluate_freshness(
        args.session_set_dir, files_changed, suites
    )
    if not verdicts:
        print("No expensive suites declared; nothing to check.")
        return 0
    failed = False
    for v in verdicts:
        if not v.required:
            print(f"[--] {v.suite}: {v.reason}")
            continue
        if v.passed:
            print(f"[ok] {v.suite}: {v.reason}")
        else:
            failed = True
            print(f"[!!] {v.suite}: {v.reason}")
    if failed and args.check:
        return 1
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    return run(argv)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())


__all__ = [
    "TEST_RUNS_FILENAME",
    "OUTCOMES",
    "OUTCOME_PASSED",
    "OUTCOME_FAILED",
    "OUTCOME_ABORTED",
    "DEFAULT_SUITES",
    "SuiteSpec",
    "TestRunRecord",
    "FreshnessVerdict",
    "load_suites",
    "surface_digest",
    "read_records",
    "record_run",
    "session_touched",
    "evaluate_freshness",
    "main",
    "run",
]
