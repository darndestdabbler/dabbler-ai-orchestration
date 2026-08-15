# Change log — Set 133: release and listing truth

**Set:** `133-release-and-listing-truth` (2 sessions)
**Ships:** `dabbler-ai-router 1.0.0` on PyPI and the `dabbler-ai-orchestration`
extension `0.51.0` on the VS Code Marketplace — and, more to the point, a
release that describes itself truthfully and a repo that records what actually
happened.

---

## The set in one line

Two artifacts had been staged and operator-gated since 2026-08-09/10 while
twenty sets (113-132) landed on top of them. This set did not decide whether to
publish — the operator had. It made the thing being published say what it
does, and then it made the repo's own record say what shipped.

The set is bounded by a rule it kept: **no product code changed.** A release
set that starts changing code invalidates the artifact it is describing. Every
defect either half of it found was recorded with a named owner instead.

---

## Session 1 — Say what shipped, and say it well

### The entry that did not exist

The read-only tool grant landed in `d13e7b9d` (Set 125) and is **not an
ancestor of `v0.34.0`** — the published router. So every seat on the published
router had been dispatching routed calls under the old grant, and the release
notes said nothing about it. `grep -rl "Set 125" ai_router/changelog.d/`
returned only a Set 120 S3 fragment that mentions it in passing.

The new fragment files it under **Security** and states it as the
consumer-visible change it is: what a routed call could do before on the
`copilot-cli` transport (arbitrary PowerShell, file create and edit, web
fetch, sub-agent spawning — against the live working tree), what it can do now
(`view`, `grep`, `glob`, from one shared `_tool_grant_argv` on both dispatch
paths), and the matched-pair evidence (`filesModified: ['sample.txt']` versus
`[]`). It also names the consequence that is not obvious from the diff: **a
verifier able to edit the code it judges can fix a finding and report VERIFIED
on its own edit.** The `api` transport was never exposed, and that was verified
rather than assumed — `providers.py` contains zero occurrences of `tools`.

### The breaking change, made self-remedying

`1.0.0` refuses `tier: lightweight` at config load. The `1.0.0` section now
opens — before anything else, on one screen — with the symptom a user actually
sees (the literal `LIGHTWEIGHT_REMOVED_MESSAGE`), the one-line fix as a diff,
and a working link to `docs/cross-repo-lightweight-removal-notice.md`.

This replaces detection with remediation **on purpose**. The extension is an
open-source effort used by government employees whose repositories cannot be
accessed; a sweep of two known checkouts was never going to cover the real
consumer population, and a loud fail-closed error plus a one-line fix in the
release notes reaches every consumer of a public package, including the ones
nobody here can enumerate.

### The listing

Seventeen router and thirteen extension fragments were folded, then both
pending regions were restructured into the versions actually being tagged —
one `[1.0.0]`, one `[0.51.0]`, each carrying its earlier staged tranche
beneath it as part of the same release, rather than seventeen loose
`[Unreleased]` headings above a version.

The extension README — which *is* the Marketplace listing, rendered from
inside the VSIX — leads with what the framework is rather than with what the
AI writes, and carries a **Verification you can check** section of
auditability claims beside an explicit block naming what is **not** claimed:
no defect-catch rate, no "catches bugs before they ship". The framework has
never measured what fraction of real defects it finds, and the listing says
so. The existing docs' register — *it is containment, not a sandbox* — was
kept deliberately; that candour is the most credible thing on the page.

Two false statements came out of it: a `$0`-budget bullet still offering "or
you skip verification with the decision logged" (no skip has existed since
`1.0.0`), and "all three keys are required". A 73%/32% savings headline was
re-framed as what the shipped report actually computes — a hypothetical
Opus-only baseline — rather than as something measured.

The root README lost its own two: the tree is the **AI Work Explorer** (Set
132 S1), and Prerequisites no longer demands API-key accounts for all three
providers, which was wrong for the entire Copilot-seat population that Sets
078 and 112 exist to serve.

### What verification caught

VERIFIED at round 4, `gpt-5-6-sol` throughout, anthropic excluded by
model-registry lookup. Round 1 returned one Major and it was right: the
listing promised an unconditional cross-provider block while the same release
documents an accepted same-provider fallback. Round 3 then **rejected the
first fix**, also correctly, on two counts — `package.json` had been re-worded
rather than fixed, which put the same unconditional claim on the Marketplace
*search* surface, and the changelog argued a position instead of reporting
behaviour. Round 4 accepted the second fix. All four surfaces now state one
contract.

### Three defects found by doing the work

`fold` emptied both corpora and turned fifteen tests red, because the
falsifier battery plants defects into the **live** corpus — so it went red at
exactly the moment a release is cut. The same class was then found at a
sibling site the first pass missed (G-008: a bug is a bug class). The single
mocha failure was not a product bug: a test helper standing in for the Python
writer reproduced, inside the stand-in, the exact defect the production code
documents itself for avoiding.

### The one that was pinned, not fixed

`changelog.check()` returns `[]` from its empty-corpus branch as soon as
`foldedAt` is stamped, without ever comparing the `originalSha256` that `fold`
recorded — so between a release and the next contribution the round-trip guard
verifies **nothing**, and an edit to released history passes silently. The fix
is about six lines. It was deliberately not applied, because this set forbids
product code in a release commit, and it is pinned by a strict-xfail falsifier
that turns green the day it is closed. It earned itself twice during the
session: the rewritten assertion caught post-restamp drift in both changelogs
that `changelog check` called "round trip OK" on the same tree.

---

## Session 2 — Confirm and correct the record

### Both registries, confirmed against the registries

- **`dabbler-ai-router 1.0.0` is live on PyPI.** `info.version` is `1.0.0`;
  wheel and sdist both uploaded 2026-08-15T15:02:45Z.
- **Extension `0.51.0` is live on the VS Code Marketplace.**
  `extensionquery` returns `DarndestDabbler.dabbler-ai-orchestration` at
  `0.51.0`, `lastUpdated` 2026-08-15T15:09:32Z.

Both tags sit on the same commit `6f195bd8`, with `Test` green on that commit
(run `31891207265`) before either publish workflow ran — `v1.0.0` via
release.yml run `31891571451`, `vsix-v0.51.0` via publish-vscode.yml run
`31891572217`.

The confirmations were made against the registry APIs, not the workflow exit
codes, and the difference turned out to matter.

### Open VSX: not published, and never has been

The extension publish run's *Publish to Open VSX Registry* job is **green**.
It published nothing. `OVSX_PAT` is unset in the `openvsx` environment, so the
step prints `OVSX_PAT not configured for the openvsx environment; skipping
Open VSX publish` and exits 0 — a deliberate non-fatal skip, documented as
such in the release runbook. What is not deliberate is how it reads from the
runs list: a job named *Publish to Open VSX Registry* with a green check.

Open VSX confirms it from the other side: the extension is a 404 and so is the
`DarndestDabbler` namespace.

Checking that against history turned up a false claim of the same class — the
`0.45.0` row said it was published to Marketplace **and** Open VSX, and its
own run log shows the identical skip. **No version of this extension has ever
reached Open VSX.** Both the current row and the historical one now say so,
with the rule stated where it will be read next time: *read a green Open VSX
job as "did not fail", never as "published".* Enabling it is step 5 of the
release runbook and an operator action.

### The row that had been wrong twice

`docs/repository-reference.md` → *Current release status* now states what is
live rather than what is staged, with the run ids and tagged commit recorded
as the surrounding rows do. Correcting it was a named deliverable rather than
bookkeeping for a reason: Set 112 S3 found it still naming `0.33.0` live nine
releases on, and Set 107 S1 found it claiming `0.46.0` was staged after it had
shipped. Both times the publish happened and the row was never updated.

Two further stale claims were fixed in the same pass rather than left for a
third occurrence: the router row still described Sets 105–116's work as
"unpublished", and the version walk's `0.32.0` bullet still said "not yet on
PyPI" five weeks after it shipped. The walk gained an entry for this release.

### The deletion-cost ruling

Journaled as an operator decision (`authority=human`,
`rubric_line=value-trade-off`): **a test whose only subject is deleted code is
not a verification reduction.**

The framework currently makes addition cheap and deletion expensive, because
deleting a module means deleting its tests, and reducing verification is a
hard human-only carve-out an orchestrator may never self-authorize. The
measured symptoms: 4,640 tests growing at roughly +29 test functions per day,
and **zero guards ever retired**. Set 116 S3 demoted five gates and
deliberately deleted none. Of six modules scheduled for deletion, three went
and the three survivors *grew* — `contract_gate` 1,158 → 1,319,
`spec_admission` 403 → 1,082, `replacement_gate` 546 → 652. The three current
figures were re-derived in this session rather than inherited.

The ruling is paired with extending the existing rule *"no gate is added
without deleting one"* from gates to **modules**, and it is gated on a
precondition that is the whole ruling: the subject must actually be gone. A
test whose subject moved, was renamed, or merely stopped being called still
has a live subject, and removing it is still a coverage reduction that needs
the operator.

This is a ruling, not an implementation. No code changed under it and no test
was deleted. The next paring set inherits a decision instead of re-litigating
one.

### What this session cost to verify, and what that turned up

Session 2's own verification is worth recording, because it was not routine
and because two of the things it hit are defects in the framework rather
than in the work.

**Every OpenAI model on this seat returned 429.** Probed individually across
`gpt-5-6-sol`, `gpt-5-5`, `gpt-5-4` and `gpt-5-6-luna`, so an account-level
limit rather than one model or one burst — three full attempts over roughly
twenty minutes, two of them separated by a deliberate wait. The orchestrator
is Anthropic and may not verify its own work, which left Google as the only
reachable different-provider verifier. The session took rung 2 of the
documented escalation ladder and ran the round against `gemini-pro`.

Stated plainly because it is the kind of thing that should not be buried: the
verifier was **tier 2** where the pinned verifier is tier 3, so the reviewing
model was less capable than the pin. Nothing was skipped — full scope, every
severity, both discovery passes, every gate in force — and the evidence under
review was four documentation files whose factual claims are all externally
checkable. Both decisions are in `decisions.jsonl`, the second superseding the
first rather than rewriting it.

**Two tool gaps, found by hitting them.** Neither is fixed here; a release
set does not change product code, and both are recorded with a named owner.

1. `verify_session` hardcodes `exclude_providers` to the orchestrator's own
   provider and offers no flag to add a second one. So the ladder rung it
   prints in its *own* failure message — *fall back to the remaining
   cross-provider verifier* — has no mechanism behind it.
2. The more serious one: `providers.<id>.enabled` is explicitly on the
   local-override allow-list in `config.py`, and setting it to `false`
   changed nothing about which model was selected. The override loads,
   validates, and reports as applied, and the pinned verifier is still chosen
   from that provider. An operator reading that allow-list would reasonably
   believe they had turned a provider off. A control that appears to work and
   does not is worse than one that is absent.

What actually reaches the fallback is clearing `DABBLER_OPENAI_API_KEY` for
the single process — the router consults key *availability* when it builds
the candidate pool, and says so in a clear note. Nothing persistent was
changed.

**A third, smaller one, from the verification prompt itself.** The pre-close
framing asserts that `change-log.md` "does not exist yet", rather than saying
its absence would not be a defect. For a terminal session — which is
*supposed* to write it before verification, since the spec lists it as a
deliverable — the evidence bundle contradicts itself, and a verifier duly
raised the contradiction as a Major. The file's contents had in fact been
inlined for review in full.

### Two findings this session accepted against itself

Verification raised five Majors. Three were false positives with
deterministic evidence, adjudicated in `s2-remediation-round-2.md`. Two were
right:

- **A step-checklist post is missing for step 3.** The posting cadence calls
  for a post at each named transition; this session posted at start and
  before the long verification run, but not between finishing step 2 and
  starting step 3. It is **not retroactively fixable** — the checklist renders
  current state, and manufacturing an entry showing a completed step as
  in-progress would put a false record on the ledger to satisfy a gate. The
  miss is recorded instead. The work itself is evidenced twice over, in
  `activity-log.json` and in the journal entry it produced.
- **A tracked build artifact was dirty.**
  `tools/dabbler-ai-orchestration/dist/extension.js.map` showed as modified.
  It was **not this session's doing**: its mtime is 10:42:34, two and a half
  hours before this session registered at 13:15:46, from a rebuild run after
  Session 1 closed. `dist/extension.js` — the actual emitted code — carries
  the identical timestamp and was byte-identical to what is committed, so the
  build reproduced the shipped bundle and only the sourcemap text differed.
  The first disposition left it uncommitted with that justification on the
  record; a later round rejected the fix, and the file was **reverted** to its
  committed bytes instead. That is the better answer and was available all
  along — the artifact is regenerable, the shipped VSIX is rebuilt from source
  in CI rather than from the checked-in `dist/`, and the tree is now clean.

---

## What this set deliberately did not do

- **`WORK_STEP_BUDGET = 4`.** The operator's 2026-08-14 ruling owes its
  implementation to a follow-on set. Mixing a policy change into a time-boxed
  release is how a Monday morning slips.
- **Act on the ceremony measurement.** The 2026-08-15 analysis found ceremony
  cost per step rising 7.1 → 16.3 minutes while work per step stayed flat at
  ~7.1. That is the strongest simplification signal on file and it belongs to
  its own set, authored on its own evidence.
- **Sweep consumer repositories.** Prohibited, and not a gap to close. The
  operator's attestation of 2026-08-15 — staff are using the published
  extension and have reported no major issues — is the evidence of record, and
  the documented remedy stands in for the sweep.

---

## Step 9 — the guidance review (terminal session)

**Outcome: no changes to the preload.** That is a decision, not a skip, and it
rests on two facts.

`guidance_report --check` reports every preload file at **exactly 100% of its
ceiling** — constitution 4,059, project-guidance 3,394, lessons-learned 2,269,
engine file 1,922, total 11,644. Ceilings ratchet down only, so admitting new
prose means evicting prose that is already load-bearing. Set 121 has just
finished an encode-or-drop pass over this corpus; there is no slack to spend
and nothing here earned an eviction.

Three things this set learned are durable. None of them belongs in preload,
and each is routed to where it will actually be read:

**1. Never hand-author a timestamp a writer already stamps.** This session's
one self-inflicted defect, and the one verification caught last: four
hand-typed decision timestamps, one of them chronologically impossible on the
entry authorizing an exception to a machine-enforced bound. It fails the
preload admission test on criterion 4 — an **executable gate is available and
obviously better than an instruction**. `decision_journal` already does
`timestamp=timestamp or now_iso()`; it should go further and *refuse* a
caller-supplied timestamp outright, or a gate should assert the journal is
monotonic. Recorded as a residual for a follow-on router set. A lesson telling
future orchestrators "don't do that" is exactly the guidance Set 121's rule
exists to reject.

**2. Confirm a publish against the registry, never against the workflow.**
This set found an Open VSX publish that had never happened, behind a green job
on a step that skips non-fatally, and a `0.45.0` row that had claimed it for a
year. The rule is real and it has now been wrong twice on this row. But its
trigger is **situational** — it fires at a release, not every session — which
is the same reason L-078-1 was archived rather than kept resident. It is
therefore written where a release operator will meet it: in the release-status
row itself, as *read a green Open VSX job as "did not fail", never as
"published"*, beside the evidence that makes the point concrete.

**3. A two-cycle round bound is the wrong size when the verifier changes
provider mid-session.** The bound was passed twice here, each time on its own
recorded operator attestation, and both passes were justified — once by a
provider outage that had degraded the verifier to tier 2 and closed off the
sanctioned third-provider route, once by a genuine defect the extra round
found. That is the loop working, not grinding. But it is a claim about how the
bound is *sized*, which is a measurement question, and it belongs to Set 134
(`134-ceremony-cost-and-what-to-cut`) on its own evidence rather than to a
guidance edit made from a single session. It is journaled in `decisions.jsonl`
for that set to pick up.

**Lessons cited at close** (`cite_lessons`, recorded in
`docs/planning/guidance-usage.json`): `G-004` practicality outranks
rule-perfectionism, which decided the sourcemap revert; `G-008` a bug is a bug
class, which turned one fabricated timestamp into a check of all four;
`G-012` propagate a consistency fix to every echo, which took the Open VSX
correction back to the `0.45.0` row; `G-013` grade severity by consequence;
and `L-064-8` a replacement doc inherits the retired doc's claims at its peril,
which is why the release-status row's inherited "unpublished" and "not yet on
PyPI" claims were re-checked rather than carried.
