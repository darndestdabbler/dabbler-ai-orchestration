"""The test run of record: what proves "the suite was green on this code".

Freshness is a content digest over each suite's declared surfaces, never an
mtime — checkouts, stash pops, and no-op saves rewrite mtimes without
changing content, and both error directions (stale-looks-fresh,
fresh-looks-stale) are unacceptable in a gate. Records append to
``.dabbler/runs/<set>/test-runs.jsonl`` (machine-side, gitignored), so
recording a run can never stale the very surfaces it just digested.

Suites are declared by the repository in ``dabbler.yaml`` under
``testing.suites``. A suite's
``covers`` is its complete input allowlist — product source, tests,
fixtures, lockfiles, test config. The failure direction is deliberate: run
a suite you did not need rather than skip one you did.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import math
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# One vocabulary for what a suite may declare, imported rather than
# restated: two lists that disagree make a valid declaration read as a typo
# in whichever module holds the shorter one.
from .checks import SUITE_FIELDS
from .evidence import repo_root_for, run_git
from .journal import is_machine_state_path
from .ledger import LIFECYCLE_WRITTEN_FILES, RUNS_DIRNAME

OUTCOME_PASSED = "passed"
OUTCOME_FAILED = "failed"
OUTCOME_ABORTED = "aborted"
OUTCOMES = (OUTCOME_PASSED, OUTCOME_FAILED, OUTCOME_ABORTED)

# A run's stage says what it is evidence *of*, and the two are not
# interchangeable. ``preverify-targeted`` is the affected-test run that
# precedes verification; it is never proof that the suite is green.
# ``final-full`` is the one complete run, taken against the final verified
# tree, and it alone can satisfy the close gate. A record with neither stage
# satisfies nothing -- the safe direction when a row predates the vocabulary.
STAGE_PREVERIFY_TARGETED = "preverify-targeted"
STAGE_FINAL_FULL = "final-full"
STAGES = (STAGE_PREVERIFY_TARGETED, STAGE_FINAL_FULL)

# What made a pre-verification command acceptable, or what made it invalid.
# ``final-full`` runs carry none of these: the complete suite IS the declared
# command, so the vocabulary cannot apply to it.
POLICY_TARGETED = "targeted"
POLICY_ALL_TESTS_AFFECTED = "all-tests-affected"
POLICY_OPERATOR_OVERRIDE = "operator-override"
# The suite declared it has no targeted form, so its complete run is the
# smallest honest evidence for this change. Recorded under its own name
# rather than as `targeted`, because a reader has to be able to tell a run
# narrowed to the selected tests from one that could not be narrowed.
POLICY_SUITE_WHOLE = "suite-runs-whole"
POLICY_VIOLATION = "policy_violation"
POLICIES = (
    POLICY_TARGETED, POLICY_ALL_TESTS_AFFECTED, POLICY_OPERATOR_OVERRIDE,
    POLICY_SUITE_WHOLE, POLICY_VIOLATION,
)
# The three that make a run count as pre-verification evidence. A violation
# is still written -- the wasted run is exactly what the record is for -- and
# satisfies nothing.
ACCEPTED_POLICIES = (
    POLICY_TARGETED, POLICY_ALL_TESTS_AFFECTED, POLICY_OPERATOR_OVERRIDE,
    POLICY_SUITE_WHOLE,
)

TEST_RUNS_FILENAME = "test-runs.jsonl"


def run_of_record_recipe(sessions_dir, suite: str, command: str) -> str:
    """What stands between a verified tree and a close. A verified session is
    not a closeable one: the complete suite has not yet run against the tree
    that was verified, and nothing has been pushed."""
    return (
        "The run of record and the push remain:\n"
        f"  {command}\n"
        f"  python -m ai_router.test_evidence record --sessions-dir "
        f"{sessions_dir} --suite {suite} --stage {STAGE_FINAL_FULL} "
        "--outcome passed --duration-seconds <elapsed>\n"
        "  git commit, then git push -- once, here\n"
        f"  python -m ai_router.session close --sessions-dir "
        f"{sessions_dir}"
    )

# Set-dir files the sanctioned writers own; they change during a session
# and must not count as "the covered surfaces changed".
SESSION_BOOKKEEPING_BASENAMES = frozenset(LIFECYCLE_WRITTEN_FILES) | {
    ".lifecycle.lock"
}


@dataclass(frozen=True)
class SuiteSpec:
    name: str
    command: str
    covers: tuple
    expensive: bool = False
    #: The runner takes no subset, so a run of it is the complete suite.
    runs_whole: bool = False


@dataclass(frozen=True)
class SuiteLoadResult:
    suites: tuple
    errors: tuple = ()

    @property
    def ok(self) -> bool:
        return not self.errors


@dataclass(frozen=True)
class TestRunRecord:
    suite: str
    command: str
    outcome: str
    surface_digest: str
    recorded_at: str
    stage: str = ""
    tree_digest: str = ""
    policy: str = ""
    policy_reason: str = ""
    selected_tests: tuple = ()
    session_number: Optional[int] = None
    detail: str = ""
    duration_seconds: Optional[float] = None

    def to_dict(self) -> dict:
        out = {
            "suite": self.suite, "command": self.command,
            "outcome": self.outcome, "surfaceDigest": self.surface_digest,
            "recordedAt": self.recorded_at,
        }
        if self.stage:
            out["stage"] = self.stage
        if self.tree_digest:
            out["treeDigest"] = self.tree_digest
        if self.policy:
            out["policy"] = self.policy
        if self.policy_reason:
            out["policyReason"] = self.policy_reason
        if self.selected_tests:
            out["selectedTests"] = [
                {"path": path, "reason": reason}
                for path, reason in self.selected_tests
            ]
        if self.session_number is not None:
            out["sessionNumber"] = self.session_number
        if self.detail:
            out["detail"] = self.detail
        if self.duration_seconds is not None:
            out["durationSeconds"] = self.duration_seconds
        return out


@dataclass(frozen=True)
class FreshnessVerdict:
    suite: str
    required: bool
    passed: bool
    reason: str = ""
    changed_inputs: tuple = ()


# --- Path normalization and prefix matching ---------------------------------

def _posix(path: str) -> str:
    # Every platform, not os.sep: a Windows-authored path evaluated
    # elsewhere must still match.
    return path.replace("\\", "/")


def _normalise_rel(path: str) -> str:
    rel = _posix(str(path)).strip()
    # A "./" PREFIX loop, never lstrip("./"): lstrip strips a character
    # set and would eat the leading dot of ".github/".
    while rel.startswith("./"):
        rel = rel[2:]
    rel = rel.strip("/")
    # "." is the whole-repo prefix; it must match everything, not nothing.
    return "" if rel == "." else rel


def matching_prefixes(rel: str, prefixes) -> tuple:
    """Which declared prefixes cover *rel*, anchored at path boundaries —
    ``a/tests_helper.py`` does not match prefix ``a/tests/``. A prefix that
    normalises to '' (a whole-repo suite) matches everything."""
    rel_n = _normalise_rel(rel)
    hits = []
    for prefix in prefixes:
        p_n = _normalise_rel(prefix)
        if p_n == "" or rel_n == p_n or rel_n.startswith(p_n + "/"):
            hits.append(prefix)
    return tuple(hits)


# --- Suite declarations ------------------------------------------------------

def load_suites_checked(config) -> SuiteLoadResult:
    """Suites plus every declaration error. The gate must block on errors:
    "no expensive suites declared" and "every declared suite was a typo and
    got silently dropped" must never be indistinguishable."""
    if not isinstance(config, dict):
        return SuiteLoadResult((), ())
    raw = (config.get("testing") or {}).get("suites")
    if raw is None:
        return SuiteLoadResult((), ())
    if not isinstance(raw, list):
        return SuiteLoadResult((), ("testing.suites must be a list",))
    suites, errors = [], []
    for index, entry in enumerate(raw):
        label = f"testing.suites[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{label} must be a mapping")
            continue
        unknown = sorted(set(entry) - SUITE_FIELDS)
        if unknown:
            errors.append(f"{label} has unknown key(s) {unknown}")
        name = entry.get("name")
        command = entry.get("command")
        covers = entry.get("covers")
        if not isinstance(name, str) or not name.strip():
            errors.append(f"{label}.name must be a non-empty string")
            continue
        if not isinstance(command, str) or not command.strip():
            errors.append(f"{label}.command must be a non-empty string")
            continue
        if not isinstance(covers, list) or not all(
            isinstance(c, str) for c in covers
        ):
            errors.append(f"{label}.covers must be a list of path prefixes")
            continue
        suites.append(SuiteSpec(
            name=name.strip(), command=command.strip(),
            covers=tuple(covers), expensive=bool(entry.get("expensive")),
            runs_whole=bool(entry.get("runs_whole")),
        ))
    return SuiteLoadResult(tuple(suites), tuple(errors))


# --- Digesting the covered surfaces -----------------------------------------

def _git_z(repo_root, *args) -> Optional[list]:
    rc, out, _ = run_git(repo_root, "-c", "core.quotepath=false", *args)
    if rc != 0:
        return None
    return [p for p in out.split("\0") if p]


def _sessions_rel(repo_root, sessions_dir) -> Optional[str]:
    if sessions_dir is None:
        return None
    try:
        rel = os.path.relpath(str(sessions_dir), str(repo_root))
    except ValueError:
        return None
    rel = _normalise_rel(rel)
    return None if rel.startswith("..") else rel


def is_session_bookkeeping(rel: str, sessions_rel: Optional[str]) -> bool:
    """Only the sessions root, and only basenames the sanctioned writers
    own. The session plan is deliberately not here: editing the plan the
    session is running against still stales its run."""
    if not sessions_rel:
        return False
    rel_n = _normalise_rel(rel)
    if not rel_n.startswith(sessions_rel + "/"):
        return False
    return rel_n.rsplit("/", 1)[-1] in SESSION_BOOKKEEPING_BASENAMES


def surface_digest(
    repo_root, covers, *, sessions_dir=None
) -> Optional[str]:
    """SHA-256 over the sorted (path, content-hash) pairs of every tracked
    or untracked non-ignored file under the covered prefixes. ``None`` when
    git is unavailable — an unmeasurable surface is never "unchanged"."""
    tracked = _git_z(repo_root, "ls-files", "-z", "--")
    untracked = _git_z(
        repo_root, "ls-files", "--others", "--exclude-standard", "-z", "--"
    )
    if tracked is None or untracked is None:
        return None
    sessions_rel = _sessions_rel(repo_root, sessions_dir)
    lines = []
    for rel in sorted(set(tracked) | set(untracked)):
        if not matching_prefixes(rel, covers):
            continue
        if is_session_bookkeeping(rel, sessions_rel):
            continue
        if is_machine_state_path(rel):
            # The fifth reader that has to know the run ledger is not work.
            # Tracking `.dabbler/runs/` put it inside `ls-files`, and this
            # function records a digest and then appends its own record to
            # that directory -- so counting it makes the digest it just
            # stored wrong the instant it is stored, and the freshness gate
            # can never pass. A round is appended after the tree it
            # describes; the ledger is the record, not the work.
            continue
        try:
            digest = hashlib.sha256(
                (Path(repo_root) / rel).read_bytes()
            ).hexdigest()
        except OSError:
            # Omitted, not marked. `ls-files` lists a tracked file that has
            # been deleted but not yet committed, so a marker line here
            # would leave the digest the moment the deletion is committed
            # and `ls-files` stops naming the path -- moving the digest
            # across a commit in which no file's content changed at all,
            # and making the freshness gate demand a second full suite run
            # to prove that nothing happened. Omitting it moves the digest
            # once, when the file actually goes.
            continue
        lines.append(f"{_normalise_rel(rel)}\0{digest}")
    joined = "\n".join(lines)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def tree_digest(repo_root, *, sessions_dir=None) -> Optional[str]:
    """The digest of the whole tree a run was taken against. A ``final-full``
    record binds to this, so a suite that ran and was then followed by an edit
    anywhere -- including outside the suite's own ``covers`` -- is no longer
    proof about the tree being closed."""
    return surface_digest(repo_root, ("",), sessions_dir=sessions_dir)


# --- Records ----------------------------------------------------------------

def _runs_path(repo_root) -> Path:
    return Path(repo_root) / RUNS_DIRNAME / TEST_RUNS_FILENAME


def read_records(repo_root) -> list:
    """Lenient by design: one bad line must not blind the gate to the good
    ones. Missing file is an empty history."""
    path = _runs_path(repo_root)
    records = []
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return records
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(row, dict):
            continue
        suite = row.get("suite")
        digest = row.get("surfaceDigest")
        if not isinstance(suite, str) or not isinstance(digest, str):
            continue
        session_number = row.get("sessionNumber")
        if isinstance(session_number, bool) or not isinstance(
            session_number, int
        ):
            session_number = None
        duration = row.get("durationSeconds")
        if isinstance(duration, bool) or not isinstance(
            duration, (int, float)
        ) or not math.isfinite(duration):
            duration = None
        # An unrecognised stage is dropped rather than carried: it must not
        # be mistaken for `final-full` downstream.
        stage = row.get("stage")
        stage = stage if stage in STAGES else ""
        # Same for the policy: an unknown token is no exception at all.
        policy = row.get("policy")
        policy = policy if policy in POLICIES else ""
        selected = []
        for entry in row.get("selectedTests") or ():
            if isinstance(entry, dict) and isinstance(entry.get("path"), str):
                selected.append(
                    (entry["path"], str(entry.get("reason") or ""))
                )
        records.append(TestRunRecord(
            suite=suite, command=str(row.get("command") or ""),
            outcome=str(row.get("outcome") or ""), surface_digest=digest,
            recorded_at=str(row.get("recordedAt") or ""),
            stage=stage, tree_digest=str(row.get("treeDigest") or ""),
            policy=policy,
            policy_reason=str(row.get("policyReason") or ""),
            selected_tests=tuple(selected),
            session_number=session_number,
            detail=str(row.get("detail") or ""),
            duration_seconds=duration,
        ))
    return records


def record_run(
    sessions_dir, suite: SuiteSpec, outcome: str, *, stage: str,
    duration_seconds, command=None, policy: str = "",
    policy_reason: str = "", selected_tests=(), session_number=None,
    detail: str = "", repo_root=None,
) -> TestRunRecord:
    """Append one run record. Strict at the write boundary (an optional
    field never gets populated); ``read_records`` stays lenient for old
    rows. An unrecordable run is an error, not a silently-empty record.

    *stage* is required and closed: what a run proves depends entirely on
    when it was taken, so it can never be inferred at read time.

    A ``preverify-targeted`` run must name the command that actually ran and
    the policy that judged it -- the whole point is that the command is
    evidence, not a formality. A ``final-full`` run may name neither: it is
    the declared suite command by definition, and a caller-supplied one
    would let the run of record be something other than the suite."""
    if outcome not in OUTCOMES:
        raise ValueError(f"outcome must be one of {OUTCOMES}, got {outcome!r}")
    if stage not in STAGES:
        raise ValueError(f"stage must be one of {STAGES}, got {stage!r}")
    if stage == STAGE_PREVERIFY_TARGETED:
        if not str(command or "").strip():
            raise ValueError(
                "a preverify-targeted record must name the command that ran"
            )
        if policy not in POLICIES:
            raise ValueError(
                f"policy must be one of {POLICIES}, got {policy!r}"
            )
    else:
        if command is not None:
            raise ValueError(
                "a final-full run is the declared suite command; a "
                "caller-supplied command does not apply"
            )
        if policy:
            raise ValueError(
                "the pre-verification policy vocabulary does not apply to a "
                "final-full run"
            )
    if isinstance(duration_seconds, bool) or not isinstance(
        duration_seconds, (int, float)
    ) or not math.isfinite(duration_seconds) or duration_seconds <= 0:
        raise ValueError(
            f"duration_seconds must be a positive finite number, got "
            f"{duration_seconds!r}"
        )
    root = repo_root or repo_root_for(sessions_dir)
    if root is None:
        raise RuntimeError(
            f"no git repository found above {sessions_dir}"
        )
    digest = surface_digest(
        root, suite.covers, sessions_dir=sessions_dir
    )
    if digest is None:
        raise RuntimeError("could not digest the covered surfaces")
    whole_tree = ""
    if stage == STAGE_FINAL_FULL:
        whole_tree = tree_digest(root, sessions_dir=sessions_dir) or ""
        if not whole_tree:
            raise RuntimeError("could not digest the tree")
    record = TestRunRecord(
        suite=suite.name, command=str(command or suite.command),
        outcome=outcome, surface_digest=digest,
        recorded_at=datetime.datetime.now().astimezone().isoformat(),
        stage=stage, tree_digest=whole_tree,
        policy=policy, policy_reason=policy_reason,
        selected_tests=tuple(
            (str(path), str(reason)) for path, reason in selected_tests
        ),
        session_number=session_number, detail=detail,
        duration_seconds=float(duration_seconds),
    )
    path = _runs_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record.to_dict(), ensure_ascii=False) + "\n")
    return record


# --- Judging freshness ------------------------------------------------------

def affected_suites(files_changed, suites, *, sessions_rel=None) -> dict:
    """``{suite_name: changed_inputs}`` for suites whose covers intersect
    the change set, with active-set bookkeeping dropped from the changes."""
    out: dict = {}
    for suite in suites:
        hits = tuple(
            rel for rel in files_changed
            if matching_prefixes(rel, suite.covers)
            and not is_session_bookkeeping(rel, sessions_rel)
        )
        if hits:
            out[suite.name] = hits
    return out


def evaluate_freshness(
    sessions_dir, files_changed, suites, *, repo_root=None
) -> list:
    """Every expensive suite must have a green record whose digest still
    matches the covered surfaces. A surface untouched since the last green
    run digest-matches automatically, so "the session changed nothing here"
    needs no separate change list; pass *files_changed* to narrow required
    suites to the intersection when a change set is known. No timestamps
    are compared anywhere."""
    root = repo_root or repo_root_for(sessions_dir)
    sessions_rel = _sessions_rel(root, sessions_dir) if root else None
    affected = (
        None if files_changed is None
        else affected_suites(files_changed, suites, sessions_rel=sessions_rel)
    )
    records = read_records(root) if root else []
    verdicts = []
    for suite in suites:
        if not suite.expensive:
            continue
        changed = () if affected is None else affected.get(suite.name, ())
        if root is None:
            verdicts.append(FreshnessVerdict(
                suite.name, True, False,
                "no git repository found; cannot digest the covered "
                "surfaces (failing closed)",
            ))
            continue
        if affected is not None and not changed:
            verdicts.append(FreshnessVerdict(
                suite.name, False, True,
                "session touched none of this suite's surfaces",
            ))
            continue
        current = surface_digest(
            root, suite.covers, sessions_dir=sessions_dir
        )
        if current is None:
            verdicts.append(FreshnessVerdict(
                suite.name, True, False,
                "could not digest the covered surfaces (failing closed)",
                changed,
            ))
            continue
        mine = [
            r for r in records
            if r.suite == suite.name and r.stage == STAGE_FINAL_FULL
        ]
        if not mine:
            targeted = [
                r for r in records
                if r.suite == suite.name
                and r.stage == STAGE_PREVERIFY_TARGETED
            ]
            preamble = (
                f"this session changed {suite.name}'s covered surfaces but "
                "no final-full run of record exists"
            )
            if targeted:
                preamble += (
                    f" ({len(targeted)} preverify-targeted record(s) are "
                    "present; a targeted run precedes verification and never "
                    "proves the suite is green)"
                )
            verdicts.append(FreshnessVerdict(
                suite.name, True, False,
                f"{preamble}; run `{suite.command}` after your last code "
                f"change, then `python -m ai_router.test_evidence record "
                f"--sessions-dir <dir> --suite {suite.name} "
                f"--stage {STAGE_FINAL_FULL} --outcome passed "
                f"--duration-seconds <elapsed>`",
                changed,
            ))
            continue
        latest = mine[-1]
        current_tree = tree_digest(root, sessions_dir=sessions_dir)
        if latest.surface_digest != current:
            verdicts.append(FreshnessVerdict(
                suite.name, True, False,
                f"the {suite.name} run of record (recorded "
                f"{latest.recorded_at or 'at an unknown time'}) PREDATES a "
                f"change to the surfaces it covers; re-run "
                f"`{suite.command}` after your last code change and record "
                "it again",
                changed,
            ))
        elif latest.outcome != OUTCOME_PASSED:
            verdicts.append(FreshnessVerdict(
                suite.name, True, False,
                f"the {suite.name} run of record is fresh but its outcome "
                f"is {latest.outcome!r}; a close needs a green run of "
                "record",
                changed,
            ))
        elif (
            latest.tree_digest and current_tree
            and latest.tree_digest != current_tree
        ):
            verdicts.append(FreshnessVerdict(
                suite.name, True, False,
                f"the {suite.name} run of record is green but the tree moved "
                "under it: a final-full run binds to the tree it ran "
                f"against, and this one does not match. Re-run "
                f"`{suite.command}` against the final tree and record it "
                "again",
                changed,
            ))
        else:
            verdicts.append(FreshnessVerdict(
                suite.name, True, True,
                f"fresh, green, recorded {latest.recorded_at}", changed,
            ))
    return verdicts


# --- CLI (record is the only subcommand an orchestrator needs) --------------

def _judge_preverify_command(config, suite: SuiteSpec, args):
    """``(policy, reason, selected_tests, sanctioned_command)`` for a
    pre-verification run, or a CLI exit code when the selection cannot be
    computed at all. Imported here rather than at module scope: ``affected``
    reads this module's vocabulary, and the dependency runs one way."""
    from .affected import (
        classify_preverify_command,
        load_selection_config,
        preverify_baseline,
        select_tests,
        targeted_command,
        working_tree_changes,
    )

    if not str(args.command or "").strip():
        print(
            "test_evidence: --command is required for a preverify-targeted "
            "record; the command that ran is what the policy judges.",
            file=sys.stderr,
        )
        return 2
    root = repo_root_for(args.sessions_dir)
    if root is None:
        print(
            f"test_evidence: no git repository found above "
            f"{args.sessions_dir}", file=sys.stderr,
        )
        return 2
    loaded = load_selection_config(config)
    if not loaded.ok:
        print(
            "test_evidence: testing.selection is malformed: "
            + "; ".join(loaded.errors), file=sys.stderr,
        )
        return 2
    changed = working_tree_changes(
        root, preverify_baseline(root, args.sessions_dir)
    )
    if changed is None:
        print(
            "test_evidence: could not determine the change set; a targeted "
            "run cannot be proved targeted against an unknown one.",
            file=sys.stderr,
        )
        return 2
    # Narrowed to what this suite owns: a repository with two runners has
    # two selections, and judging one runner's command against the other's
    # tests would refuse every honest run in a two-ecosystem repository.
    mine = select_tests(root, changed, loaded.config).for_suite(suite.name)
    verdict = classify_preverify_command(
        args.command, mine, override_reason=args.allow_full_preverify,
        runs_whole=suite.runs_whole, declared_command=suite.command,
    )
    return (
        verdict.policy, verdict.reason,
        tuple((s.path, s.reason) for s in mine.selected),
        targeted_command(suite.command, mine, runs_whole=suite.runs_whole),
    )


def main(argv=None) -> int:
    from .config import load_config

    parser = argparse.ArgumentParser(prog="python -m ai_router.test_evidence")
    sub = parser.add_subparsers(dest="command", required=True)
    rec = sub.add_parser("record", help="record a completed test run")
    rec.add_argument("--sessions-dir",
                        help="the repository's sessions root; derived from "
                             "the working directory when omitted")
    rec.add_argument("--suite", required=True)
    rec.add_argument(
        "--stage", required=True, choices=list(STAGES),
        help=(
            "preverify-targeted: the affected-test run before verification. "
            "final-full: the one complete run against the final verified "
            "tree, and the only stage a close accepts."
        ),
    )
    rec.add_argument(
        "--outcome", required=True, choices=OUTCOMES,
        help="record honestly; a red run recorded beats silence",
    )
    rec.add_argument("--duration-seconds", required=True, type=float)
    rec.add_argument(
        "--command",
        help=(
            "the command that actually ran; required for "
            "preverify-targeted, where it is judged against the selection. "
            "A final-full run is the declared suite command and takes none."
        ),
    )
    rec.add_argument(
        "--allow-full-preverify", metavar="REASON",
        help=(
            "operator exception: accept a pre-verification run that does "
            "not name the selected tests. The reason is mandatory and is "
            "recorded; an override nobody can audit is not an exception."
        ),
    )
    rec.add_argument("--session-number", type=int)
    rec.add_argument("--detail", default="")
    args = parser.parse_args(argv)

    from .evidence import SessionsRootNotFoundError, resolve_sessions_dir

    try:
        args.sessions_dir = resolve_sessions_dir(args.sessions_dir)
    except SessionsRootNotFoundError as exc:
        print(f"test_evidence: {exc}", file=sys.stderr)
        return 2

    config = load_config()
    loaded = load_suites_checked(config)
    if loaded.errors:
        print(
            "test_evidence: testing.suites is malformed: "
            + "; ".join(loaded.errors),
            file=sys.stderr,
        )
        return 2
    suite = next((s for s in loaded.suites if s.name == args.suite), None)
    if suite is None:
        print(
            f"test_evidence: unknown suite {args.suite!r}; declared: "
            f"{[s.name for s in loaded.suites] or '(none)'}",
            file=sys.stderr,
        )
        return 2

    policy = policy_reason = sanctioned = ""
    selected = ()
    if args.stage == STAGE_PREVERIFY_TARGETED:
        judged = _judge_preverify_command(config, suite, args)
        if isinstance(judged, int):
            return judged
        policy, policy_reason, selected, sanctioned = judged
    elif args.command or args.allow_full_preverify is not None:
        print(
            "test_evidence: --command and --allow-full-preverify describe a "
            "pre-verification run; a final-full run is the declared suite "
            f"command ({suite.command}) against the final verified tree.",
            file=sys.stderr,
        )
        return 2
    try:
        record = record_run(
            args.sessions_dir, suite, args.outcome,
            stage=args.stage,
            duration_seconds=args.duration_seconds,
            command=args.command, policy=policy,
            policy_reason=policy_reason, selected_tests=selected,
            session_number=args.session_number, detail=args.detail,
        )
    except (ValueError, RuntimeError) as exc:
        print(f"test_evidence: {exc}", file=sys.stderr)
        return 2
    if record.policy == POLICY_VIOLATION:
        # Written, then refused: the wasted run is the evidence, and a
        # refusal that suppressed its own record would hide the ceremony it
        # exists to price.
        from .affected import preverify_recipe

        remedy = (
            preverify_recipe(args.sessions_dir, suite.name, sanctioned)
            if sanctioned
            else "Nothing needed to run here; record nothing and go "
                 "straight to verification."
        )
        print(
            f"test_evidence: recorded and REFUSED as {POLICY_VIOLATION} -- "
            f"{record.policy_reason}\n{remedy}",
            file=sys.stderr,
        )
        return 2
    print(f"recorded {record.suite} [{record.stage}]: {record.outcome} "
          f"(digest {record.surface_digest[:12]})"
          + (f" policy {record.policy}" if record.policy else ""))
    if record.outcome == OUTCOME_PASSED:
        if record.stage == STAGE_PREVERIFY_TARGETED:
            print(
                f"Next: python -m ai_router.verify --sessions-dir "
                f"{args.sessions_dir}"
            )
        elif record.stage == STAGE_FINAL_FULL:
            print(
                "Next: git commit, then git push -- once -- then\n"
                f"  python -m ai_router.session close --sessions-dir "
                f"{args.sessions_dir}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
