# Change log — Set 129: suite-owned input sets

**Set:** `129-suite-owned-input-sets` (2 sessions, both VERIFIED)
**Source of record:** [`docs/proposals/2026-08-12-multi-module-retesting/verdict.md`](../../proposals/2026-08-12-multi-module-retesting/verdict.md)
— an operator-supplied proposal, two independent routed reviews
(`gpt-5.6-sol`, `gemini-3.1-pro`), and the verdict that adopts one
mechanism, rejects eight claims outright, and defers six behind named
triggers.
**Closes:** A5 in
[`docs/planning/session-step-skeleton-and-verification-cost.md`](../../planning/session-step-skeleton-and-verification-cost.md)
— the last open item in that note. It carries no open items now.

---

## The question, and why the answer was small

A5 asked whether, in a repo with a declared module tier
(`docs/modules.yaml`), a session's test obligation should resolve to *its
module's* surfaces rather than to a repo-global path list. Set 128
declared it out of scope and left it with an owner rather than an answer.

The answer is **no**, and the reasoning is what made the set two sessions
instead of three:

1. **A suite that declares its complete input set has already answered
   the question.** "Which suites does this session owe" is an
   intersection. A module axis answers nothing the input set does not.
2. **A module axis can only SUBTRACT.** A session in module Y that
   genuinely touches module X's inputs would stop owing X's suite because
   of a *label* — a verification reduction wearing an organizational
   costume, failing open, which is the direction this repo refuses
   (L-125-1).
3. **The label is not enforced.** No module-manifest reader in
   `run_of_record.py`, no dependency graph, no check that a module's
   declared `codeRoots` match its real imports —
   `module-organized-projects-recommendation.md` §6.4 says so itself.

So A5 resolves to: **the suite declares; the intersection decides; the
module groups.**

## The live defect the set was worth a session for

Found by review, not by use.

`load_suites()` was deliberately tolerant: a malformed entry was dropped
in silence, and a `suites:` key yielding zero usable entries returned an
empty tuple. `check_test_run_fresh()` then read *"no expensive suites"*
and **passed**. One typo in a consumer's `testing.suites` block disarmed
the close gate governing every expensive suite in the repo, and nothing
said so.

Tolerance is right for a *reader*. It is wrong for the input to a
*gate*: if the information a skip needs is missing or unverifiable, do
not skip.

## Session 1 — The suite declares its inputs

**`covers` is now the suite's input set** — the complete allowlist of
prefixes that can affect the suite's **result**: product source, test
source, fixtures, contracts, mocks, shared libraries, lockfiles, build
and test configuration, checked-in toolchain configuration. Under the old
reading ("the paths a suite is about") a lockfile outside `covers` was
merely out of scope; under this one it is a **declaration bug**.

**The re-derivation was empirical, not editorial.** A full pytest run
under a `sys.addaudithook` tracer recorded 1,655 distinct repo paths the
suite actually opens or enumerates, and every addition is one the trace
named:

| suite | gained |
| :--- | :--- |
| pytest | `pytest.ini`, `pyproject.toml`, `.github/`, `test-fixtures/`, `scripts/`, `tests/`, `docs/templates/`, `tools/…/dist/templates/`, `tools/…/changelog.d/`, `docs/session-sets/` |
| mocha | `package.json`, `package-lock.json`, `tsconfig.json`, and the real assets its specs read outside `src/` |
| playwright | `esbuild.js`, `tsconfig.json`, `playwright.config.ts`, `package-lock.json`, and `ai_router/` |

Two findings that are *findings* rather than silences: `MANIFEST.in`
looked like an input and the trace never touched it, so it stays out; and
`docs/planning/` is deliberately **undeclared** and says why — the suite
reads it, but `cite_lessons` rewrites lesson trailers there *in the final
commit*, after the run of record, so declaring it would make every
session that cites a lesson unclosable.

Declaring `docs/session-sets/` was only possible because `surface_digest`
learned to exclude the **active** set's own close-out bookkeeping
(`is_active_set_bookkeeping`, reusing
`verification_stamp.WORK_DIFF_SET_BOOKKEEPING` rather than re-listing
it). Without that, `record_run` stales its own run at the instant it
appends `test-runs.jsonl` — demonstrated, not assumed.

**`affected_suites(files_changed, suites)`** returns which suites a
change set affects **and which inputs matched**, so the obligation is
auditable instead of a boolean. `evaluate_freshness()` consumes it rather
than re-deriving the intersection per suite, so one definition serves the
report and the gate (L-069-1). A new `run_of_record affected` subcommand
exposes it.

**Suite loading fails closed.** `load_suites_checked()` returns a
`SuiteLoadResult` carrying every unusable entry, every unusable value and
every unrecognised **key** — an allowlist (`SUITE_FIELDS`), because a
denylist could never contain the next typo — and
`check_test_run_fresh()` blocks on any of them. An explicit `suites: []`
is untouched: that is the deliberate operator disarm, a declaration
rather than a typo.

**Four coupled fail-open bugs surfaced from unifying four copies of
prefix matching into `matching_prefixes()`:**

| bug | effect |
| :--- | :--- |
| `session_touched` normalised with `lstrip('./')` — a **character-set** strip | ate the leading dot of every dotfile, so `.github/` and `.gitignore` declarations matched nothing |
| prefixes normalised on one side of the comparison only | `covers: ["./src/"]`, the ordinary relative spelling, matched nothing |
| a repo-root `covers: ["./"]` normalised to empty | matched nothing, disarming a whole-repo suite for every change |
| an unrecognised key (`expensvie: true`) | silently kept `expensive`'s default and loaded the suite as cheap |

Every one of them reads as correct code and fails open.

**Ten falsifiers, on the declared irony budget, weighted to the
fail-closed direction** (L-112-1). FIRES: a shared input fans out to
several suites and names what matched; a build-config input changed after
a run stales it; six plausible typo shapes are reported instead of
dropped; a non-list `suites:` no longer silently becomes `DEFAULT_SUITES`;
the close gate blocks on a malformed declaration; an empty declaration
cannot pass as "nothing owed". DOES NOT FIRE: an input under no declared
input set owes nothing; an explicit `suites: []` stays the operator
disarm; `affected_suites` is identical with and without a
`docs/modules.yaml` assigning the path to a different module — A5,
asserted structurally. STRUCTURAL: `changed_inputs` equals an
intersection recomputed by ancestor-set membership rather than
`startswith`, with **both** the change set and the suite corpus asserted
non-empty.

### What the routed verification actually bought

Five rounds, verifier `gpt-5.5` (openai) on every one. Nine Major
findings, all accepted, none disputed, all fixed. Round 5 needed the
operator's `--operator-authorized-round` attestation because cycles 1–2
were spent settling *earlier* rounds' fixes, leaving round 4's two
findings fixed but unreviewed.

More than a check. The re-derivation was empirical for Layer 1 but
derived Layers 2 and 3 from their **commands**, which name the build
inputs and not what the specs read at runtime. The verifier found that
gap, then found the harder thing underneath it: a narrowing the session
had written down as a *deliberate decision*, with sound-sounding
reasoning, resting on a false premise. Layer 3 keeps three `ai_router`
writers listed file-by-file, the argument went, because arming a
13-minute browser suite for every router edit would make the gate
something sessions route around instead of satisfy. True as far as it
went — and Layer 3 does not exercise the *published* router.
`vsix-first-run-walkthrough.spec.ts` points `DABBLER_ROUTER_INSTALL_SPEC`
at the repo root and `pip install -e`s this tree.

Cost is a reason to make a suite cheaper. It is never a reason to declare
an input set smaller than it is: a declaration narrower than the truth is
not a saving, it is a gate that cannot fire. Smoke/full E2E tiering is
the sanctioned relief, deferred behind its trigger. **A same-author
review does not catch its own premise.**

## Session 2 — A5 answered, and the apparatus refused

**A5 is written into the authoring guide beside A1–A4**, where an author
already looks; the section is now *A1–A5*. Three parts — the suite
declares its inputs (and derives them from evidence, not from the suite's
command), the intersection decides the obligation, modules group and
assign ownership — plus the fail-closed loading rule and the explicit
statement that **A5 authorizes no new skip**.

**The corrected safety claim is carried verbatim** (`verdict.md` §2a):

> Unchanged declared inputs provide evidence that a rerun is likely
> redundant within a qualified execution environment; they do not prove
> identical outcomes for non-hermetic or flaky suites.

The stronger claim — that skipping an unaffected suite is *"provably
redundant work being removed"* rather than a risk trade-off — is
**refused**, and the guide says plainly why the refusal is load-bearing
rather than pedantic: under the stronger framing a future orchestrator
could skip a suite **without** an operator-attested verification
reduction, on the grounds that nothing was being reduced. That reasoning
must not be available.

**The refusals are a deliverable.** Eight rejections with their reasons
and six deferrals with their **trigger conditions** now sit in the
authoring guide, immediately after A5 — where an author proposing
contract locks or module-scoped test selection will meet them, rather
than in a proposal folder nobody re-reads. A rejection nobody wrote down
gets re-proposed by the next reader of a persuasive document.

**Consistency, propagated in one pass** (L-064-8): the guide's *"read
`covers` literally"* paragraph now names the input-set definition and the
suite-key allowlist; the constitution's Step 8 sentence says the required
portion is an **intersection** and names the command that reports it; and
`module-organized-projects-recommendation.md` §6.4 now carries the rule
that the scope check, when it is built, may never be read as an input to
suite selection — the one place a future author would most plausibly
reintroduce the module axis.

### The set's own changelog fragment disarmed a falsifier

The session's only code change was not planned, and the targeted run
found it rather than the verification round.

`test_drift_guard.py::test_changelog_round_trip_flags_a_planted_reorder`
plants a fragment reorder and asserts the CI gate fires. It selected
`load_fragments(...)[0]` and `[1]` — the two **newest** fragments — while
`changelog.check()` deliberately re-renders from the **baseline**
(pre-partition) fragment set alone. Reordering two post-partition
contributions is not a violation at all; it is the hand-slotting the
order gap exists for. So the falsifier only ever fired while at most
**one** post-baseline fragment sat above the frozen corpus. Writing this
set's own changelog fragment made it two, and the plant stopped firing —
a mandatory close-out artifact silently disarming a gate's proof.

The fix is test-only: select from the baseline corpus, and **assert that
corpus is non-empty** (L-112-1 — assert the input set, not merely the
verdict). The sibling falsifiers in `test_changelog_partition.py` already
select this way through a `baseline_fragments()` helper whose docstring
names this exact hazard; the drift-guard copy did not (L-069-1). The gate
itself was never wrong.

The generalisable shape: **a falsifier that selects its plant by recency
has a target that drifts with ordinary repo growth.** A gate proved by
planting must plant into the corpus the gate reads, and must say so in an
assertion rather than in a comment.

**Irony budget: 0 of 2.** A second test — pinning the deliberate contract
that a *post-baseline* reorder is legitimate — was considered and not
added. That contract is already stated in
`docs/partitioned-append-files.md` and in `changelog.check`'s docstring,
the strengthened falsifier now asserts its own corpus, and adding it
after the run of record would have staled all three suites (~20 minutes)
for a documentation session. Recorded as a decision, not an oversight.

## What did not change, deliberately

- **No `SuiteSpec.module`**, for the three reasons above.
- **No contract locks, mock pinning, or provider-side conformance
  cascades.** No consumer has that architecture, and pinning a mock to a
  contract *hash* buys provenance, not conformance (`verdict.md` §2b
  carries the worked failure).
- **No new skip authority.** The set makes an existing obligation
  explicit and auditable and adds a fail-closed path where one was
  missing. Nothing owed today became optional, which is why no operator
  attestation was owed and why `pathAwareCritique` was deliberately left
  at `none` — *a set that declares nothing pays nothing*.
- **No change to A4.2's scope.** It scopes to the diff regardless of
  module; `post_round_delta.classify_delta()` was already correct.
