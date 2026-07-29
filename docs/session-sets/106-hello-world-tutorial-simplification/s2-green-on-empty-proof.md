# S2 — Green-on-empty proof for the re-cut `monorepo-ci.yml` template

> **Why this artifact exists.** The spec requires that the scaffolded CI file
> stay harmless as scaffolded — *"a fresh repo with no modules must not go
> red"* — and that the session **state how that is achieved and prove it**.
> The routed step-3 analysis named the matching risk in its own words: *"the
> AI's 'proof' of the CI template's harmlessness is a plausible but incorrect
> assertion."* So this is executed, not argued.
>
> **How it is achieved:** the active job's only repo-contributed step is a
> `run:` block of three `echo`s. There is no branching, no matrix, no `if:`
> gate, and no assumption about where modules live — so there is nothing in it
> that a repository's contents can make fail.
>
> **Revisions — this artifact was itself a verification target twice.**
>
> - *Round 1, nit 3:* check C proved bundle parity for the CI template only,
>   while the CHANGELOG claimed all three re-cut templates were byte-identical
>   to their shipped copies. Check C was widened to cover all three, across
>   `dist/` and both cold-start goldens.
> - *Round 2, nit 2:* the artifact reported `PASS (31/31)` against 27 listed
>   `[PASS]` lines — a hand-written tally that had drifted, making the
>   denominator unauditable. The tally is now computed by the same counter that
>   prints the checks, so it cannot drift again.
> - *Round 2, nit 3:* check C excused `getting-started.md` from byte comparison
>   on the grounds that it is rendered with substitution tokens. It goes through
>   the renderer, but carries no token this bundle fills, and its golden **is**
>   byte-identical — so it now gets the same byte assertion as the others, with
>   the link assertions kept on top.
>
> Each revision is a full re-run on the then-current tree, not a patch.
>
> Re-runnable: `PROOF_OUT=<this file> python prove_green_on_empty.py`
> (script in the session scratchpad; everything below is its verbatim output).
>
> **Run:** 2026-07-28, Set 106 S2, final tree. **Result: PASS (29/29).**

---

## A. Structure — what can fail in this workflow at all

  [PASS] runs on pull_request — {'push': {'branches': ['main']}, 'pull_request': None}
  [PASS] runs on push to main — {'branches': ['main']}
  [PASS] exactly one job, named `test` — ['test']
  [PASS] the job carries no `if:` gate — it always runs
  [PASS] no matrix — one run, one result
  [PASS] runs-on — 'ubuntu-latest'
  [PASS] exactly two steps — 2 found
  [PASS] step 1 is the stock checkout action — 'actions/checkout@v4'
  [PASS] step 2 is a plain `run:` block — the only code this repo contributes
  [PASS] no `shell:` override, so GitHub uses its ubuntu-latest default `bash -e`

The active job therefore has exactly one failure surface of our own making:
the step-2 `run:` block. Everything else is GitHub-managed. That block is:

    echo "::warning::Monorepo CI is still the scaffolded placeholder: it runs no tests. Adapt .github/workflows/monorepo-ci.yml."
    echo "TODO: replace with the commands that build and test every"
    echo "module in this repo (the anti-integration-bomb guardrail)."

## B. Execution — that exact block, `bash -e`, in a fresh empty repo

  [PASS] the repo is genuinely empty — ['.git']
  [PASS] the run block exits 0 — exit=0

  stdout:
    ::warning::Monorepo CI is still the scaffolded placeholder: it runs no tests. Adapt .github/workflows/monorepo-ci.yml.
    TODO: replace with the commands that build and test every
    module in this repo (the anti-integration-bomb guardrail).
  [PASS] it emits a GitHub warning annotation, so the green check is not silent
  [PASS] it wrote nothing into the repo — ['.git']

## C. Parity — the bytes proved are the bytes shipped

  Bundled dist/ copy vs source template — all three re-cut templates:
  [PASS] byte-identical: dist/monorepo-ci.yml.template
  [PASS] byte-identical: dist/CODEOWNERS.template
  [PASS] byte-identical: dist/getting-started.md.template

  Cold-start golden vs source template — the two untokenized templates:
  [PASS] byte-identical: test-fixtures/cold-start/full/.github/workflows/monorepo-ci.yml
  [PASS] byte-identical: test-fixtures/cold-start/lightweight/.github/workflows/monorepo-ci.yml
  [PASS] byte-identical: test-fixtures/cold-start/full/.github/CODEOWNERS
  [PASS] byte-identical: test-fixtures/cold-start/lightweight/.github/CODEOWNERS

  getting-started.md.template goes through the renderer, but carries no
  substitution token that this bundle fills, so its golden is byte-identical
  too — asserted as such, plus the link assertions this session's edit is about:
  [PASS] byte-identical: test-fixtures/cold-start/full/docs/dabbler/getting-started.md
  [PASS] points at the surviving tutorial: full
  [PASS] no link to the retired module-team-hello-world.md: full
  [PASS] no link to the retired module-team-hello-world-review-prompt.md: full
  [PASS] byte-identical: test-fixtures/cold-start/lightweight/docs/dabbler/getting-started.md
  [PASS] points at the surviving tutorial: lightweight
  [PASS] no link to the retired module-team-hello-world.md: lightweight
  [PASS] no link to the retired module-team-hello-world-review-prompt.md: lightweight

## What this does NOT prove

- `actions/checkout@v4` itself is GitHub-managed and is not executed here.
  A checkout failure would be a GitHub or credentials fault, not a property
  of the scaffolded file.
- The `::warning::` annotation is asserted to be EMITTED; that GitHub renders
  it on the PR is GitHub's documented behavior, not something reproducible
  on this machine.
- No local runner (`act`) is installed and installing a Docker-backed one was
  judged disproportionate; check A is what makes check B sufficient, by
  establishing that the run block is the only thing left that could fail.

Every check above is printed; the tally below is computed from the same
counter that printed them, so it cannot drift from what is listed.

## Result: PASS (29/29)
