# Design consult, round 8 — synthesis and decision: the developer's day, fewer reads, and a testing surface that stops at the module

**Decided 2026-09-06 by the orchestrator under the standing unattended-work
directive**, after `round8-brief.md` was answered by Sol (`gpt-5.6-sol`,
`round8-sol.md`) and Gemini (`gemini-3.1-pro-preview`, `round8-gemini.md`).
This amends `round7-synthesis.md` in five places, all Sol's, each checked
against the tree. The operator can overrule any of it.

## The operator's three objectives, and the verdicts

1. **Convenient for the developer.** Both advisors, walking the day
   command by command, pick the sparse-clone design over a plain checkout
   with instructions and over the encrypted-resource variant. The
   developer clones once, runs `dabbler module open persister`, and gets a
   dedicated VS Code window holding the module, the shared build files,
   every dependency's contract and package, and nothing else; tests run
   with `dotnet test` on one project; the land is one action; the pull
   request is plaintext. Sol's bet on the failure mode is the one to
   design against: if grants are slow or package stepping is unreliable,
   developers keep the full checkout open, run the engine there, and the
   wall is gone.
2. **Fewer unnecessary reads.** Both rank **designed abstractions with
   executable contract tests** first — they remove the *reason* to read a
   sibling — then absence (the sparse clone), then Claude Code's
   working-directory block and the instruction as cheap layers, with the
   **dynamic grant as the valve that makes absence tolerable**, not as a
   read-reducer in itself. The encrypted resource with an operator-held
   key is last on both lists: under one OS user, any key the framework can
   use the engine can invoke, and the custody that would fix that (a
   broker under another identity, a passphrase per grant, hardware, a
   service) is ceremony an ordinary .NET team will not accept. It stays a
   **hardened custody profile, designed only when a named customer needs
   source hidden from a machine rather than from a model** — and never
   with a one-time pad, which needs key material as large as every source
   version; authenticated encryption with an external key if ever.
3. **A testing surface that stops at the module.** Both say the run of
   record as it stands — every `expensive` suite, whole
   (`drive.ts`, `expensiveSuites()`) — "cannot satisfy the objective".
   The fix is one impact plan, shared by `dabbler affected` and the run of
   record, described below.

## What round 7 got wrong (Sol, verified)

- **"Generated contract per module" was too strong.** A generated surface
  proves shape, not behaviour. The contract is *designed* where the seam
  matters: an abstractions package (`.Abstractions` / Java `api`), a
  separate contract-test package, doc comments and a behavioural page.
  Generation stays as a marked fallback for modules that have none.
- **"Regenerate the package and contract at the land" is ordered wrong.**
  If generation follows the run of record, the tested bytes are not the
  landed bytes. The candidate package and contract are generated
  **before** the run of record, the package path sits under a suite's
  `covers` so the existing per-suite freshness digest sees it
  (`testEvidence.ts`, `enumerateSurface`), and the land commits exactly
  the tested bytes or refuses.
- **The focused checkout omitted the consumers' contract assets.**
  Compiling A needs its dependencies' contracts; proving A's new package
  still satisfies its consumers needs each consumer's *consumer-contract
  suite*, runnable without the consumer's implementation source.
- **Fast-forward-and-push assumed a team of one.** The direct push is the
  solo shape. A team reviews a session branch before trunk moves — which
  the framework's existing candidate mode (`release.gate: candidate`, a
  pushed candidate branch, a gate that fast-forwards trunk) already
  provides. Both shapes stay; the manifest says which.
- **The test model stayed repository-wide.** See below.

## The testing surface, decided

**One impact plan**, computed once and used by `dabbler affected`, the run
of record and `test_run_fresh` alike, so the verb and the driver can never
disagree:

1. changed paths → the modules they belong to (`docs/modules.yaml` roots);
2. each changed module's own suites: unit, and its **provider-contract**
   suite against its abstractions;
3. each transitive consumer's **consumer-contract** suite, run against the
   changed module's **candidate package**, found by reverse edges in
   `docs/modules.yaml` — declared once, never hand-listed per suite;
4. candidate packages and contracts generated first;
5. each selected suite run whole; per-suite freshness recorded over its
   `covers` (exists today); the land refuses if any selected suite is
   stale.

A change confined to `modules/persister` runs persister's unit and
provider-contract suites and listener's persister-consumer-contract suite,
and nothing else. A change to the shared-types module runs every
transitive consumer's suites — all of them in a three-module solution,
which is right, because that module's blast radius is the solution — but
never "every test in an arbitrarily large repository". The full
integration lane runs on trunk CI and in a release session: information
for an ordinary close, evidence for a release.

Two schema consequences. `expensive` today means both "the run of record"
and "worth selecting a subset of"; the module world needs "required for
close" as its own word, with module suites `expensive: true` in the
interim. And `selection.rules[].select` names test *files* today
(`checks.ts`, `isTestFile` over `test_roots`/`test_glob`); module
selection is by suite and by module edge, derived from the manifest, so
the rules vocabulary gains a module form rather than growing hand-written
lists that go stale.

## Contracts and contract tests, decided

Three modes per module, declared in `docs/modules.yaml`: a **designed
abstractions package** (preferred where a behavioural seam exists); a
**declared public package** that is its own abstraction (small value
libraries, shared types); a **generated surface**, marked generated, for
legacy. Behavioural documentation, examples and the human notes page live
under `modules/<slug>/contract/`. **Provider contract tests** compile into
a separate `<Module>.ContractTests` package — not into the production
abstractions, which must not drag a test framework into every consumer —
and the implementation's test project inherits them. **Consumer-owned
compatibility tests** live in the consumer's `contract/` area and run
against the provider's candidate package. The shared-types module sits at
the bottom of the graph, holds deliberately shared types only, and takes
the slowest cadence and the most review; a breaking change to it is a
cross-module or release session.

## Debugging across the seam, decided

`dabbler module grant persister --reason "…" --debug` widens the cone,
updates the `.slnf`, lays a temporary project-reference overlay **outside
the committed project files** so a debugging convenience cannot reach the
pull request, reloads the window and records exposure;
`dabbler module revoke persister` refuses while the sibling holds changes,
restores the package reference, narrows and reloads. Source Link retrieval
is off in engine sessions unless it goes through the same grant, because
it fetches source from the host and an engine could too. One grant and
one reload per occasional debug is the tolerance; a reload per run is
not.

## Clone, worktree, Windows

Gemini wants a persistent sparse worktree to spare Windows antivirus and
disk; Sol wants one disposable filtered clone per session, deleted after
the land, and never a worktree of the full checkout, because worktrees
share its object store. **Sol's shape is adopted, with Gemini's cost
measured before rollout**: a Windows preflight that clones, restores,
tests and times antivirus impact on the operator's own machine, clones
under a short configurable parent directory, one VS Code window rooted at
the session clone and never the full checkout as a second root. If the
measurement says a fresh clone per session is too slow, the fallback is a
**persistent clone per module**, reset to trunk and re-narrowed at each
open — still never a worktree of the full checkout. The measurement is
owed to session 5 below.

## The developer's day (the storyboard both advisors converge on)

- **Clone and open.** One `git clone`, then `dabbler module open
  persister`. A focused window opens with the module, the root build
  files, dependency contracts and packages.
- **Work.** IntelliSense resolves siblings from abstractions and
  packages; behaviour is in `modules/<slug>/contract/`; sibling source is
  not on the disk to wander into.
- **Test.** `dotnet test` on the module's project for feedback;
  `dabbler affected` names the exact close obligations: this module's unit
  and provider-contract suites and each reached consumer's contract suite.
- **Land.** The candidate contract and package are built, the selected
  suites run against them, freshness is checked, and the exact tested
  bytes are committed; a grant shows in the exposure manifest.
- **Review.** A plaintext pull request: implementation, contract, package
  manifest and tests. Trunk moves by direct push for a team of one, by
  the candidate gate for a team.

## The sessions (replacing round 7's eight; real dependencies marked →)

1. **Solution plan and module manifest.** Plus reverse consumers, the
   shared-types designation, package identity and seam ownership.
2. **Module configuration, exception schema, test-impact declarations.**
   → 1. Provider and consumer contract suites and reverse edges; the
   "required for close" word; module-form selection.
3. **Designed contracts and contract-test source.** → 1. Abstractions,
   `ContractTests` packages, consumer compatibility tests, the notes page;
   generation as the marked fallback.
4. **Committed immutable packages.** → 3. Abstractions, implementation and
   contract-test packages; exact source/contract/package correspondence.
5. **The focused checkout.** → 1–4. The disposable filtered clone with the
   module, root build files, dependency contracts and packages, and the
   reverse-consumer contract assets; the Windows preflight and its
   measurement.
6. **Module-scoped sessions, verifier scope, exposure manifest, grants.**
   → 5. Hard verifier scope; `grant`/`revoke` with the overlay; Source
   Link off in engine sessions.
7. **The impact plan and the selected run of record.** → 2, 4, 5. One plan
   for `affected` and the driver; candidate bytes first; reached suites
   only; per-suite freshness.
8. **The atomic land.** → 7. Tested bytes are the landed bytes; drift and
   the exposure ceiling; direct push or the candidate gate per the
   manifest; bundles recorded.
9. **Maven parity and the hardened profiles.** → 1–4, 7. Java is a stated
   customer, so parity is not optional; encryption and containers are
   designed only against a named customer.

Session 100 remains item 1. Round 7's ordering (contracts and packages
before the checkout) stands; the run of record moved from "unchanged" to
its own session because it was the objective no round had treated.

## Which rules decided it

(a) a designed abstractions package, a contract test base class and
`dotnet test` on one project are what skilled .NET teams already do; the
sparse clone does by hand what they do by opening one project. (b) the
storyboard above is five moments. (c) one impact plan, one freshness
mechanism, tested bytes landed unchanged. (d) the framework spends clones,
candidate builds and generated files; the developer spends one command
and an occasional grant. (e) .NET first, Maven a stated customer.
(f) two advisors, converged, with Sol's five corrections adopted.
