# Path-Aware Critique — reusable operator prompt template

> **What this is.** The canonical, reusable prompt for the **manual
> Path-Aware Critique** stage (Set 066): an end-of-set, **multi-provider**
> review in which each critic has **real, path-aware access to the
> repository** and pulls ground truth itself rather than reviewing a snippet
> the (biased) author pasted. It institutionalizes the operator flow that
> the team already practices — GitHub Copilot driving **GPT-5.4** and
> **Gemini-Pro** over the repo — and that produced this very feature's design
> critiques.
>
> **When to run it.** At the end of a session set whose recorded
> `pathAwareCritique` policy is `advisory` or `required` (see the authoring
> guide and `docs/path-aware-critique-schema.md`). The blast-radius predicate
> (`python -m ai_router.blast_radius <paths…>`) *recommends* the level; the
> operator confirms it at set start.
>
> **Why path-aware + multi-provider.** The Set 065 bake-off proved a
> path-aware, multi-provider critique catches a class of high-severity defects
> a snippet-fed single-shot verifier structurally cannot see (fabricated data,
> index undercounts, cross-artifact contract drift). A single provider is
> insufficient (the 010-vs-C3 split implied opposite single-provider fixes),
> so the saved artifact **requires >= 2 distinct providers**.
>
> **Automated alternative (opt-in, Set 067).** This manual flow is the
> default and always available. As of Set 067 you can also produce the same
> artifact automatically with `python -m ai_router.pull_critique
> <session-set-dir>`, which drives the first-party tool-loop pull verifier
> (`ai_router.pull_verifier`) once per provider over a read-only repo sandbox
> and writes `path-aware-critique.json` directly — using *this very prompt*
> as its critique instruction. Set 067 Experiment A confirmed the automated
> path catches the same class of real cross-file defects. The producer is
> strictly opt-in; nothing in the normal session flow invokes it.

---

## How to run this (operator)

1. Open the repository in an editor with **GitHub Copilot** (so the reviewer
   has real, path-aware workspace access — this is a Mode-2 *pull* review, the
   kind the routed `route()` path cannot do).
2. Fill the `{...}` placeholders in the `=== PROMPT ===` body below with this
   set's specifics (slug, change summary, the file list, the load-bearing
   claims to check).
3. Paste the filled prompt into Copilot Chat **once under GPT-5.4** and **once
   under Gemini-Pro** — two independent passes, each from a clean context.
4. Save each critic's raw verdict, then assemble them into
   `docs/session-sets/{session_set_slug}/path-aware-critique.json` per
   `docs/path-aware-critique-schema.md`. The artifact is **raw and never
   edited after written** (verification-artifact discipline). One critique
   entry per provider; `>= 2` distinct providers.
5. Hand the verdicts back to the orchestrator to fold into remediation, then
   run `close_session` — on a `required` set the close-out gate confirms the
   saved artifact is valid before the set-terminal close.

> A clean review still produces an artifact: every provider records what it
> reviewed and its verdict. Unlike `sN-issues.json` (whose presence *means*
> issues were found), this artifact's presence means *the critique ran*. Never
> fabricate a provider entry to satisfy the gate.

---

=== PROMPT ===

You are an adversarial code-and-docs reviewer with **full read access to this
repository**. A session set (**{set_title}**, slug `{session_set_slug}`) has
just finished its implementation work and is about to close. Your job is to
find what is **wrong, risky, incomplete, or internally inconsistent** in its
changes — across code, tests, and documentation — **before** it ships. Be a
genuine devil's advocate: assume the work is flawed and try to prove it. A
rubber-stamp is a failure.

**Anti-bias instruction (load-bearing).** Do **not** rely on my summary below.
**Open and read the actual files yourself** and reason from what is on disk.
Where my description and the code/docs disagree, **the repository wins** — call
that out explicitly. Pull ground truth; do not trust a flattering paraphrase.
In particular, for every claim of *current behavior* (what a function reads,
writes, enforces, or defaults to; what a test asserts; what a doc says the code
does), verify it against the actual file before accepting it.

## What this set changed (my summary — verify it, do not trust it)

{change_summary}

## Files changed (read these; do not stop at the ones I emphasize)

{files_changed}

## Load-bearing claims to check against the code (prove or disprove each)

{claims_to_check}

## What to attack

1. **Correctness.** Logic errors, wrong conditionals, off-by-one / index
   miscounts, mishandled edge cases, fail-open/fail-closed mistakes, ordering
   bugs. Name the exact file and line.
2. **Contract / cross-artifact drift.** A schema, validator, doc, and test that
   are supposed to describe the same contract but disagree. A doc claiming a
   behavior the code does not implement (or vice versa). A pure-Python validator
   that has drifted from its JSON Schema twin.
3. **Completeness.** A claimed deliverable with no actual implementation, a
   wired-but-untested path, a stated invariant nothing enforces, an edge case
   the tests skip.
4. **False confidence.** A test that passes without exercising the behavior it
   names; a "VERIFIED" claim the evidence does not support.
5. **Anything unforeseen** — hidden coupling, cost/perf blowups, ASCII/encoding
   hazards on Windows `cp1252`, a wrong default, a stale reference.

## Materiality — the "so what?" gate

Be adversarial, **not** a nitpicker. The devil's-advocate stance exists to catch
defects that **matter**, not to manufacture a finding so the critique doesn't look
like a rubber-stamp. A correct, complete change **should** come back `VERIFIED` —
that is the right verdict when you genuinely tried to break it and could not.
**Manufacturing a Minor / "false-positive" finding just to avoid a clean verdict is
itself a false-positive failure**, and this section forbids it.

Before you report any **blocking** finding (Critical or Major), it must clear the
three-part "so what?" test — state all three in the **Description**:

1. **Violation** — the exact requirement, contract, or claim that is broken (quote it).
2. **Impact** — the concrete consequence: what breaks, for whom, or which merge
   decision it changes. "Could theoretically be clearer" is not an impact.
3. **Evidence** — the ground truth you read on disk that proves it.

A finding that cannot produce all three is a **nit, not a blocker** — record it under
**NITS** (below), never as a Finding.

**Judge semantic equivalence, not textual identity.** Two forms that behave
identically are equivalent; do not flag a cosmetic difference as a defect. (A task
that says `pytest` and output showing `python -m pytest -v` ran the same test
session — not a finding.) The sole exception: when the **exact text is itself the
contract** (a required literal token, a public API name, a wire-format string),
textual identity *is* correctness and a mismatch is a real defect.

## Severity anchoring

- **Critical / Major** — block. **Major = a defect that would change a reasonable
  reviewer's merge decision** ("fix this before merge").
- **Minor** — a real but immaterial observation that would **not** change a merge
  decision. Minor findings **do not block**.
- **Plausible-path-to-harm escalation (anti-laundering):** to call something
  **Minor** you must be confident there is **no plausible path** by which it leads to
  a Major/Critical failure. **When in doubt, escalate** — a real bug mislabeled Minor
  and waved through is the failure mode this guards against. Materiality lowers the
  noise floor; it must never launder a real defect.

## Output format

Begin with a one-line **VERDICT**: `VERIFIED` (no significant issues) or
`ISSUES_FOUND`. Then:

- If `VERIFIED`: 1–3 sentences on **what you actually read** (which files, which
  claims you checked) and why you are confident. A bare "looks good" is a failed
  review.
  Only **Critical or Major** findings justify the `ISSUES_FOUND` verdict. If the
  only things you found are Minor or immaterial, the verdict is `VERIFIED` and they
  belong under **NITS**, not as Findings.
- If `ISSUES_FOUND`: a **Findings** list. For each finding give:
  - **Severity:** Critical / Major (a blocking Finding is never Minor — Minor goes
    under NITS)
  - **Category:** correctness / contract-drift / completeness / false-confidence / other
  - **Location:** the exact `file:line` (or file + symbol)
  - **Evidence paths:** MANDATORY on Critical/Major — the repo-relative paths you
    actually opened that prove it. When you submit through the `submit_verdict`
    tool, put them in the finding's `evidencePaths` array; in prose, list them
    comma-separated on an `Evidence paths:` line. This is the finding's
    **provenance** and it is read mechanically: a finding whose evidence is
    **entirely** documentation prose (`.md` / `.rst` / `.txt`) is recorded as a
    Minor nit and does not open another review round, so if the defect is in
    code, name the code file.
  - **Description:** the three-part "so what?" — the **violation** (quote it), the
    concrete **impact** (which merge decision it changes), the **evidence** you read
    that proves it — and the concrete fix.

### NITS (optional, non-blocking)

The single home for **every non-blocking observation** — both **Minor** findings
(real but immaterial) and sub-Minor nits (cosmetic / stylistic / "could be
marginally clearer" points that fail the "so what?" test). NITS are non-blocking by
definition: on their own they **never** change the verdict to `ISSUES_FOUND` and
**never** justify another remediation round. They may appear under **either** verdict
— a `VERIFIED` critique may still list nits, and an `ISSUES_FOUND` critique (driven by
a Critical/Major Finding) may also carry nits — but NITS alone never block:

- **Nit:** [observation] (`file:line` if useful)

Omit this section entirely when you have nothing immaterial to note.

Do NOT re-do the work. Only evaluate what was produced. Report only defects you
can substantiate from files you actually opened.
