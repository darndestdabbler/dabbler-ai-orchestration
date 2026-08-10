# Target-state proposal — a smaller framework, and what actually gets faster

> **Status:** proposal, drafted 2026-08-10, revised the same day after the
> operator's review. Not a ruling and not an attestation; two items in §8
> sit inside the decision-rights hard carve-out and are marked.
>
> **Every number below was measured** against the tree at `9b65cb4a`.
>
> **Note for Set 117 close-out:** this file landed while Set 117 Session 1
> was committed-but-not-closed. It is unrelated to that session's work; if
> `working_tree_clean` flags it, commit it separately.

---

## 1. Why the first draft guaranteed nothing

The operator's review was: *"I get the sense that nothing is guaranteed to
improve. I don't understand why."* That was correct — but the reason I first
gave was itself wrong, and the correction matters more than the original
claim.

### 1.1 Methodological rule: medians only

**Wall-clock spans include operator-away time.** Set 116's spec already
established this — *"the median is the honest signal and the maxima are not
effort"* — and the operator confirmed it directly: one ~24h session was
"really only a little over 2 hours." The two largest work phases on record
are **110 S4 at 1,421 min (23.7h)** and **111 S4 at 1,414 min (23.6h)**;
neither is effort.

Any claim in this document that uses a **mean** is suspect. Means are
reported only alongside medians, to show the skew.

### 1.2 The measured phase split

From `session-events.jsonl` across **104 sets / 295 sessions**:

| phase | median | mean | p90 | max |
| :--- | ---: | ---: | ---: | ---: |
| **Work** (`work_started` → `closeout_requested`) | **48.1 min** | 109.4 | 270.5 | 1,421.6 |
| **Close-out** (`closeout_requested` → `closeout_succeeded`) | **0.1 min** | 14.8 | 22.2 | 452.8 |

**Close-out takes six seconds in the typical case.** The earlier draft
claimed it was 57 minutes and "the single largest block." That was wrong.
The 57-minute figure in Set 115's spec measures elapsed time *after the last
checkbox ticks* — which bundles verification rounds, remediation, final test
runs **and away-time** — and it is a mean. It is not close-out.

### 1.3 So what does cost

The first draft cut ~10 minutes of test time and some verification rounds,
and removed ~35% of the code. Against a **48-minute median work phase**,
that is real but modest — and **removing code helps the successor, not the
clock.** Those are different goals and the draft conflated them.

The one close-out signal that *is* actionable is not duration but
**failure**:

| close-out metric | value |
| :--- | ---: |
| total `closeout_failed` events | **183** |
| sessions with ≥1 failed close-out | **122 of 295 (41%)** |
| attempts per session (median / mean / max) | 1.0 / 1.6 / **9** |

Two in five sessions discover an unmet obligation *only when close-out
refuses*, then remediate and retry — up to nine times. That is a
discoverability defect, not a speed defect, and §7.3 addresses it.

---

## 2. Requirements this must satisfy

Operator-stated, and treated as constraints rather than options.

| # | requirement |
| ---: | :--- |
| R1 | Break a plan into **optional modules** and **session sets** with a **uniform spec structure**. Modules implementable in parallel; manual merges acceptable. |
| R2 | Tree displays **modules → session sets → sessions**, optionally task checklists, using the existing **not-started / in-progress / done** icons. If checklists are not in the tree, an instruction generates a **rolling checklist in chat**. |
| R3 | Support **Copilot CLI (indirect)** *and* **Direct API** orchestrators. **The system must know which is in use** — detect, confirm with the user, record durably, proceed. |
| R4 | **Cross-provider verification.** |
| R5 | **Sufficient test coverage**, with full suites run **immediately prior to commit, push, and close**. |
| R6 | Instructions to use the **dabbler-uat-checklist** for any required UAT work. |
| R7 | An **easy way to start the next session** of a given set in a module. |

---

## 3. What is retained, unchanged

### 3.1 Folder structure and the four artifacts

```
docs/
  modules.yaml                      # optional; absent = single implicit module
  modules/<slug>/project-plan.md
  session-sets/<NNN>-<slug>/
    spec.md                 # the plan + a machine-read config block
    session-state.json      # v4; Python is the ONLY writer
    activity-log.json       # what happened
    change-log.md           # what shipped, prose
```

**The writer rule stays absolute.** Python owns every mutation of
`session-state.json`. This is the invariant that prevents N−1/N display
drift and it is the most valuable rule in the current system.

### 3.2 On JSON vs. markdown for the spec (R1b)

The operator previously wanted a JSON spec to avoid parsing, and it was
rejected. **The existing design already resolves this and should be kept:**
`spec.md` carries a fenced **YAML config block** that is the *only* part
machines read —

```yaml
tier: full
requiresUAT: false
requiresE2E: false
uatStyle: ad-hoc
pathAwareCritique: advisory
prerequisites:
  - slug: 116-session-latency-and-verification-integrity
    condition: complete
```

— and prose that only humans and the orchestrator read. **No prose is
parsed for meaning.** A separate JSON file would split one document into
two that can disagree. Keep one file, one machine-read block.

**Uniformity (R1a) is an instruction, not code:** *"A session set has ≤4
sessions; a session has ≤5 steps; the config block is required and its keys
are fixed."* Set 111 S4 measured the reason — median session length doubles
at 6+ steps.

### 3.3 Both transports (R3)

| profile | orchestrator | provider keys |
| :--- | :--- | :--- |
| `copilot-cli` | authenticated Copilot CLI seat + its catalog | **none, by design** |
| `api` | Direct provider APIs | `DABBLER_*_API_KEY` required |

**Detection contract.** At session start the system:
1. **Detects** the transport (Copilot CLI present and authenticated → `copilot-cli`; else keys present → `api`).
2. **Confirms** with the user in one prompt.
3. **Records durably** in `session-state.json`'s per-session `orchestrator`
   block — the four fields `engine` / `provider` / `model` / `effort`, plus
   `identityProvenance`, written omit-null.
4. **Proceeds**, and never asks again for that session.

Most of this exists (`orchestrator_identity.py`, `copilot_preflight.py`,
`transport_diagnostics.py`, and the `orchestrator` block already written by
Set 116's sessions). **What is missing is the confirm-once-and-remember
step**; today the profile is config, not a confirmed observation.

---

## 4. Gates — three, and they already exist

Shipped by Set 116 S3 on 2026-08-10. Confirmed empirically:

```
BLOCKING : working_tree_clean, pushed_to_remote,
           verification_integrity, test_run_fresh, uat_walk_recorded
ADVISORY : activity_log_entry, next_orchestrator_present, change_log_fresh,
           checklist_posted, verification_method_vocabulary
```

| gate | refuses a close when | maps to |
| :--- | :--- | :--- |
| `verification_integrity` | a claimed verdict has no cross-provider evidence | **R4** |
| `test_run_fresh` | expensive suites touched by the session have no fresh green run | **R5** |
| `uat_walk_recorded` | a `requiresUAT` session closes with no walk and no attested waiver | **R6** |

Plus two **write-integrity preconditions** (`working_tree_clean`,
`pushed_to_remote`) — they protect the correctness of the record, not
discipline. Not gates, and not ceremony.

**No gate is added without deleting one.**

### 4.1 Gate machinery to delete

Unreachable from the close path; Set 116 S3 demoted but deliberately
deleted nothing:

| module | LOC |
| :--- | ---: |
| `contract_gate.py` | 1,158 |
| `floor_ratchet.py` | 792 |
| `replacement_gate.py` | 546 |
| `spec_admission.py` | 403 |
| `routed_gate.py` (retired Set 083; always exits 0) | 386 |
| **total** | **3,285** (~220 tests) |

---

## 5. Guidance — executable, one line, or gone

**The operator's rule, adopted:**

> A lesson must become **a code fix** or **a one-sentence instruction**, or
> it is **dropped**. The code fix is weighed against impact × likelihood of
> the consequence, versus the work involved.

This is already precedent — the archive records lessons *"encoded in
`ai_router/utils.py::detect_truncation`"*, *"encoded in
`router-config.yaml`"*, *"executable-gate-encoded in the `verify_session`
CLI"*. The rule makes the encoded outcome mandatory rather than optional.

### 5.1 The whole preload tier collapses

The operator's observation, which is correct and load-bearing:
**`project-guidance.md` exists as the destination of lesson promotions.**
If lessons become code or one-liners, there is nothing left to promote, so
project-guidance dissolves with them. The same treatment applies to
`session-constitution.md`.

| document | now | after |
| :--- | ---: | :--- |
| `session-constitution.md` | 3,978 tok | → code + one-liners; **deleted** |
| `project-guidance.md` | 3,499 tok | → code + one-liners; **deleted** |
| `lessons-learned.md` | 2,379 tok | → code + one-liners; **deleted** |
| `AGENTS.md` (+ CLAUDE/GEMINI) | 1,993 tok | **retained** — engine bootstrap |
| **preload total** | **11,849 tok** | **~2,000 tok** |

**This eliminates the ceiling problem entirely rather than tuning it.** The
earlier draft proposed removing the ratchet; with only the engine bootstrap
left, there is almost nothing to cap and the eviction mechanic that
manufactured two of three prose Majors in Set 116 S3 has no fuel.

### 5.2 Worked example — the five active lessons

| lesson | disposition |
| :--- | :--- |
| `L-064-9` `git diff` omits untracked files | **code** — evidence assembler appends `git status --short` |
| `L-075-1` a pin bump is not enablement | **code** — import smoke test + record resolved version at close |
| `L-112-1` a gate that only passes proves nothing | **code** — meta-gate requiring a planted-violation falsifier per pattern gate |
| `L-079-1` cp1252 at subprocess boundaries | **code** — lint for text-mode pipes and print-before-persist |
| `L-064-8` a replacement doc inherits stale claims | **one line** — *"When replacing a doc, re-verify every claim about current behavior against the code."* |

Four of five become code. One becomes a sentence. None remains prose.

### 5.3 Keeping code and instructions from growing without bound

The operator's concern is right: code and one-liners can accrete exactly
as prose did. Suggested mechanism, **split by artifact type**, because a
single "unused in 10 sets → drop" rule fails for gates:

**Executable checks — retain by cost, not by usage.**
A preventive gate that never fires is indistinguishable from a useless one
(this *is* `L-112-1`). So usage is the wrong metric:

- Every check ships with a **falsifier** proving it can fire (already required by `L-112-1`).
- **Cheap** (<1s, deterministic, no routed call): keep indefinitely. Free insurance, never expires.
- **Expensive** (routed call, or >10s): must fire at least once per 10 sets, or it is dropped.

This applies the operator's own impact × likelihood ÷ work rule to the
check itself.

**Instruction lines — retain by tally, with a hard cap.**

- Each line carries an id and a `last-used-set` trailer (the mechanism already exists: `cite_lessons`, `guidance_meta`).
- The orchestrator cites the ids it actually followed at close — one CLI call that already exists.
- **Unused in 10 sets → dropped automatically at the next set boundary.**
- **Hard cap: 20 lines.** At the cap, admitting one requires dropping one.

**The critical difference from the failed ceiling:** eviction happens
**only at a set boundary, deliberately, never mid-session**. The old
ceiling failed precisely because an orchestrator at 100% had to evict prose
*during* a session under time pressure — which is how the instruction to run
the path-aware critique was deleted and became the next round's Major.

**Default is deletion.** A new instruction line is admitted only with a
recorded reason why it could not be executable.

---

## 6. Work Explorer — the tree, and little else

### 6.1 Where the complexity actually is

| area | LOC | share |
| :--- | ---: | ---: |
| **`providers/` — the tree** | **3,034** | **12%** |
| `utils/` (moduleAuthoring 2,458, fileSystem 1,518, seatSetup 1,161, git, install) | 11,584 | 45% |
| `commands/` | 6,123 | 24% |
| `configEditor/` | 2,671 | 10% |
| `wizard/` + `dashboard/` | 905 | 4% |
| root + types | 1,274 | 5% |

**The part worth keeping is 12% of the extension.**

### 6.2 Retained (R2, R7) — confirmed by operator usage, 2026-08-10

A **read-only tree** over the JSON artifacts:

- **Hierarchy:** module → session set → session. (Modules collapse to a single implicit root when `modules.yaml` is absent.)
- **Icons:** the existing `media/{dark,light}/{not-started,in-progress,done,cancelled}.svg`.

**The context menus stay.** The operator names them *"hard won and currently
valuable."* Both submenus are kept whole:

| submenu | entries | why |
| :--- | :--- | :--- |
| **Open File** | `openSpec`, `openActivityLog`, `openChangeLog`, `openSessionState` | These are exactly the four retained artifacts (§3.1). The menu *is* the artifact contract, rendered. |
| **Copy Prompt** | `copyStartNextSessionPrompt` (**R7 — named as the most-used**), `copyStartNextParallelSessionPrompt`, `copySpecReviewPrompt`, `copySessionAccomplishmentsPrompt`, `copySetAccomplishmentsPrompt` | Hard-won and in daily use. An earlier draft proposed replacing four of the five with CLI output; **that is withdrawn.** |

**Click-a-set-to-open-the-spec stays.** Operator: *"I use that a lot."*
It is the tree item's default command and costs nothing to keep.

Plus `refresh`, `copySlug`, `activateSet`, `cancel`, `restore`.

**Demote to command-palette-only** (kept, but off the context menu — the
operator reports these were used for troubleshooting, not routine work):
`openOrchestratorWriterLog`, `openPrerequisiteSpec`, `revealPlaywrightTests`,
`migrate`, `migrateToV4`, `troubleshoot`.

**Task checklists: recommend keeping them OUT of the tree.** The step
ledger is the highest-churn, lowest-value surface in the extension — Set
115's operator notes record three defects observed live in a single day (a
completed step rendering as not-done, `<- here` on the wrong row, an
unplanned step ordered after a pending planned one). Replace with the
operator's own option (b): **an instruction to emit a rolling checklist in
chat.** Cost: one instruction line. Code: zero.

### 6.3 Removed, and what replaces it

| removed | LOC | replacement |
| :--- | ---: | :--- |
| `configEditor/` webview | 2,671 | edit `router-config.yaml` directly (already heavily commented) |
| `wizard/` + `dashboard/` | 905 | README + a Python scaffold CLI |
| `moduleAuthoring.ts` | 2,458 | `python -m ai_router.module` CLI — **pending §9.4** |
| **git/PR/release commands** (`openPrForSet`, `finalizeMergedSet`, `startHotfixFromTag`, `rollBackToTag`) | ~4,000 | **documented `gh` commands** — per the operator's note, these become user instructions |
| prompt-copy commands (4 of 5) | — | **WITHDRAWN** — see §6.2; all five stay on the Copy Prompt submenu |

**Parallel modules (R1c)** need no extension support: one worktree per
module (`~/source/repos/<repo>-worktrees/<slug>/`, the documented standard),
manual merges, `gh` for PRs.

### 6.4 Cost and pricing — mostly deletable, but not all of it

Operator, 2026-08-10: *"the whole cost calculations are not useful for
Copilot — so we don't need any of that."* The measurement agrees for that
seat: across **83 routed calls**, every row carries
`billed_usage_unavailable: true`, `input_tokens: 0` and `cost_usd: 0.0`.
Total recorded spend: **$0.00**.

But both transports run, on two machines, and cost is real on the `api`
one — so this needs a split rather than a blanket delete:

| module | LOC | tests | disposition |
| :--- | ---: | ---: | :--- |
| `pricing_proposal.py` | 1,398 | 110 | **delete** — a rate-fetching maintenance CLI; a Copilot seat has no rates to maintain |
| `cost_report.py` | 482 | 40 | **delete** — reporting over numbers that are structurally zero on the seat running most sessions |
| **`pricing.py`** | **344** | 65 | **KEEP — load-bearing.** Imported by `models.py`, `pull_verifier.py`, `config.py` and `__init__.py`; feeds model selection and the api-profile verifier's `max_cost_multiplier` guard (`__init__.py:1632`). Deleting it breaks the Direct API path. |
| `metrics.py` | 555 | 16 | **KEEP** — the routed-call ledger, and the evidence base for §10.1. Cost is one field among thirty. |

**Deletable: 1,880 LOC and ~150 tests**, without touching the api cost
guard.

**Rationale — this is the bus-factor fix.** The successor is not facing
"complex"; they are facing *complex in two languages with two test stacks*,
one of which is a VS Code extension with webviews, an Electron harness and
Playwright. Consolidating on Python plus a ~3k-line read-only tree changes
the ask to something a maintainer will accept.

---

## 7. What is guaranteed to improve, and what is not

The distinction the first draft failed to make.

### 7.1 Deterministic — these are bounds, not hopes

| change | mechanism | effect |
| :--- | :--- | :--- |
| **Total round budget per session** | one number, enforced on *every* path including the backstop (`evaluate_phase_bound` already exists) | caps the worst case; today's observed backstop rounds ran **5–10, 5–12, 5–7** |
| **Artifact cap per session** | refuse to create more than ~8 files per session | Set 116 carried **45 files** for 3 sessions; each is orchestrator work |
| **Preload collapse** (§5.1) | 11,849 → ~2,000 tokens; nothing left to evict | removes the mechanism that manufactured 2 of 3 prose Majors |
| **Close-out is one command** | `close_session` already runs gate checks + state flip idempotently | the 57 min is what happens *around* it, not inside it — see §7.3 |
| **Layer 3 shrink** | delete 9 webview scenarios of 35 | −~2.5 min |
| **Gate/guidance deletion** | −3,285 LOC gates, −~1,400 LOC guidance machinery | maintenance only |

### 7.2 Not guaranteed — genuine judgment calls

- **Cross-provider verification cost.** Bounded by the round budget, but a legitimate Critical finding *should* cost another round. This is the price of R4 and should not be optimized away.
- **The work itself.** Nothing here makes implementation faster.
- **Extension carve.** Buys maintainability and bus factor. It buys almost **no** session time.

### 7.3 Close-out failures — the real close-out cost

Close-out *execution* is a non-problem: **0.1 min median**. Close-out
*failure* is the problem: **41% of sessions (122 of 295) fail at least
once**, mean 1.6 attempts, max 9.

**Which check refuses** (212 check-failures across 184 events):

| failed check | count | share | status today |
| :--- | ---: | ---: | :--- |
| `verification_backstop` | **78** | 37% | blocking — **and each one is a routed call mid-close** |
| `working_tree_clean` | 41 | 19% | blocking (precondition) |
| `activity_log_entry` | 30 | 14% | **demoted to advisory, Set 116 S3** |
| `pushed_to_remote` | 29 | 14% | blocking (precondition) |
| `next_orchestrator_present` | 23 | 11% | **demoted, Set 116 S3** |
| `change_log_fresh` | 8 | 4% | **demoted, Set 116 S3** |
| `checklist_posted` | 3 | 1% | **demoted, Set 116 S3** |

Two conclusions fall straight out:

**Set 116 S3 already removed ~30% of this.** The four demoted checks account
for **64 of 212 failures** and can no longer block a close. That reduction
is banked and needs no further work.

**The remaining 148 are all preflightable, and the expensive ones most of
all.** `working_tree_clean` and `pushed_to_remote` (70 failures, 33%) are
`git status` and `git log origin/main..HEAD` — answerable in milliseconds.
`verification_backstop` (78 failures, 37%) fires when no verification round
exists for the session; that is knowable *before* close-out, and each firing
spends a routed call at close time — roughly **$40–70 of routed spend across
the dataset**, before counting the rounds that follow.

**Recommendation: a close-out preflight**, runnable at any time, that names
every unmet obligation in one shot. It would have pre-empted ~148 of 212
failures, including all 78 of the expensive ones. Paired with:

- **The backstop `discoveryBaselineTree` fix** — today a backstop-blocked close cannot reach `--phase remediation-review` (`verify_session.py:2945-2954` refuses with `EXIT_USAGE`), forcing a full ~$0.88 discovery round to re-enter the sanctioned path.
- **A hard artifact cap** — Set 116 carried **45 files** across 3 sessions; each is orchestrator work and a chance to miss one.

### 7.4 The honest summary

Against a **48-minute median work phase**, nothing in this proposal
transforms session time, and the document should not pretend otherwise.
What it does deliver, in confidence order:

- **Certain:** a smaller system a successor will accept (§6), fewer manufactured prose defects (§5.1), fewer close-out surprises (§7.3).
- **Likely:** 2–3 fewer routed rounds on prose-heavy sessions (§8 step 9).
- **Unproven:** any large reduction in median session time. The tails are dominated by away-time, which no code change touches.

---

## 8. Sequencing

| # | step | authority | guaranteed? |
| ---: | :--- | :--- | :--- |
| 1 | **Close-out preflight** — name every unmet obligation in one shot (§7.3) | self | **yes** — attacks a 41% failure rate |
| 2 | Collapse the preload to `AGENTS.md` (§5.1) | operator (deletes guidance) | **yes** |
| 3 | Encode the 5 lessons; adopt the §5.3 retention rules | self | **yes** |
| 4 | Total round budget + artifact cap | operator (verification) | **yes** |
| 5 | Backstop `discoveryBaselineTree` fix | self | **yes** |
| 6 | Delete the 5 unreachable gate modules | self | maintenance |
| 6b | Delete `pricing_proposal.py` + `cost_report.py` (§6.4) | self | maintenance — −1,880 LOC, −150 tests |
| 7 | Transport detect → confirm → persist (R3) | self | correctness |
| 8 | Add `evidencePaths` to findings | self | prerequisite |
| 9 | Cap doc-only findings at Minor | **operator** (reduces verification) | likely |
| 10 | Carve the extension to the tree (§6) | self | bus factor only |

Steps 1–3 are reversible and touch no contract. Step 10 is the largest and
should come **last** — otherwise it is executed under the slow loop it
exists to escape.

---

## 9. Open decisions

1. **How small should Layer 3 get?** Deleting webviews takes it 35 → 26; migrating model-level scenarios to Layer 2 could reach ~8–12. It cannot reach zero — `L-064-12` records a VSIX manifest defect only Electron caught. Set 117 S2/S3 should be re-scoped against the answer.
2. **Cap doc-only findings at Minor?** Operator-only; deferred until findings carry `evidencePaths`.
3. **Is `modules.yaml` / `moduleAuthoring` (2,458 LOC) actually used?** If modules stay optional and parallel work is worktrees + manual merges (R1c), most of this may be deletable rather than portable.
4. **Retention numbers** — 10 sets, 20 instruction lines, ~8 artifacts per session. Proposed, not measured. Adjust on evidence.

---

## 10. Estimate

### 10.1 Cross-provider verification on both transports — already done

**No implementation work.** Measured from `router-metrics.jsonl`: **76
routed `session-verification` calls, all on `transport: copilot-cli`**,
reaching openai (73), anthropic (2) and google (1) *through the Copilot
seat*, with **zero calls where the verifier's provider equalled the
orchestrator's**. `cli_transport.py` carries 64 tests.

The `api` profile is the default (`config.setdefault("profile", "api")`),
and Set 116 S1's close-out attestation records `verify_session` running it
four times with an openai verifier against an anthropic orchestrator.

**The two transports run on two machines** — this repo's checkout is the
Copilot CLI seat; the operator's work machine makes the Direct API calls.
That is why the local metrics file shows only `copilot-cli` rows, and it is
**not** evidence that the `api` path is unused. Both are live.

R3's only gap is **detect → confirm → persist** (step 7), not routing.

### 10.2 Basis and units

Estimates are in **sessions**, converted at **1.5–2.5 attended hours per
session**. Basis: measured **work-phase median 48.1 min** (n=283) plus
verification and close. **Wall-clock is not usable** —
`startedAt`→`completedAt` includes away-time, which is why two sessions on
record exceed 23 hours.

These are estimates, not measurements. This repo's own history shows
session plans drift; treat the high end as likely.

| # | step | sessions | note |
| ---: | :--- | :---: | :--- |
| 4+5 | Round budget, artifact cap, backstop baseline fix | **1** | small and localized; step 5 is a few lines |
| 6 | Delete 5 unreachable gate modules + the two cost modules | **1** | mechanical: −5,165 LOC, −370 tests |
| 9 | Cap doc-only findings at Minor | **1** | small code + operator attestation |
| 1 | Close-out preflight | **1–2** | reuses existing gate predicates |
| 7 | Transport detect → confirm → persist | **1** | most of it exists |
| 3 | Encode the 5 lessons + retention rules | **1–2** | 4 small fixes + the tally mechanism |
| 8 | `evidencePaths` on findings | **1–2** | schema + both surfaces + templates |
| 2 | Collapse preload to `AGENTS.md` | **2–3** | judgment-heavy, not code-heavy |
| 10 | Carve the extension to the tree | **3–5** | ~20k LOC out; replaced by Python CLIs |
| | **total** | **12–18** | **≈ 4–5 sets** |

### 10.3 Two phases

| phase | steps | sessions | attended hours | delivers |
| :--- | :--- | :---: | :---: | :--- |
| **A — the guaranteed wins** | 4+5, 6, 9, 1 | **4–5** | **6–13** | round bound, −5,165 LOC, doc-only cap, and a preflight targeting ~148 of 212 close-out failures |
| **B — the reduction** | 7, 3, 8, 2, 10 | **8–13** | **12–33** | preload 11,849 → ~2,000 tokens; extension 25.6k → ~5k LOC |

**Phase A is one set**, and it compounds: every session in Phase B then
runs under a bounded loop with a preflight, instead of the loop it exists
to escape. **Sequencing A before B is the highest-value scheduling
decision in this document.**

### 10.4 What would make this wrong

- **Step 10 is the least certain.** 25.6k LOC of TypeScript with ~1,587 tests. "Delete the webviews" is clean; rewiring `fileSystem.ts` (1,518 LOC) out of the deleted surfaces is not yet scoped (§9.3).
- **Step 2 is judgment, not typing.** Converting `session-constitution.md` and `project-guidance.md` into code and one-liners is exactly the prose work Set 116 S3 showed does not converge cheaply — which is why it should follow the doc-only cap (step 9), never precede it.
- **The estimate assumes the current pace.** It does not assume the improvements land first. If Phase A works, Phase B should come in at the low end.
