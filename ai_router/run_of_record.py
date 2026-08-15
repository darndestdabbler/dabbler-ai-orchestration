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

What the re-derivation declared, and the one thing it did not
-------------------------------------------------------------
Set 129 S1 traced a full pytest run under an audit hook and found the
suite reads far more of this repo than it declared. Nearly all of that
became ``covers`` entries, including ``docs/session-sets/`` -- which
needed the digest to learn about close-flow bookkeeping first, because
``record_run`` digests the covered surfaces and *then* appends
``test-runs.jsonl`` into the set directory. A suite covering that
directory naively stales its own run the instant it records it
(demonstrated, not assumed). :func:`is_active_set_bookkeeping` is the
narrow exclusion that makes the declaration honest AND satisfiable.

One input is still deliberately undeclared, and it is named here so that
it is a decision rather than a silence: ``docs/planning/``. The suite
does read it -- the guidance ceilings are checked against the real files
-- but ``cite_lessons`` writes the guidance usage ledger there **in the
final commit**, after the run of record, by design. The bookkeeping
exclusion does not reach it: ``lessons-learned.md`` is a real
guidance file with a real ceiling, not a per-set ledger with a
sanctioned-writer basename. Declaring it would make every session that
cites a lesson unclosable, which is a gate that refuses every close
rather than one that guards any. (Set 121 S2 narrowed the write itself:
the close-mandated edit now lands in ``guidance-usage.json`` rather than
inside the always-loaded markdown, so the two preload documents are no
longer rewritten after the run at all.)

``MANIFEST.in`` is the other kind of finding: it looked like an input and
the trace never touched it, so it is correctly absent. Evidence keeps a
declaration from growing as fast as imagination does.

The re-derivation's own first draft got one of these wrong in the other
direction, and it is worth recording because the reasoning read well.
Layer 3 kept three ``ai_router`` writers listed file-by-file rather than
``ai_router/``, on the argument that arming a 13-minute browser suite for
every router edit would make the gate something sessions route around
instead of satisfy. True as far as it went -- and resting on the false
premise that Layer 3 exercised the PUBLISHED router. It installs this
tree (``DABBLER_ROUTER_INSTALL_SPEC`` -> repo root, editable). Cost is a
reason to make a suite cheaper, never a reason to declare an input set
smaller than it is; a declaration narrower than the truth is not a saving,
it is a gate that cannot fire. Smoke/full E2E tiering is deferred in
``verdict.md`` §7 behind precisely this trigger.
"""

from __future__ import annotations

import argparse
import fnmatch
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
    from .verification_stamp import (  # type: ignore[import-not-found]
        WORK_DIFF_SET_BOOKKEEPING,
        sha256_hex,
    )
except ImportError:  # pragma: no cover - direct-script fallback
    from verification_stamp import (  # type: ignore[no-redef]
        WORK_DIFF_SET_BOOKKEEPING,
        sha256_hex,
    )


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


def _normalise_rel(raw: str) -> str:
    """Normalise a declared repo-relative path for prefix comparison.

    Set 129 S1: this replaced ``_posix(raw).lstrip("./")``, which was a
    live bug the re-derivation of ``covers`` walked straight into.
    ``str.lstrip`` strips a CHARACTER SET, not a prefix, so it ate the
    leading dot of every dotfile: ``".github/workflows/test.yml"`` became
    ``"github/workflows/test.yml"`` and ``".gitignore"`` became
    ``"gitignore"``. Any suite declaring a dotted input therefore matched
    NOTHING through :func:`session_touched` while reading perfectly
    correct in the declaration -- a gate silently scoped smaller than it
    is written, which is the fail-open direction this repo refuses
    (L-125-1). Strip the ``"./"`` prefix as a prefix instead.
    """
    rel = _posix(raw.strip())
    while rel.startswith("./"):
        rel = rel[2:]
    rel = rel.lstrip("/")
    return "" if rel == "." else rel


def matching_prefixes(
    rel: str, prefixes: Sequence[str]
) -> Tuple[str, ...]:
    """Every prefix in *prefixes* that *rel* sits under, in declared order.

    THE one definition of "under a declared surface" for this module
    (L-069-1). Before Set 129 S1 the same comparison was written out four
    times -- in ``path_is_test_surface``, in ``surface_digest``, in
    ``session_touched``, and about to be a fourth time in
    :func:`affected_suites` -- so a fix to one was a fix to one. Matching
    is anchored at a path boundary, so ``ai_router/tests_helper.py`` does
    not match the prefix ``ai_router/tests/``.

    **Both sides are normalised.** The changed path and the declared
    prefix go through the same :func:`_normalise_rel`, because
    normalising only one of them is a silent narrowing either way round:
    a consumer writing the ordinary relative spelling ``covers:
    ["./src/"]`` would match nothing while the declaration read as
    correct, exactly as a dotfile prefix used to.

    Returns the prefixes rather than a bool because the affected-suite
    answer must be **auditable**: a session is owed not just *that* it
    must run a suite but *which declared input* made it so.
    """
    rel = _normalise_rel(rel)
    if not rel:
        return ()
    out: List[str] = []
    for prefix in prefixes:
        if not prefix:
            continue
        p = _normalise_rel(prefix)
        if not p:
            # A repo-ROOT prefix -- the ordinary spellings are `./` and
            # `.`, and a whole-repo suite is a legitimate declaration for
            # a small consumer. Round-4 verification caught this: the
            # normaliser turned it into the empty string and the loop
            # then skipped it, so the suite that declared EVERYTHING
            # matched NOTHING and its gate was disarmed for every change.
            # The empty-original case above is different and still
            # skipped: `covers: [""]` declares nothing and the loader
            # rejects it outright.
            out.append(prefix)
            continue
        if rel == p.rstrip("/") or rel.startswith(
            p if p.endswith("/") else p + "/"
        ):
            out.append(prefix)
    return tuple(out)


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

    ``covers`` is the suite's **input set**: the complete allowlist of
    repo-relative path prefixes (posix separators) that can affect the
    suite's RESULT. Set 129 S1 strengthened this from "the paths the
    suite is about", and the difference has teeth. Product source, test
    source, fixtures, contracts, mocks, shared libraries, **lockfiles,
    build and test configuration, and checked-in toolchain
    configuration** all belong in it. Under the old reading a lockfile
    outside ``covers`` was merely out of scope; under this one it is a
    **declaration bug**, because a dependency bump can turn a suite red
    without touching a line the declaration names.

    What that does NOT license is the inverse claim. Unchanged declared
    inputs are **evidence that a rerun is likely redundant within a
    qualified execution environment; they do not prove identical
    outcomes for non-hermetic or flaky suites.** Scheduler interleaving,
    browser and VS Code runtime, dependency resolution, environment
    variables, filesystem timing, service state, network responses and
    random seed all sit outside any file digest, and ``covers`` is a path
    prefix list, not a dependency graph. Skipping a suite therefore
    remains a verification reduction and needs the operator attestation
    every verification reduction needs -- it is not "provably redundant
    work being removed".

    There is deliberately **no module field.** In a repo with a declared
    module tier the question "which suites does this session owe" is
    still answered by intersecting the change set with the declared input
    sets; a module axis answers nothing that adds, and can only SUBTRACT
    -- a session in module Y that genuinely touches module X's inputs
    would stop owing X's suite because of a label. Nothing checks that a
    module's declared roots match its real imports, so that subtraction
    would fail open (L-125-1). Modules group and assign ownership; the
    suite declares; the intersection decides (Set 129, ``verdict.md``
    §3-§4).

    ``expensive`` marks the suites the once-per-session-at-close rule
    governs; cheap suites are recordable but never gate-required. It is
    a statement about *whether the gate has an opinion*, not about the
    clock -- all three of this repo's layers carry it since Set 116 S3,
    and a consumer repo is free to declare a suite cheap.

    ``tests`` (Set 128 S2) is the subset of ``covers`` holding the
    suite's own test SOURCES -- the files that are not shipped. It exists
    for A4.1: a post-suite fix confined to these paths changes nothing a
    verifier reviewed as product, so it owes no re-verification, while
    anything else does. Declaring it here rather than in a second module
    keeps ONE definition of a suite's surfaces (L-069-1); the ordering
    policy asks a different question of the same map.

    It is deliberately an ALLOWLIST and deliberately narrow. A path is a
    test surface only if it matches a declared ``tests`` prefix;
    everything else -- including anything the list forgets -- classifies
    as shipped and owes the review. A denylist here would fail OPEN
    (L-125-1), and the classification is genuinely open-ended: Set 111
    S2's close-backstop round 7 established that "what counts as a test
    asset" has no attributable criterion, which is why this is a
    declaration and not a heuristic. Note what is NOT declared:
    ``test-fixtures/`` and ``scripts/`` stage what Layer 3 asserts, so a
    change there is a change to what the rendering tests see, not a test
    fix.
    """

    name: str
    command: str
    covers: Tuple[str, ...]
    expensive: bool = False
    tests: Tuple[str, ...] = ()


#: The suite-declaration keys ``load_suites_checked`` recognises. An
#: allowlist, so an unrecognised key is an ERROR rather than a silent
#: default (Set 129 S1, round-4 verification).
SUITE_FIELDS = frozenset({"name", "command", "covers", "expensive", "tests"})


# Locked defaults for this repo's three layers. A consumer repo with no
# ``testing:`` block inherits these; one with a block replaces them wholesale.
#
# Set 129 S1 re-derived all three against the STRONGER definition of
# ``covers`` -- the complete allowlist of prefixes that can affect the
# suite's RESULT, not "the product paths the suite is about". The
# derivation was empirical, not editorial: a full run under an audit hook
# recorded every path the suite actually opened or enumerated, and the
# additions below are the ones that evidence named. Under the old reading
# a lockfile or a build config outside ``covers`` was simply out of
# scope; under the new one it is a DECLARATION BUG.
DEFAULT_SUITES: Tuple[SuiteSpec, ...] = (
    SuiteSpec(
        name="pytest",
        # Set 116 S1 made this the parallel default: 3.61x faster
        # (845.76s serial -> 234.55s with -n auto) with identical
        # results, measured at commit 9277e104.
        command=".venv/Scripts/python.exe -m pytest ai_router/tests -q -n auto",
        covers=(
            "ai_router/",
            # The suite's own runner configuration. `pytest.ini` sets the
            # `-n` handling, testpaths and filter rules, so it decides
            # what runs and how; `pyproject.toml` declares the
            # dependencies and console entry points that
            # `test_entry_points` and `test_packaging_hygiene` assert
            # against. Both are read on every run and neither was
            # declared.
            "pytest.ini",
            "pyproject.toml",
            # Checked-in toolchain configuration, and not merely by
            # analogy: `test_drift_guard` runs `drift_guard.run_all()`
            # over the REAL repo, which asserts every GitHub action is
            # SHA-pinned and that `.github/dependabot.yml` exists. An
            # unpinned action added here turns this suite red.
            ".github/",
            # Corpora the suite reads rather than stages. The cold-start
            # golden tree is compared byte-for-byte by
            # `test_cold_start_acceptance`; `scripts/` and the
            # failure-injection traces are enumerated and read.
            "test-fixtures/",
            "scripts/",
            "tests/",
            # The drift guard's two sides: it proves the bundled template
            # mirror still matches its source, and that the changelog
            # partition round-trips. A change to either side alone is
            # exactly the drift it exists to catch, and neither side was
            # declared -- so the session that CAUSED the drift owed no
            # run of the suite that detects it.
            "docs/templates/",
            "tools/dabbler-ai-orchestration/dist/templates/",
            "tools/dabbler-ai-orchestration/changelog.d/",
            # The suite polices the session-set corpus itself:
            # `test_step_status_drift` inventories every set's activity
            # log and asserts an exact count, `test_spec_config` parses
            # every real `spec.md`, and the drift guard refuses duplicate
            # set numbers. A session-set-only edit really can turn Layer 1
            # red.
            #
            # Declaring it is only possible because `surface_digest` now
            # excludes the ACTIVE set's own close-out bookkeeping
            # (`is_active_set_bookkeeping`); without that the suite stales
            # its own run at the moment `record_run` appends
            # `test-runs.jsonl`. Another set's files are ordinary changed
            # files and bind normally.
            "docs/session-sets/",
        ),
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
        tests=("ai_router/tests/",),
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
        covers=(
            "tools/dabbler-ai-orchestration/src/",
            # Set 129 S1, read straight off the command: `test:unit` is
            # `mocha --require ts-node/register ...`, so `package.json`
            # carries the invocation and the dependency ranges,
            # `package-lock.json` carries the versions actually
            # installed, and `tsconfig.json` is what ts-node compiles
            # through. A lockfile bump can turn this suite red without
            # touching a line of `src/`, which is the archetype the
            # stronger definition of `covers` exists to catch.
            "tools/dabbler-ai-orchestration/package.json",
            "tools/dabbler-ai-orchestration/package-lock.json",
            "tools/dabbler-ai-orchestration/tsconfig.json",
            # Round-1 verification: the Layer 2 specs assert against real
            # assets outside `src/`, one named test each.
            # `statusIconAssets` reads `media/`; `uatMatrixFixtures` reads
            # the extension's own `test-fixtures/uat-matrix`;
            # `consumerBootstrap` asserts the REAL packaged
            # `dist/templates/` bundle has all fifteen files and compares
            # it against the repo-root `docs/templates/` source, which
            # `sampleProjectCore` also reads; `coldStartSnapshot`
            # compares the repo-root `test-fixtures/cold-start` golden
            # tree. Every one of these could be broken by a session that,
            # before this, owed Layer 2 nothing.
            "tools/dabbler-ai-orchestration/media/",
            "tools/dabbler-ai-orchestration/test-fixtures/",
            "tools/dabbler-ai-orchestration/dist/templates/",
            # `walkStager.test.ts` does not mock these -- it `require`s
            # `scripts/vscode-launch.js`, `scripts/stage-walk.js` and
            # `scripts/make-uat-workspace.js` directly and asserts on
            # their real behaviour.
            "tools/dabbler-ai-orchestration/scripts/",
            "docs/templates/",
            "test-fixtures/",
            # `moduleCliFixture` / `moduleAuthoring` / `sampleProjectSmoke`
            # shell out to the workspace venv and drive the REAL
            # `ai_router` module CLIs, so Layer 2 genuinely depends on the
            # router. This is the cross-language edge the old declaration
            # missed entirely: a Python-only change could turn the
            # TypeScript suite red while owing it nothing.
            "ai_router/",
        ),
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
        tests=("tools/dabbler-ai-orchestration/src/test/",),
    ),
    SuiteSpec(
        name="playwright",
        command="npm run test:playwright",
        # The policy's non-negotiable Layer 3 trigger list, spelled out.
        # The authoring guide names FOUR surfaces that must pay their own
        # full Layer 3 -- the Explorer rendering surface, a state-file
        # writer, the extension manifest, and the fixture harness -- but
        # this map originally carried only the first and third. A session
        # that changed a sanctioned writer or the harness that stages the
        # fixtures could therefore close with Playwright reported "not
        # required", which is precisely the rendering-regression class
        # Layer 2 and the static gates cannot see.
        covers=(
            "tools/dabbler-ai-orchestration/src/",
            "tools/dabbler-ai-orchestration/package.json",
            "tools/dabbler-ai-orchestration/media/",
            # the fixture/walk harness that stages what Layer 3 looks at
            "tools/dabbler-ai-orchestration/scripts/",
            "tools/dabbler-ai-orchestration/test-fixtures/",
            # Set 129 S1 (round-2 remediation). This entry used to be
            # three `ai_router` files -- session_state.py,
            # start_session.py, close_session.py -- listed one by one,
            # with a comment explaining that arming a 13-minute suite for
            # every router change would make the gate something sessions
            # route around instead of satisfy.
            #
            # The reasoning was sound and the premise was FALSE, and
            # cross-provider verification is what caught it. The
            # narrowing assumed Layer 3 exercised the PUBLISHED router
            # wheel, so local router edits could not reach it. They can:
            # `vsix-first-run-walkthrough.spec.ts` sets
            # `DABBLER_ROUTER_INSTALL_SPEC` to the repo root, so the
            # cold-start walk `pip install -e`s THIS tree and drives the
            # router it just built. Set 122 S2 is the incident -- the
            # walk went structurally red the moment the extension
            # depended on router code that was not yet released.
            # `pyproject.toml` is on the same chain: it is what that
            # editable install resolves.
            #
            # So the whole package is declared, because that is what is
            # true. The cost is real and is not denied: a router-only
            # session now owes Layer 3. The sanctioned relief is to make
            # the suite cheaper rather than the declaration smaller --
            # smoke/full E2E tiering is deferred in `verdict.md` §7
            # behind exactly this trigger, "two independently executable
            # named commands with measured runtimes", represented as
            # separate SuiteSpec entries. A declaration narrower than the
            # truth is not a cost saving; it is a gate that cannot fire.
            "ai_router/",
            "pyproject.toml",
            # Set 129 S1: `test:playwright` is `npm run compile && npx tsc
            # --outDir out && npx playwright test`, so the BUILD is part
            # of the run. `esbuild.js` is the compile step itself,
            # `tsconfig.json` governs the `tsc` step, `playwright.config.ts`
            # decides which specs run at all (its `testDir` is what makes
            # the src/test/playwright entry above reachable), and
            # `package-lock.json` pins the browser/runner versions. A
            # config that silently narrows `testDir` would empty this
            # suite while every recorded run still reported green.
            "tools/dabbler-ai-orchestration/esbuild.js",
            "tools/dabbler-ai-orchestration/tsconfig.json",
            "tools/dabbler-ai-orchestration/playwright.config.ts",
            "tools/dabbler-ai-orchestration/package-lock.json",
            # Round-1 verification: the first-run walkthrough spec drives
            # the real scaffold and installer paths, which read the
            # BUNDLED copies rather than the repo sources -- `esbuild.js`
            # is what copies `docs/templates/` into `dist/templates/`, so
            # all three sit on the same chain, and `resources/` carries
            # the cost-estimate data the views render. A stale or
            # mispackaged bundle is invisible to `src/` and fatal to the
            # walkthrough.
            "tools/dabbler-ai-orchestration/dist/templates/",
            "tools/dabbler-ai-orchestration/resources/",
            "docs/templates/",
        ),
        expensive=True,
        # playwright.config.ts -> testDir: ./src/test/playwright, which
        # sits under the mocha entry above; ai_router/tests/e2e/ is the
        # Python-side half. test-fixtures/ and scripts/ are deliberately
        # absent -- they stage what these specs assert.
        tests=(
            "tools/dabbler-ai-orchestration/src/test/",
            "ai_router/tests/e2e/",
        ),
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
    #: Set 129 S1: the declared inputs this session changed that made the
    #: suite required, so the gate's demand can be audited rather than
    #: merely obeyed. Empty for a suite nothing touched.
    changed_inputs: Tuple[str, ...] = ()


def _repo_root_for(path: str) -> Optional[str]:
    cur = Path(path).resolve()
    for candidate in (cur, *cur.parents):
        if (candidate / ".git").exists():
            return str(candidate)
    return None


@dataclass(frozen=True)
class SuiteLoadResult:
    """The suite declaration, plus what was WRONG with it (Set 129 S1).

    ``load_suites`` is deliberately tolerant -- a config typo must not
    crash a session boundary -- and that tolerance was silently load-
    bearing in the wrong place. A malformed entry was dropped without a
    word, so a ``testing.suites`` block whose entries were all typos
    yielded an empty tuple, and ``check_test_run_fresh`` read that as
    *"no expensive suites declared"* and **passed**. One misspelled key
    in a consumer's config therefore disarmed the close gate that
    governs every expensive suite in the repo, and nothing anywhere said
    so. Found by review, not by use.

    Tolerance is right for a **reader** and wrong for the input to a
    **gate**, so the two are separated rather than traded off: the reader
    still returns whatever it could parse, and it now also returns
    ``errors``, which a gate is obliged to treat as a block. If the
    information a skip needs is missing or unverifiable, do not skip.

    ``errors`` being empty is not the same as ``suites`` being non-empty:
    an explicit ``suites: []`` parses cleanly and yields no suites, which
    stays the deliberate operator disarm it has always been.
    """

    suites: Tuple[SuiteSpec, ...]
    errors: Tuple[str, ...] = ()

    @property
    def ok(self) -> bool:
        return not self.errors


def load_suites_checked(config: Optional[dict] = None) -> SuiteLoadResult:
    """Build the suite list from ``testing.suites``, keeping the errors.

    Same parsing as :func:`load_suites`, except every entry it declines
    to use is reported instead of vanishing. A ``suites:`` key that is
    present but not a list is an error too: it is a config mistake, not
    a declaration, and returning the defaults for it would silently
    substitute a different answer than the operator wrote.
    """
    if not isinstance(config, dict):
        return SuiteLoadResult(DEFAULT_SUITES)
    block = config.get("testing")
    if not isinstance(block, dict) or "suites" not in block:
        return SuiteLoadResult(DEFAULT_SUITES)
    raw = block.get("suites")
    if not isinstance(raw, list):
        return SuiteLoadResult(
            DEFAULT_SUITES,
            (
                f"testing.suites must be a list of suite mappings "
                f"(got {type(raw).__name__}); falling back to the built-in "
                f"defaults, which is almost certainly not what the config "
                f"intends",
            ),
        )
    out: List[SuiteSpec] = []
    errors: List[str] = []
    for index, item in enumerate(raw):
        where = f"testing.suites[{index}]"
        if not isinstance(item, dict):
            errors.append(
                f"{where} is not a mapping (got {type(item).__name__})"
            )
            continue
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            errors.append(f"{where} has no usable 'name' (got {name!r})")
            continue
        label = f"{where} ({name.strip()!r})"

        # Every field is checked, not just the ones whose absence would
        # crash. Round-1 and round-2 verification both landed here: a
        # loader that filters bad ITEMS out of an otherwise-usable list,
        # or ignores a bad VALUE on an otherwise-usable entry, narrows
        # the declaration silently -- and a silently narrowed input set
        # is the same fail-open defect as a silently dropped suite, one
        # level down. `expensive: "true"` is the sharpest: a quoted
        # boolean is not `True`, so the suite loads as CHEAP and the
        # close gate stops having an opinion about it at all.
        entry_errors: List[str] = []

        # ...and an unknown KEY is the same defect once more, which
        # round-4 verification caught: `expensvie: true` is not a value
        # error, it is a key that nothing reads, so the suite loads cheap
        # and the gate goes quiet. A hand-authored YAML key typo is the
        # exact scenario this whole session exists to fail closed on, so
        # the recognised set is an ALLOWLIST -- a denylist of known-bad
        # spellings could never contain the next one (L-125-1).
        unknown = sorted(set(item) - SUITE_FIELDS)
        if unknown:
            entry_errors.append(
                f"{label} has unrecognised field(s) "
                f"{', '.join(repr(k) for k in unknown)}; nothing reads them, "
                f"so a misspelled key silently keeps its default -- a "
                f"misspelled 'expensive' loads the suite as CHEAP and "
                f"removes it from the close gate (recognised: "
                f"{', '.join(sorted(SUITE_FIELDS))})"
            )

        command = item.get("command")
        if command is not None and not isinstance(command, str):
            entry_errors.append(
                f"{label} has a non-string 'command' "
                f"(got {type(command).__name__})"
            )

        if "expensive" in item and not isinstance(item.get("expensive"), bool):
            entry_errors.append(
                f"{label} has a non-boolean 'expensive' "
                f"({item.get('expensive')!r}); a quoted or numeric value "
                f"loads the suite as CHEAP, which silently removes it from "
                f"the close gate"
            )

        covers_raw = item.get("covers")
        if not isinstance(covers_raw, list):
            errors.append(
                f"{label} has no 'covers' list (got "
                f"{type(covers_raw).__name__}); a suite that declares no "
                f"input set can never be found affected"
            )
            continue
        covers = tuple(
            _normalise_rel(c) or "./"
            for c in covers_raw
            if isinstance(c, str) and c.strip()
        )
        for position, c in enumerate(covers_raw):
            if not isinstance(c, str) or not c.strip():
                entry_errors.append(
                    f"{label} covers[{position}] is not a usable path "
                    f"prefix (got {c!r}); the surrounding entries would "
                    f"still load, so this narrows the declared input set "
                    f"without removing the suite"
                )
        if not covers:
            errors.append(
                f"{label} declares an empty 'covers'; a suite that declares "
                f"no input set can never be found affected"
            )
            continue

        tests_raw = item.get("tests")
        tests: Tuple[str, ...] = ()
        if tests_raw is not None:
            if not isinstance(tests_raw, list):
                entry_errors.append(
                    f"{label} has a non-list 'tests' "
                    f"(got {type(tests_raw).__name__})"
                )
            else:
                for position, t in enumerate(tests_raw):
                    if not isinstance(t, str) or not t.strip():
                        entry_errors.append(
                            f"{label} tests[{position}] is not a usable path "
                            f"prefix (got {t!r}); an unrecognised test "
                            f"surface classifies as SHIPPED, so this widens "
                            f"what a post-suite fix owes"
                        )
                tests = tuple(
                    _normalise_rel(t)
                    for t in tests_raw
                    if isinstance(t, str) and t.strip()
                )

        if entry_errors:
            errors.extend(entry_errors)
            continue

        out.append(
            SuiteSpec(
                name=name.strip(),
                command=command if isinstance(command, str) else "",
                covers=covers,
                expensive=item.get("expensive") is True,
                tests=tests,
            )
        )
    return SuiteLoadResult(tuple(out), tuple(errors))


def load_suites(config: Optional[dict] = None) -> Tuple[SuiteSpec, ...]:
    """Build the suite list from ``testing.suites``, else the defaults.

    Tolerant by design (a config typo must not crash a session boundary):
    an entry that is not a mapping, or that lacks a usable ``name`` or a
    non-empty ``covers`` list, is skipped. A ``suites:`` key present but
    yielding zero usable entries returns an EMPTY tuple rather than the
    defaults -- an operator who deliberately declares no suites gets no
    suites, and silently resurrecting the defaults would re-arm a gate
    they just turned off.

    **This projection DISCARDS the errors.** Anything deciding whether a
    close may proceed must call :func:`load_suites_checked` instead and
    block on ``errors``; dropped entries are indistinguishable from an
    empty declaration from here, which is exactly how a typo used to
    disarm ``check_test_run_fresh``.
    """
    return load_suites_checked(config).suites


def test_surface_prefixes(suites: Sequence[SuiteSpec]) -> Tuple[str, ...]:
    """Every declared test-source prefix across *suites*, deduped+sorted.

    The union is the right shape even though ``tests`` is declared
    per-suite: A4 asks "is this path a test?", not "whose test is it?",
    and a path under any suite's test sources is a test source.

    A suite that declares none contributes none, so a consumer repo that
    never declares ``tests`` gets an empty union -- under which
    :func:`classify_changed_paths` calls EVERYTHING shipped and A4.1
    never fires. That is the correct default for an undeclared repo:
    the reduction is opt-in by declaration, and silence buys nothing.
    """
    out = {p for suite in suites for p in suite.tests if p}
    return tuple(sorted(out))


def path_is_test_surface(rel: str, prefixes: Sequence[str]) -> bool:
    """True when *rel* sits under one of the declared test *prefixes*.

    A thin boolean over :func:`matching_prefixes` -- one notion of "under
    a declared surface" for the whole module (L-069-1).
    """
    return bool(matching_prefixes(rel, prefixes))


def classify_changed_paths(
    paths: Sequence[str], suites: Sequence[SuiteSpec]
) -> Tuple[Tuple[str, ...], Tuple[str, ...]]:
    """Split *paths* into ``(test_paths, shipped_paths)`` for A4.

    The allowlist direction is the whole point: a path counts as a test
    only when it matches a declared prefix, so an unrecognised,
    misspelled or newly-invented location lands in ``shipped_paths`` and
    owes the delta review. Nothing here decides what that OBLIGATION is
    -- see ``post_round_delta`` -- this is only the classification.
    """
    prefixes = test_surface_prefixes(suites)
    tests: List[str] = []
    shipped: List[str] = []
    for rel in paths:
        (tests if path_is_test_surface(rel, prefixes) else shipped).append(
            _posix(rel)
        )
    return tuple(sorted(tests)), tuple(sorted(shipped))


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


def _set_rel(repo_root: str, session_set_dir: Optional[str]) -> Optional[str]:
    """The active session-set directory, relative to *repo_root*."""
    if not session_set_dir:
        return None
    try:
        rel = os.path.relpath(
            os.path.abspath(session_set_dir), os.path.abspath(repo_root)
        )
    except ValueError:  # different drives on Windows
        return None
    rel = _posix(rel)
    return None if rel.startswith("..") else rel.rstrip("/")


def is_active_set_bookkeeping(rel: str, set_rel: Optional[str]) -> bool:
    """True when *rel* is the ACTIVE set's own close-out bookkeeping.

    Set 129 S1, round-3 remediation. Declaring ``docs/session-sets/`` as
    a pytest input is correct -- the suite really does inventory every
    set's activity log and parse every ``spec.md`` -- and declaring it
    naively **deadlocks the gate**: :func:`record_run` digests the
    covered surfaces and then appends ``test-runs.jsonl`` into the set
    directory, so the run stales itself the instant it is recorded, with
    nothing else touched.

    The exclusion is deliberately narrow in both dimensions. It applies
    only to the **active** set (another set's artifacts are ordinary
    changed files, and a set-number collision or a resurrected status
    token there is exactly what the suite is meant to catch), and only to
    the **basenames the sanctioned writers own**, reused from
    ``verification_stamp.WORK_DIFF_SET_BOOKKEEPING`` rather than
    re-listed, so the two cannot drift (L-069-1). ``spec.md`` is not in
    that list, so editing the active set's own spec still stales its run.

    What this concedes, stated plainly: a change to the active set's own
    ``activity-log.json`` can in principle fail
    ``test_step_status_drift``, and is exempt here. It has to be --
    ``log_step`` writes that file continuously while the session runs, so
    binding it would make the gate unsatisfiable rather than strict. It
    is exempt from the verification stamp for the same reason.
    """
    if not set_rel:
        return False
    prefix = set_rel + "/"
    if not rel.startswith(prefix):
        return False
    name = rel[len(prefix):]
    if "/" in name:
        return False
    return any(fnmatch.fnmatch(name, pat) for pat in WORK_DIFF_SET_BOOKKEEPING)


def surface_digest(
    repo_root: str,
    covers: Sequence[str],
    *,
    session_set_dir: Optional[str] = None,
) -> Optional[str]:
    """SHA-256 over the current content of every file under *covers*.

    One ``path\\0blob-hash`` line per tracked-or-untracked-not-ignored file
    whose repo-relative path starts with one of the *covers* prefixes,
    sorted for determinism. Ignored files (``node_modules``, build output)
    never enter, because they are not in ``git ls-files``.

    *session_set_dir*, when given, excludes that set's own close-out
    bookkeeping from the digest (:func:`is_active_set_bookkeeping`), which
    is what lets a suite declare ``docs/session-sets/`` without staling
    its own run at the moment it records it.

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

    set_rel = _set_rel(repo_root, session_set_dir)

    def _covered(rel: str) -> bool:
        return bool(matching_prefixes(rel, prefixes))

    lines: List[str] = []
    for rel in sorted(set(tracked) | set(untracked)):
        if not _covered(rel):
            continue
        if is_active_set_bookkeeping(rel, set_rel):
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
    digest = surface_digest(root, suite.covers, session_set_dir=session_set_dir)
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
    disposition matches a posix-style ``covers`` prefix. The boolean
    projection of :func:`affected_suites`; both go through
    :func:`matching_prefixes`.
    """
    _ = repo_root
    for raw in files_changed:
        if not isinstance(raw, str) or not raw.strip():
            continue
        if matching_prefixes(raw, covers):
            return True
    return False


@dataclass(frozen=True)
class SuiteMatch:
    """One suite a change set affects, and the inputs that made it so.

    Set 129 S1. ``changed_inputs`` are the paths from the change set that
    landed inside the suite's declared input set; ``matched_prefixes``
    are the ``covers`` entries they matched. Both are reported because
    "which suites does this session owe" must be **auditable** rather
    than a bare boolean: a session told only *that* it owes a 14-minute
    suite cannot check the claim, and a wrong declaration is invisible
    from a yes/no answer.
    """

    suite: str
    changed_inputs: Tuple[str, ...]
    matched_prefixes: Tuple[str, ...]
    expensive: bool = False


def affected_suites(
    files_changed: Sequence[str],
    suites: Sequence[SuiteSpec],
    *,
    set_rel: Optional[str] = None,
) -> Tuple[SuiteMatch, ...]:
    """Which suites *files_changed* affects, and which inputs matched.

    The answer A5 resolves to (Set 129, ``verdict.md`` §4): **the suite
    declares its inputs, the intersection decides the obligation, and
    modules are grouping metadata**. There is deliberately no module
    axis. A module label could only ever SUBTRACT from this intersection
    -- a session in module Y that genuinely touches module X's inputs
    would stop owing X's suite because of a label -- and nothing checks
    that a module's declared roots match its real imports, so routing
    test selection through one would be a verification reduction wearing
    an organizational costume (L-125-1).

    Reports **every** matched suite, cheap ones included: this answers
    "what does this change affect", which is not the same question as
    "what does the close gate require". :func:`evaluate_freshness` owns
    the ``expensive`` policy and consumes this rather than re-deriving
    the intersection itself (L-069-1).

    Order follows the declaration, and a suite matched by nothing is
    absent rather than present-and-empty, so ``if affected_suites(...)``
    reads correctly.

    *set_rel* names the active session-set directory relative to the repo
    root. When given, that set's own close-out bookkeeping does not count
    as a changed input: those files are excluded from the freshness
    digest too, so counting them here would demand a suite that the very
    same files then cannot stale. Another set's artifacts are ordinary
    changed files and count normally.
    """
    out: List[SuiteMatch] = []
    for suite in suites:
        inputs: List[str] = []
        prefixes: List[str] = []
        for raw in files_changed:
            if not isinstance(raw, str) or not raw.strip():
                continue
            rel = _normalise_rel(raw)
            if is_active_set_bookkeeping(rel, set_rel):
                continue
            hits = matching_prefixes(raw, suite.covers)
            if not hits:
                continue
            inputs.append(rel)
            for p in hits:
                if p not in prefixes:
                    prefixes.append(p)
        if not inputs:
            continue
        out.append(
            SuiteMatch(
                suite=suite.name,
                changed_inputs=tuple(sorted(set(inputs))),
                matched_prefixes=tuple(prefixes),
                expensive=suite.expensive,
            )
        )
    return tuple(out)


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

    The intersection is computed ONCE by :func:`affected_suites` and
    consumed here (L-069-1); this function owns only the ``expensive``
    policy and the freshness judgement.
    """
    verdicts: List[FreshnessVerdict] = []
    root = repo_root or _repo_root_for(session_set_dir)
    records = read_records(session_set_dir)
    set_rel = _set_rel(root, session_set_dir) if root else None
    affected = {
        m.suite: m
        for m in affected_suites(files_changed, suites, set_rel=set_rel)
    }

    for suite in suites:
        if not suite.expensive:
            continue
        match = affected.get(suite.name)
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
                    changed_inputs=match.changed_inputs if match else (),
                )
            )
            continue
        if match is None:
            verdicts.append(
                FreshnessVerdict(
                    suite=suite.name,
                    required=False,
                    passed=True,
                    reason="session touched none of this suite's surfaces",
                )
            )
            continue
        inputs = match.changed_inputs

        current = surface_digest(
            root, suite.covers, session_set_dir=session_set_dir
        )
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
                    changed_inputs=inputs,
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
                    changed_inputs=inputs,
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
                    changed_inputs=inputs,
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
                    changed_inputs=inputs,
                )
            )
            continue

        verdicts.append(
            FreshnessVerdict(
                suite=suite.name,
                required=True,
                passed=True,
                reason=f"fresh, green, recorded {latest.recorded_at}",
                changed_inputs=inputs,
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

    aff = sub.add_parser(
        "affected",
        help="Report which suites a change set affects, and which inputs matched.",
    )
    aff.add_argument("--session-set-dir", required=True)
    aff.add_argument(
        "--files-changed",
        nargs="*",
        default=None,
        help=(
            "Paths this session changed. Defaults to the disposition's "
            "files_changed."
        ),
    )
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
    loaded = load_suites_checked(_load_router_config())
    suites = loaded.suites
    for err in loaded.errors:
        print(f"run_of_record: suite declaration error: {err}", file=sys.stderr)

    if args.cmd == "suites":
        for s in suites:
            tag = "expensive" if s.expensive else "cheap"
            print(f"{s.name:<12} [{tag}]  covers: {', '.join(s.covers)}")
            if s.command:
                print(f"{'':<12}  command: {s.command}")
        return 1 if loaded.errors else 0

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

    if args.cmd == "affected":
        root = _repo_root_for(args.session_set_dir)
        set_rel = _set_rel(root, args.session_set_dir) if root else None
        matches = affected_suites(files_changed, suites, set_rel=set_rel)
        if not matches:
            print(
                "No declared suite's input set intersects this change "
                f"({len(files_changed)} path(s))."
            )
            return 1 if loaded.errors else 0
        for m in matches:
            tag = "expensive" if m.expensive else "cheap"
            print(f"{m.suite} [{tag}]")
            print(f"  matched covers: {', '.join(m.matched_prefixes)}")
            for rel in m.changed_inputs:
                print(f"  changed input: {rel}")
        return 1 if loaded.errors else 0

    verdicts = evaluate_freshness(
        args.session_set_dir, files_changed, suites
    )
    if loaded.errors:
        print(
            "run_of_record: refusing to report freshness against a "
            "malformed suite declaration",
            file=sys.stderr,
        )
        return 1
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
        if v.changed_inputs:
            print(f"     changed inputs: {', '.join(v.changed_inputs)}")
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
    "SuiteMatch",
    "SuiteLoadResult",
    "TestRunRecord",
    "FreshnessVerdict",
    "load_suites",
    "load_suites_checked",
    "surface_digest",
    "is_active_set_bookkeeping",
    "matching_prefixes",
    "test_surface_prefixes",
    "path_is_test_surface",
    "classify_changed_paths",
    "read_records",
    "record_run",
    "session_touched",
    "affected_suites",
    "evaluate_freshness",
    "main",
    "run",
]
