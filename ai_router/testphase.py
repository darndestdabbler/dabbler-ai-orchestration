"""The tests phase: the verifier authors the tests, the framework runs them.

The split is the whole module. The verifier authors because it did not write
the code and does not inherit its blind spots; the framework runs because
"the tests pass" has to be an observation. A model that both writes tests and
reports on them is scoring its own work, and the result stops being a fact
anything can branch on.

So nothing here asks the verifier for a result, and the prompt says so. What
comes back is a file, offered through the ``test-write`` block
:mod:`ai_router.agency` performs — the verifier holds no write tool on either
transport, which is what makes a refusal possible. What decides the round is
an exit code from :func:`ai_router.checks.execute`.

The suite is the one this repository declares for the paths that were
written, so the phase runs the tests through the same declaration ordinary
selection reads. A written test the declared suites do not cover is refused
rather than run some other way: a test nobody declared a runner for is a test
whose green means nothing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from ai_router import agency
from ai_router.checks import (
    REASON_CHANGED_TEST, STAGE_TARGETED, Check, SelectedTest, SelectionResult,
    covers_any, execute, load_checks, load_selection_config,
    scope_for_test, selection_payload, targeted_command, timeout_for,
)
from ai_router.evidence import snapshot_worktree_tree
from ai_router.route import NoCandidateError, route
from ai_router.selection import ROLE_VERIFIER
from ai_router.solution import STEP_DELIVERABLES, STEP_TITLES
from ai_router.stepreview import read_artifacts

#: Why the phase runs what it runs. These files changed, because the verifier
#: just wrote them.
SELECTED_BY_AUTHORED = "tests-phase"

TASK_TYPE = "test-generation"


class PhaseError(Exception):
    """The phase could not be run. Never an outcome — a phase that did not
    happen and a phase whose tests failed are different facts, and a red
    round is the one the loop is allowed to act on.

    Not named for the phase, because a ``Test`` prefix makes pytest try to
    collect it and the suite reports a warning about its own machinery.
    """


@dataclass(frozen=True)
class Authoring:
    """One authoring hand-off: who wrote, over what transport, and what the
    framework did with each file they asked for."""

    provider: str
    model: str
    transport: str
    writes: tuple = ()
    simulated: bool = False

    @property
    def written(self) -> tuple:
        return tuple(w.path for w in self.writes if w.accepted)

    @property
    def refused(self) -> tuple:
        return tuple(w.path for w in self.writes if not w.accepted)

    def as_dict(self) -> dict:
        return {
            "provider": self.provider,
            "model": self.model,
            "transport": self.transport,
            "simulated": self.simulated,
            "written": list(self.written),
            "writes": [w.as_row() for w in self.writes],
        }


def build_prompt(target: str, step: str, artifacts: list, grant) -> str:
    """What the verifier is asked for: files, not findings and not a verdict.

    The write surface is described by :func:`ai_router.agency.briefing`, so
    the block the prompt asks for and the block the framework parses are one
    description.
    """
    body = [
        "You are writing tests for one step of a solution being built in six "
        "steps.",
        "A different AI produced the work below. You did not write it, you "
        "are not fixing it, and you are not reviewing it — your job is to "
        "author tests that fail if it is wrong.",
        "",
        f"## The step: {STEP_TITLES[step]}",
        "",
        f"**Under test:** `{target}`",
        "",
        "**What this step owes:**",
        "",
        STEP_DELIVERABLES[step],
        "",
        "## What it produced",
        "",
    ]
    for path, text in artifacts:
        body += [f"### `{path}`", "", "````", text.rstrip(), "````", ""]

    briefing = agency.briefing(grant)
    if briefing:
        body += [briefing, ""]

    body += [
        "## How to answer",
        "",
        "**Emit the test files and nothing else that matters.** Every file "
        "goes in its own `test-write` block, exactly as described above. "
        "Prose outside the blocks is read by a person and acted on by "
        "nobody.",
        "",
        "- **One test per behaviour.** A second test of the same behaviour "
        "costs a maintenance obligation and proves nothing the first did "
        "not.",
        "- **Test what the work claims, at its boundaries and its error "
        "paths.** A test that passes against an empty implementation is "
        "worse than no test, because it reads as coverage.",
        "- **Name each test after the behaviour it proves**, so a failure "
        "says what broke without anyone reading the body.",
        "- **Do not test the framework, the test runner, or your own "
        "fixtures.**",
        "",
        "**You will not run these tests, and you must not say whether they "
        "pass.** The framework runs them and the exit code is the fact. A "
        "sentence claiming a result is the one thing this hand-off exists "
        "to prevent — it would be scoring your own work, and it is ignored.",
        "",
        "**You cannot change the implementation.** Your only write is a test "
        "file under the declared test root. If the work is untestable as it "
        "stands, write the test that says so and let it fail.",
    ]
    return "\n".join(body)


def author(
    repo_root,
    target: str,
    step: str,
    artifact_paths,
    config: dict,
    *,
    author_provider: Optional[str] = None,
    transport: Optional[str] = None,
    read_budget: Optional[int] = None,
) -> tuple:
    """Ask a verifier for the tests and write the ones the boundary allows.

    Returns ``(Authoring, raw response)`` — the raw text is returned so the
    caller can file it verbatim.

    The grant the prompt describes is built from the resolved transport
    preference; the writes are applied under the grant of the transport the
    call actually ran on, because a round that fell back to the API path
    could not have been offered a surface however it was briefed.
    """
    if step not in STEP_TITLES:
        raise PhaseError(f"unknown step '{step}'")
    artifacts = read_artifacts(artifact_paths)
    if not artifacts:
        raise PhaseError(
            "name at least one artifact. Tests written against nothing pass "
            "against anything."
        )

    selection = load_selection_config(config).config
    if not selection.declares_tests:
        raise PhaseError(
            "no suite in testing.suites declares where its tests live, so "
            "no file the verifier offers could be confirmed to be a test "
            "and every write would be refused. Declare test_roots and "
            "test_glob on a suite first."
        )
    scope = agency.session_scope(
        repo_root, None, [path for path, _ in artifacts]
    )
    budget = read_budget or agency.DEFAULT_READ_BUDGET

    def _grant(for_transport: str):
        return agency.grant_for_transport(
            for_transport, scope, budget,
            selection.scopes, allow_write=True,
        )

    from ai_router.config import resolve_transport

    # Briefed from the resolved preference; the writes are applied under the
    # grant of the transport the call actually ran on, because a round that
    # fell back could not look however it was briefed. The write itself
    # survives the fallback: no tool carries it.
    briefed = _grant(resolve_transport(config, transport))
    prompt = build_prompt(target, step, artifacts, briefed)
    exclude = [author_provider] if author_provider else []
    try:
        result = route(
            content=prompt,
            task_type=TASK_TYPE,
            role=ROLE_VERIFIER,
            exclude_providers=exclude,
            transport=transport,
        )
    except NoCandidateError as exc:
        raise PhaseError(
            f"{exc}. The tests are authored by a provider that is not the "
            "author's; configure another or this step's tests would be "
            "written by whoever wrote the code."
        ) from exc

    simulated = bool((result.metadata or {}).get("simulated"))
    if not simulated and author_provider and result.provider == author_provider:
        raise PhaseError(
            f"{result.provider} answered despite being excluded, so the code "
            "and its tests would have one author. Refusing to write them."
        )

    writes = agency.apply_writes(
        repo_root, _grant(result.transport), result.content
    )
    return Authoring(
        provider=result.provider,
        model=result.served_model_id or result.model_name,
        transport=result.transport,
        writes=writes,
        simulated=simulated,
    ), result.content


def suites_for(config: dict, test_paths) -> tuple:
    """``((suite, its paths), ...)`` — these test files, grouped by the
    suite that answers for each one, in declaration order.

    Ownership comes from the suite's own ``test_roots`` and ``test_glob``,
    which is what makes a two-ecosystem repository work: Maven is handed the
    Java tests and ``dotnet test`` the .NET ones, rather than every path
    going to whichever suite happened to be declared first. ``covers`` is
    the fallback for a path no suite's test declaration claims — a suite
    that runs something which is not a test file still runs it.

    A path nothing claims is refused rather than handed to some other
    runner: the framework runs tests through the declaration or it does not
    run them, and inventing a command here would be a second implementation
    of what a suite is.
    """
    suites = [c for c in load_checks(config) if c.is_suite]
    by_name = {c.name: c for c in suites}
    selection = load_selection_config(config).config

    grouped: dict = {}
    unclaimed = []
    for path in test_paths:
        scope = scope_for_test(path, selection)
        owner = by_name.get(scope.suite) if scope else None
        if owner is None:
            unclaimed.append(path)
        else:
            grouped.setdefault(owner.name, []).append(path)

    for path in unclaimed:
        for check in suites:
            if covers_any(check, [path]):
                grouped.setdefault(check.name, []).append(path)
                break
        else:
            declared = ", ".join(c.name for c in suites) or "(none)"
            raise PhaseError(
                f"no declared suite covers {path} — declared suites: "
                f"{declared}. Add the path to a suite's `test_roots` and "
                "`test_glob`, or to its `covers`, under testing.suites; a "
                "test with no declared runner is a test whose result "
                "nothing can read."
            )

    return tuple(
        (by_name[c.name], tuple(grouped[c.name]))
        for c in suites if c.name in grouped
    )


def run_authored(repo_root, config: dict, test_paths, *, run_id: str = ""):
    """Run the authored tests and report what the exit codes said.

    Returns a tuple of :class:`ai_router.checks.CheckRun`, one per suite
    that owns some of these files, in declaration order. Plural because a
    repository running two ecosystems has two runners: one run carries one
    command, one exit code and one tree, so Maven and ``dotnet test`` cannot
    share a row. A single-suite repository gets a one-element tuple.

    The tree is snapshotted per run rather than once, so a suite that
    dirties the worktree is measured against what it actually found and the
    mutation is recorded on the run that caused it.

    This module does not decide whether a run passed — ``CheckRun.green``
    already does, against the tree the run measured, and a second opinion
    here would eventually disagree with it.
    """
    paths = tuple(dict.fromkeys(p for p in test_paths if p))
    if not paths:
        raise PhaseError(
            "no authored test to run. A run of nothing exits zero, which is "
            "indistinguishable from a suite that passed."
        )
    runs = []
    for check, owned in suites_for(config, paths):
        tree = snapshot_worktree_tree(repo_root)
        if tree is None:
            raise PhaseError(
                f"could not snapshot the working tree at {repo_root}. Every "
                "run is judged against a tree id, so a run that cannot name "
                "the tree it measured proves nothing about it."
            )
        selection = SelectionResult(selected=tuple(
            SelectedTest(path, REASON_CHANGED_TEST, SELECTED_BY_AUTHORED,
                         check.name)
            for path in owned
        ))
        try:
            timeout = timeout_for(check, config)
        except (KeyError, TypeError) as exc:
            raise PhaseError(
                "run_policy.check_timeout_seconds is not declared, and an "
                f"unbounded suite run is how a loop stops being bounded: "
                f"{exc}"
            ) from exc
        runs.append(execute(
            repo_root, check,
            targeted_command(check.display_command(), selection,
                              runs_whole=check.runs_whole),
            stage=STAGE_TARGETED, tree_digest=tree,
            timeout_seconds=timeout, run_id=run_id,
            selection=selection_payload(selection),
        ))
    return tuple(runs)
