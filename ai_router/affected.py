"""The pre-verification stage: which tests a change makes necessary, the
named reason for each, and the standard the command that runs them is held
to.

The declaration and the selector themselves live in :mod:`ai_router.checks`
and are re-exported here — one repository, one answer to what a test is.

Selection is deterministic: the same changed paths against the same tree
always yield the same tests, in the same order, with the same reasons. A
selection record is evidence, and evidence that varies between runs proves
nothing.

Every selected test carries the reason that pulled it in, so a reader can
tell "the selector understood this change" from "the selector gave up".
A changed path that maps to no test is never widened into a full-suite run:
it records ``selection_unknown``, pulls in the configured smoke tests, and
raises a risk for verification to inspect. Running everything is the
expensive way to hide an incomplete mapping.

Two changes are genuinely repository-wide -- the test runner, the shared
bootstrap, the global build config. Those are declared, not guessed, and the
selector says so explicitly rather than letting every path quietly widen.

The selection is also the standard the pre-verification command is held to.
A command earns its place in the record by naming the tests the selector
chose; a full-suite run that names none of them is a ``policy_violation``,
recorded and refused, because the only thing it proves is what it cost.

A remediation is measured against the previous round's snapshot, not the
session's start. Otherwise one repository-wide edit early in a session makes
every later round demand the whole suite again, and the stage that exists to
delete that run becomes the thing prescribing it.

Nothing here reads the code under review. What maps to what is declared by
the repository in its own configuration, in whatever language it is written:
an inferred mapping needs a parser per ecosystem, and buys an optimization on
an optimization. The proof a change is sound is the complete suite against the
final verified tree; selection is only the economy on the way there. A rule
that has gone stale therefore costs a late discovery in that run and cannot
ship a defect, while a mapping the framework guesses is wrong silently.
"""

from __future__ import annotations

import shlex
from dataclasses import dataclass
from pathlib import Path

from .checks import (
    REASON_CHANGED_TEST,
    REASON_CONFIGURED_RULE,
    REASON_PRECEDENCE,
    REASON_SMOKE,
    RISK_SELECTION_UNKNOWN,
    RULE_FIELDS,
    SELECTION_FIELDS,
    SelectedTest,
    SelectionConfig,
    SelectionConfigResult,
    SelectionResult,
    SelectionRisk,
    SuiteScope,
    is_test_file,
    load_selection_config,
    names_a_test,
    select_tests,
    targeted_command,
)
from .checks import _posix as _checks_posix
from .config import PROJECT_CONFIG_FILENAME
from .test_evidence import (
    ACCEPTED_POLICIES,
    OUTCOME_PASSED,
    POLICY_ALL_TESTS_AFFECTED,
    POLICY_OPERATOR_OVERRIDE,
    POLICY_SUITE_WHOLE,
    POLICY_TARGETED,
    POLICY_VIOLATION,
    STAGE_PREVERIFY_TARGETED,
    load_suites_checked,
    read_records,
    surface_digest,
)


# --- The repository's declaration and its selector ---------------------------
#
# Both live in ``checks``. A repository has one answer to "which tests does
# this change make necessary", and the copy that used to sit here was
# byte-identical until the day the declaration changed shape in one of them.
# Re-exported because this module is the lifecycle-facing name for them.

_posix = _checks_posix


# --- The pre-verification policy ---------------------------------------------

def preverify_baseline(repo_root, sessions_dir):
    """The tree a pre-verification run is judged against.

    Before the first round that is ``HEAD``: all of the session's work is
    new. Once a round exists it is that round's recorded snapshot, because a
    remediation answers for what the fix changed and nothing else. Measuring
    every round against ``HEAD`` instead is what lets one repository-wide
    edit early in a session demand a full suite before every later round --
    the exact ceremony the stage exists to remove."""
    from . import ledger
    from .progress import read_session_state

    state = read_session_state(Path(sessions_dir))
    current = (state or {}).get("currentSession")
    if current is None:
        return None
    rounds = ledger.read_rounds(
        repo_root, current
    )
    for row in reversed(rounds):
        if row.get("completion_tree"):
            # The recorded tree, or the substitute a re-anchor supplied when
            # this object store does not hold it. Selection has to measure
            # from the same place the round will.
            return ledger.effective_baseline(repo_root, current, row)
    return None


def working_tree_changes(repo_root, baseline_tree=None):
    """Paths this working tree changes against *baseline_tree*, or against
    HEAD when none is given. Tracked or not. ``None`` when git cannot
    answer -- an unmeasurable change set is never "empty"."""
    from .evidence import changed_paths_between, run_git, snapshot_worktree_tree

    current = snapshot_worktree_tree(repo_root)
    if current is None:
        return None
    if not baseline_tree:
        rc, head, _ = run_git(repo_root, "rev-parse", "HEAD^{tree}")
        if rc != 0 or not head:
            return None
        baseline_tree = head
    return changed_paths_between(repo_root, baseline_tree, current)


@dataclass(frozen=True)
class PreverifyVerdict:
    policy: str
    reason: str
    missing: tuple = ()

    @property
    def accepted(self) -> bool:
        return self.policy in ACCEPTED_POLICIES


@dataclass(frozen=True)
class PreverifyGate:
    ok: bool
    reason: str = ""
    suite: str = ""
    command: str = ""
    # ((suite, command, policy), ...) for each run that satisfied the gate.
    # A verdict that says only "accepted" cannot be audited later: the
    # record has to name the command it accepted and what made it
    # acceptable, or nothing downstream can tell which run was blessed.
    accepted: tuple = ()


def _command_tokens(command) -> frozenset:
    text = _posix(str(command or ""))
    try:
        tokens = shlex.split(text)
    except ValueError:
        tokens = text.split()
    return frozenset(t.strip("'\"") for t in tokens if t)


def command_names_test(command, test_path: str) -> bool:
    """Whether *command* names *test_path* as a test to run.

    A file, or a node id inside that file -- nothing wider. A directory
    argument is deliberately not a match: ``pytest tests/`` is the full
    suite with a path typed in front of it, and accepting it would make
    every refusal in this module one keystroke away from meaningless."""
    target = _posix(test_path)
    return any(
        token == target or token.startswith(target + "::")
        for token in _command_tokens(command)
    )


def runnable_commands(suites, result) -> list:
    """One command per declared suite, each naming only the tests that
    suite owns -- or, where the repository declared no suite, the
    declaration to make instead of a command to run.

    A repository that is Java and .NET at once has two runners, and a
    single line naming both ecosystems' tests would fail in whichever of
    them was asked to run the other's. Where nothing is declared there is
    nothing to print: improvising ``python -m pytest`` teaches an
    orchestrator in a Java repository to paste a runner nobody declared,
    and the run of record would then cite it.
    """
    if not suites:
        return [
            "no suite is declared, so there is no command to run. Declare "
            f"one under testing.suites in {PROJECT_CONFIG_FILENAME}: a "
            "name, the command that runs it, and the paths it covers."
        ]
    return [
        command for command in (
            targeted_command(s.command, result.for_suite(s.name),
                             runs_whole=s.runs_whole)
            for s in suites
        ) if command
    ]


RECORD_PLACEHOLDER = "<the command you ran>"


def record_command(sessions_dir, suite: str, command: str = "") -> str:
    """The one rendering of the record line. Every message that asks for
    pre-verification evidence prints this, so a caller cannot invent a
    variant that names a flag the CLI does not take."""
    return (
        f"python -m ai_router.test_evidence record --sessions-dir "
        f"{sessions_dir} --suite {suite or '<name>'} "
        f"--stage preverify-targeted "
        f"--command \"{command or RECORD_PLACEHOLDER}\" --outcome passed "
        "--duration-seconds <elapsed>"
    )


def preverify_recipe(sessions_dir, suite: str, command: str) -> str:
    """Run the selected tests, then record that run. Both lines or neither:
    a message that named the run without the record would leave the caller
    one refusal short of where it thought it was."""
    return (
        "Run the affected tests, then record that command:\n"
        f"  {command}\n"
        f"  {record_command(sessions_dir, suite, command)}"
    )


def remediation_recipe(sessions_dir, suite: str = "") -> str:
    """What a fix must do before another round opens. The selector answers
    again rather than being quoted from the last round: a fix moves the
    surfaces, so the tests it now affects are not the tests the session
    affected."""
    return (
        "Prove the fix before the next round:\n"
        f"  python -m ai_router.affected --sessions-dir {sessions_dir}\n"
        "  <run the command it prints>\n"
        f"  {record_command(sessions_dir, suite)}\n"
        f"  python -m ai_router.verify --sessions-dir {sessions_dir}"
    )


def _override_or_violation(override_reason, why: str, missing: tuple):
    """The two audited ways past a refusal, and the refusal itself."""
    if override_reason is not None:
        reason = str(override_reason).strip()
        if reason:
            return PreverifyVerdict(POLICY_OPERATOR_OVERRIDE, reason, missing)
        return PreverifyVerdict(
            POLICY_VIOLATION,
            "--allow-full-preverify carried no reason; an override nobody "
            "can audit is not an exception",
            missing,
        )
    return PreverifyVerdict(POLICY_VIOLATION, why, missing)


def classify_preverify_command(
    command, result: SelectionResult, *, override_reason=None,
    runs_whole: bool = False, declared_command: str = "",
) -> PreverifyVerdict:
    """What makes *command* acceptable pre-verification evidence, or why it
    is not.

    A command earns ``targeted`` by naming every test the selector chose --
    not most of them, and not the directory they live in. The two
    repository-wide exceptions are the only other ways through, and each
    lands in the record under its own name so a reader can tell a proved
    exception from an asserted one. Everything else is a
    ``policy_violation``: the run happened, it cost what it cost, and it
    proves nothing about the change.

    Zero selected tests is not a free pass. A change declared to affect no
    test needs no run, so every run recorded against it is a run nobody
    asked for -- in practice the whole suite, which is the single case this
    stage exists to refuse."""
    if result.all_tests_affected:
        return PreverifyVerdict(
            POLICY_ALL_TESTS_AFFECTED, result.all_affected_reason,
        )
    if not result.test_paths:
        return _override_or_violation(
            override_reason,
            "the selector maps this change set to no test, so no "
            "pre-verification run was needed and this one is evidence of "
            "nothing",
            (),
        )
    if runs_whole:
        # The suite said its runner takes no subset, so "names the selected
        # tests" is a standard it could never meet — and holding it to one
        # would make every honest run of it a policy_violation. What it can
        # be held to is running exactly what it declared, unembellished.
        if _command_tokens(command) == _command_tokens(declared_command):
            return PreverifyVerdict(
                POLICY_SUITE_WHOLE,
                f"the suite declares runs_whole, so its complete run is the "
                f"smallest evidence available for the "
                f"{len(result.test_paths)} selected test(s)",
            )
        return _override_or_violation(
            override_reason,
            "the suite declares runs_whole, so the only run it sanctions is "
            f"its own declared command ({declared_command!r}); this one is "
            "something else",
            (),
        )
    missing = tuple(
        path for path in result.test_paths
        if not command_names_test(command, path)
    )
    if not missing:
        return PreverifyVerdict(
            POLICY_TARGETED,
            f"names all {len(result.test_paths)} selected test(s)",
        )
    return _override_or_violation(
        override_reason,
        f"the command names {len(result.test_paths) - len(missing)} of "
        f"{len(result.test_paths)} selected test(s) and misses "
        + ", ".join(missing[:5])
        + ("..." if len(missing) > 5 else "")
        + ". A run that does not name the selected tests is not evidence "
        "that they ran",
        missing,
    )


def preverify_gate(repo_root, sessions_dir, config) -> PreverifyGate:
    """Whether valid targeted selection evidence exists for the tree as it
    now stands.

    Validity is four things at once: the run was pre-verification, its
    command survived the policy, it was green, and it digest-matches the
    surfaces the suite covers right now. The last one is what makes
    remediation cheap and honest -- a fix moves the surfaces, so the
    affected tests are rerun rather than re-cited."""
    loaded = load_suites_checked(config)
    if loaded.errors:
        return PreverifyGate(
            False,
            "testing.suites is malformed: " + "; ".join(loaded.errors),
        )
    expensive = [s for s in loaded.suites if s.expensive]
    if not expensive:
        return PreverifyGate(True)
    selection = load_selection_config(config)
    if not selection.ok:
        return PreverifyGate(
            False,
            "testing.selection is malformed: " + "; ".join(selection.errors),
        )
    changed = working_tree_changes(
        repo_root, preverify_baseline(repo_root, sessions_dir)
    )
    if changed is None:
        return PreverifyGate(
            False,
            "the change set could not be determined, so no run can be "
            "proved targeted against it (failing closed)",
        )
    result = select_tests(repo_root, changed, selection.config)
    if result.unknown_paths and not selection.config.smoke:
        # Uncertainty is supposed to buy the smoke tests. Where none are
        # declared it buys nothing at all, and the tests the *mapped* paths
        # selected would otherwise make the gap read as covered -- a green
        # record for one half of a change says nothing about the other.
        return PreverifyGate(
            False,
            "the selector could not map "
            + ", ".join(result.unknown_paths[:5])
            + ("..." if len(result.unknown_paths) > 5 else "")
            + " to any test and no testing.selection.smoke fallback is "
            "declared, so nothing ran for those paths. Declare the mapping "
            "rather than widening the run",
            expensive[0].name, "",
        )
    if not result.all_tests_affected and not result.test_paths:
        # Declared to affect no test: nothing to prove, and nothing to ask
        # for. Demanding a record here is what would put the full suite in
        # front of verification on the most ordinary change there is.
        return PreverifyGate(True)
    records = read_records(repo_root)
    accepted = []
    for suite in expensive:
        mine = result.for_suite(suite.name)
        if not result.all_tests_affected and not mine.test_paths:
            # The rule three branches up, per suite instead of per change
            # set: a suite the selection named no test of has nothing to
            # prove. Without it the gate is not merely strict, it is
            # unsatisfiable -- an empty selection yields an empty targeted
            # command, and a preverify record must name the command that
            # ran. A repository with one expensive suite never reaches
            # this; one with two reaches it whenever a change touches only
            # the other's surfaces.
            continue
        current = surface_digest(
            repo_root, suite.covers, sessions_dir=sessions_dir,
        )
        if current is None:
            return PreverifyGate(
                False,
                f"the surfaces {suite.name} covers could not be digested "
                "(failing closed)", suite.name,
                targeted_command(suite.command, result.for_suite(suite.name),
                                 runs_whole=suite.runs_whole),
            )
        mine = [
            r for r in records
            if r.suite == suite.name and r.stage == STAGE_PREVERIFY_TARGETED
        ]
        blessed = next(
            (
                r for r in mine
                if r.policy in ACCEPTED_POLICIES
                and r.outcome == OUTCOME_PASSED
                and r.surface_digest == current
            ),
            None,
        )
        if blessed is not None:
            accepted.append((suite.name, blessed.command, blessed.policy))
            continue
        if not mine:
            why = f"no pre-verification run of {suite.name} is recorded"
        elif all(r.policy == POLICY_VIOLATION for r in mine):
            why = (
                f"every recorded pre-verification run of {suite.name} is a "
                f"{POLICY_VIOLATION}"
            )
        elif not any(
            r.policy in ACCEPTED_POLICIES and r.outcome == OUTCOME_PASSED
            for r in mine
        ):
            why = (
                f"the pre-verification run of {suite.name} is not green; a "
                "red targeted run returns to you, not to a verifier"
            )
        else:
            why = (
                f"the pre-verification run of {suite.name} predates a change "
                "to the surfaces it covers"
            )
        return PreverifyGate(
            False, why, suite.name,
            targeted_command(suite.command, result.for_suite(suite.name),
                             runs_whole=suite.runs_whole),
        )
    return PreverifyGate(True, accepted=tuple(accepted))


# --- CLI ---------------------------------------------------------------------

def main(argv=None) -> int:
    import argparse
    import json
    import sys

    from .config import load_config
    from .evidence import repo_root_for, resolve_sessions_dir

    parser = argparse.ArgumentParser(
        prog="python -m ai_router.affected",
        description="the tests this working tree makes necessary, and why",
    )
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--sessions-dir",
        help="the repository's sessions root; derived from the working "
             "directory when omitted",
    )
    args = parser.parse_args(argv)

    repo_root = repo_root_for(".")
    if repo_root is None:
        print("affected: no git repository here", file=sys.stderr)
        return 2
    config = load_config()
    loaded = load_selection_config(config)
    if not loaded.ok:
        print(
            "affected: testing.selection is malformed: "
            + "; ".join(loaded.errors),
            file=sys.stderr,
        )
        return 2
    # Selection is scoped the way verification will scope it: once a round
    # exists, a remediation is measured against that round's snapshot
    # rather than HEAD.
    baseline = preverify_baseline(
        repo_root, resolve_sessions_dir(args.sessions_dir, repo_root)
    )
    changed = working_tree_changes(repo_root, baseline)
    if changed is None:
        # "git could not answer" is not a useful thing to be told. The one
        # cause that is not a broken repository is a baseline object this
        # store does not hold, which is what a session moved between
        # machines arrives with -- so say that, and name the recovery.
        from .evidence import object_exists

        if baseline and not object_exists(repo_root, baseline):
            from .evidence import ROUND_REFSPEC, upstream_remote

            print(
                f"affected: the recorded baseline tree {baseline[:12]} is "
                "not in this repository, so the change set cannot be "
                "measured. A round's snapshot travels as a ref under "
                "refs/dabbler/rounds/, which a clone fetches only when its "
                "refspec says so. Fetch them first, and let bootstrap make "
                "that permanent:\n"
                f"  git fetch {upstream_remote(repo_root)} '{ROUND_REFSPEC}'\n"
                "  python -m ai_router.bootstrap --no-transport-detect\n"
                "If the round was recorded before rounds were anchored, or "
                "its ref was never pushed, re-anchor it onto a commit this "
                "history passed through:\n"
                "  python -m ai_router.verify reanchor --commit <sha> "
                "--reason \"<why the recorded tree is unreachable>\"",
                file=sys.stderr,
            )
            return 2
        print("affected: could not determine the change set", file=sys.stderr)
        return 2

    result = select_tests(repo_root, changed, loaded.config)
    if args.json:
        print(json.dumps(result.to_dict(), indent=2))
        return 0

    # Which baseline produced this, always: a selection measured against
    # HEAD and one measured against the last round look identical as a list
    # of files, and only one of them is what verification will require.
    print(f"scope: {'the last round' if baseline else 'HEAD'}")
    # The runner is whatever the repository declared, never this module's
    # guess: a printed command an orchestrator cannot paste teaches it to
    # improvise one. One command per declared suite, each naming only the
    # tests that suite owns -- a repository that is Java and .NET at once
    # has two runners, and a single line naming both ecosystems' tests
    # would fail in whichever of them was asked to run the other's.
    suites = [s for s in load_suites_checked(config).suites if s.expensive]

    def _commands() -> list:
        return runnable_commands(suites, result)

    if result.all_tests_affected:
        print(f"all tests affected: {result.all_affected_reason}")
        print("\n" + "\n".join(_commands()))
        return 0
    for risk in result.risks:
        print(f"  RISK {risk.kind}: {risk.path}")
    for choice in result.selected:
        print(f"  {choice.reason:22} {choice.path}  <- {choice.selected_by}")
    if not result.selected:
        print("no tests affected by this change set")
        return 0
    print("\n" + "\n".join(_commands()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
