# Session 2 — Does severity still carry information?

> **The answer is no, and the reason is not the one the spec expected.** The
> 92% Major figure **reproduces exactly** — unlike Session 1's 2.3×. But
> severity is not a judgment that has drifted toward Major. It is a field the
> reviewer template **forbids from taking the discriminating value**, shipped
> deliberately by Set 071 on 2026-06-18 and hardened by Set 096 on 2026-07-12.
> The verifier is following its instructions. The gate that reads the field is
> re-reading a decision the template already made.

**Method.** Five read-only instruments, run from the session workspace
(`~/.copilot/session-state/<id>/files/`), never in the repo — the set's
no-new-module rule. Every input is a committed artifact; nothing here depends on
a gitignored file (the Session 1 Round-1 Major). Every number below is
reproducible from a fresh checkout.

---

## 0. The classifier, stated before any number is quoted

Session 1's headline died on method choice. So this session states its
classifier first, and reports every sensitivity variant it was tested under.

| choice | this session's rule |
| :--- | :--- |
| **corpus** | every file matching `docs/session-sets/**/s*-issues*.json` |
| **finding** | one object in the envelope's `issues` array |
| **canonical severity** | `{Critical, Major, Minor}`, compared case-insensitively after `strip()` |
| **non-canonical** | everything else, **including an absent key** — reported as such, never coerced |
| **blocking** | `ai_router.verification.is_blocking_issue`, the **production predicate the loop consults** — not a re-implementation |
| **round-level blocking** | `ai_router.verification.classify_blocking`, likewise production |

Two counting decisions worth naming, because they are where a re-derivation
could go wrong:

- **Fan-out does not double-count.** Discovery rounds fan out to 2 calls, but
  both calls' findings are merged into one envelope and tagged `discoveryCall`;
  there are no `-fanout-` issue files. Filename shapes are only
  `sN-issues.json` (130) and `sN-issues-round-N.json` (285).
- **The plain file is not a duplicate of round 1.** Zero sets carry both a
  plain `sN-issues.json` and an `sN-issues-round-1.json` for the same session;
  128 of the 130 plain files carry `verificationRound: 1`.

---

## 1. The 92% — CONFIRMED

**415 envelopes, 771 findings** (the spec counted 378 / 680 on 2026-08-15; the
corpus has grown since).

| severity | count | share |
| :--- | ---: | ---: |
| **Major** | **715** | **92.7%** |
| Minor | 21 | 2.7% |
| Critical | 7 | 0.9% |
| non-canonical (incl. 9 absent) | **28** | 3.6% |

**92.7% Major.** The spec claimed 92%. It reproduces, and it is robust:

| variant | Major share |
| :--- | ---: |
| all findings, no dedup | 92.7% |
| dedup identical descriptions within a session (removes 1) | 92.7% |
| excluding the 2 non-schema envelopes | 92.7% |

The non-canonical count is **exactly 28**, the figure the spec named. This is
the first headline in three consecutive sets to survive re-derivation intact.

> **Session 1's carry-forward is discharged.** The premise was as unverified as
> the 2.3× was; unlike the 2.3×, it holds. Everything below rests on a number
> that was checked first.

---

## 2. Severity by round and by phase — it gets *less* informative, not more

| round | n | Critical | Major | Minor | non-canon | Major % | `is_blocking_issue` |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 358 | 5 | 318 | 20 | 15 | 88.8% | 93.9% |
| 2 | 119 | 1 | 113 | 1 | 4 | 95.0% | 99.2% |
| 3 | 84 | 0 | 81 | 0 | 3 | 96.4% | **100.0%** |
| 4 | 59 | 0 | 56 | 0 | 3 | 94.9% | **100.0%** |
| 5+ | 149 | 1 | 145 | 0 | 3 | 97.3% | **100.0%** |

**From round 3 onward the gate has never once returned "stop".** Not rarely —
never, across 292 findings.

| phase | n | Major % |
| :--- | ---: | ---: |
| discovery | 258 | 98.4% |
| supplementary | 61 | **100.0%** |
| remediation-review | 98 | **100.0%** |
| pre-phase (before Set 096) | 354 | 85.3% |

The phased loop shipped in Set 096. **Every finding written under it in the two
phases that decide whether the loop continues is a Major.**

---

## 3. The decisive measurement — what the field has actually decided

The Step 7 gate is *"only a Critical/Major finding continues the loop."* That
sentence only does work if some rounds are stopped **by it**. From the 70
committed round ledgers (`sN-rounds.jsonl`, 249 `round-completed` rows):

| what ended the round | rounds |
| :--- | ---: |
| `ISSUES_FOUND`, blocking → loop continues | 130 |
| `VERIFIED` (no findings at all) → loop ends | **106** |
| `ISSUES_FOUND`, non-blocking, loop continued anyway | 12 |
| `ISSUES_FOUND`, non-blocking, loop ended | **1** |

- **106 of 107 loop terminations came from a round that reported nothing at
  all.** The loop ends when the verifier is empty-handed, not when severity
  says stop.
- **12 of the 13 non-blocking rounds are `supplementary` rounds with zero
  findings**, which by protocol never end a loop. They are not the gate
  discriminating; they are empty rounds.
- **The severity field has changed the course of exactly one round in the
  entire corpus.** That round is
  `113-narrated-video-walkthroughs/s3` round 1 — and two things about it matter:
  1. The deciding "Minor" was **not written by a verifier**. The findings were
     `{Critical: 1, Major: 1}`; the Set 119 **doc-only cap** demoted them
     because every path they cited was documentation.
  2. **It did not stop anything.** The ledger shows round 2 (discovery) ran
     next and blocked, and the session went to four rounds and ~52 minutes.

> **In 249 ledgered rounds, the severity field has never once shortened a
> session.**

Corpus-wide, `classify_blocking()` says **continue on 406 of 413 rounds
(98.3%)**, and the doc-only cap has fired **twice, ever**.

---

## 4. There is almost nothing left for the field to discriminate *with*

| | |
| :--- | ---: |
| explicit Minor findings, corpus-wide | **21** |
| sessions that produced at least one | 12 of 135 |
| of those 21, ones sharing an envelope with a blocking finding (label changed nothing) | 12 |
| of those 21, ones in an all-Minor envelope (label mattered) | **9** |
| Minors in rounds 2+ | **1** |
| **the last Minor a verifier assigned** | **Set 082, committed 2026-07-06** |
| sets that have produced findings since | **49** |
| findings since | **698** |
| Minors among them | **0** |

**In the ledger era — Set 111 onward, the entire window in which the bounded
loop has existed — the field takes two values across 281 findings: Major
(98.6%) and Critical (1.4%). Both block.**

Information content:

| | bits |
| :--- | ---: |
| Shannon entropy of the severity field, 771 findings | **0.511** |
| Shannon entropy of the gate's own answer | **0.194** |
| a four-valued field with equal mass would carry | 2.000 |
| a constant carries | 0.000 |

---

## 5. Does severity predict which findings changed the outcome? No — if
anything it points the wrong way

Three independent outcome surfaces exist on disk. None of them is the loop's own
blocking decision, which would be circular (`is_blocking_issue` *is* severity).

**5a. `resolution_status` — did the finding produce a change?** (73 findings
carry it)

| severity | n | ended as `fixed` |
| :--- | ---: | ---: |
| Major | 36 | **77.8%** |
| Minor | 21 | **90.5%** |
| non-canonical | 12 | 66.7% |

**The Minors were more likely to produce a change than the Majors.** Small n,
and drawn from a non-random subsample of sets — but the field is not merely
uninformative here, it is mildly *anti*-informative.

**5b. The acceptance harness** — 225 results across 108 files:

- **80.4% of shipped acceptance criteria are `judgment`-kind**, never
  machine-decidable.
- **12 findings in the entire corpus were auto-closed by their own criterion.**
- 222 of 225 harness rows are Major. The instrument built to settle findings
  objectively sees one severity too.

**5c. What the loop returns** — 535 `fixVerdicts`:

| verdict | n | share |
| :--- | ---: | ---: |
| `fix-accepted` | 301 | 56.3% |
| `duplicate-of` | 122 | **22.8%** |
| `fix-rejected` | 89 | 16.6% |
| `accepted-with-modification` | 23 | 4.3% |

| round | n | fix-accepted | fix-rejected | duplicate-of |
| ---: | ---: | ---: | ---: | ---: |
| 3 | 199 | 52.3% | 22.6% | 20.6% |
| 4 | 178 | 59.6% | 12.9% | 23.0% |
| 5+ | 151 | **59.6%** | 11.3% | 25.2% |

**This cuts against the easy story and is reported as such.** Later rounds are
**not** low-yield: round 5+ accepts fixes at the same rate as round 4 and a
higher rate than round 3. The findings the loop is grinding on are largely
real. What is *not* real is the claim that severity is selecting them — one
finding in five is a duplicate of one already raised, and the share **rises**
with round depth.

---

## 6. The cause, dated from the template itself

The spec supposed the rubric had drifted. It has not. The vocabulary was
**closed by instruction, in the direction of Major, on purpose:**

`ai_router/prompt-templates/verification.md`, line 93:

> **Severity:** Critical / Major (a blocking Issue is never Minor — Minor goes
> under NITS)

| landed | set | what it did |
| :--- | :--- | :--- |
| **2026-06-18** | Set 071 S1 | shipped the materiality / anti-nitpick layer and the *"a blocking Issue is never Minor"* clause into both reviewer templates |
| **2026-07-12** | Set 096 S1 | consequence rubric v3, `failureScenario` **mandatory** per blocking Issue, NITS section reinforced |

The template does not offer `Minor` as a severity an Issue may carry. Minor
findings are routed to a **NITS** section that the parser does not read as
Issues at all. So an `sN-issues*.json` envelope is *structurally incapable* of
carrying a non-blocking severity from a compliant verifier.

The measured history matches the instruction exactly:

| era | n | Major % | Minors |
| :--- | ---: | ---: | ---: |
| ≤ 062, before any rubric work | 16 | 87.5% | 1 |
| 063–094, pre consequence rubric | 223 | 77.6% | **20** |
| 095–096, consequence rubric lands | 61 | **100.0%** | 0 |
| 097–118 | 361 | 98.9% | **0** |
| 119–133, after the doc-only cap | 109 | **100.0%** | **0** |

**Every sharpening of the rubric reduced the field's variance.** That is not a
side effect — it is what an anti-nitpick filter is for. A verifier told not to
report immaterial things reports only material things, and material things are
Majors. The severity field is downstream of a threshold that already made the
call.

---

## 7. The defect, named

The spec asks for **exactly one** of three.

### (a) The rubric under-discriminates and should be sharpened — **REFUTED**

Sharpening is what produced the present state. Before the consequence rubric:
77.6% Major, 20 Minors. After: 98.9–100% Major, **zero** Minors in 49 sets and
698 findings. Sharpening again can only move the field further toward a
constant. This option is not merely unattractive; the data says it is
backwards.

### (c) Neither — the findings are genuinely material and the cost is the honest price — **PARTLY TRUE, AND INSUFFICIENT**

The materiality half survives contact with the data, and §5c says so plainly:
the loop accepts fixes at ~56–60% at every round depth, including round 5+.
This is **not** a machine grinding on nothing.

But (c) as written also claims *"92% Major is accurate"* in the sense that the
gate is doing its job. It is not. A gate whose input has taken one blocking
value for 281 consecutive findings, and which has changed the course of one
round in 413 — via a value its own doc-only cap wrote — is not pricing a
guarantee. It is a no-op sitting in front of a loop that is doing the real work
for other reasons.

### (b) The gate reads the wrong signal — **THIS IS THE DEFECT**

> **"Only a Critical/Major finding continues the loop" is, in this corpus,
> operationally identical to "any reported finding continues the loop" — which
> is what the machinery does anyway.** The reviewer template already made the
> continue/stop decision when it decided what was worth reporting as an Issue.
> The gate re-reads that decision from a field that cannot disagree with it.

Evidence, in one place:

1. The template forbids the non-blocking value (§6, dated to Set 071).
2. 0 Minors in 698 findings across 49 sets (§4).
3. 0.511 bits in the field; 0.194 in the gate's answer (§4).
4. 100% blocking from round 3 onward (§2).
5. One round's course changed, ever — by the doc-only cap, and it did not stop
   the session (§3).
6. 106 of 107 loop terminations came from a round with **no findings** (§3).
7. Severity does not predict which findings produced a change; on the only
   surface that records it, the ordering is inverted (§5a).

**What this does not license.** Naming the defect is a diagnosis and is the
orchestrator's call. **Every remedy that would make the loop stop earlier is a
verification reduction and is the operator's decision** under the set's hard
carve-out — and this session proposes none. The remedy is surfaced as an
education-mode brief with the measurement attached, in `decisions.jsonl` and in
the disposition, and Session 3 may not take it without an operator ruling.

**What is worth stating for whoever does decide.** The operative signal already
in use is *presence of findings*, and the corpus contains a candidate the gate
could read that actually varies: **`duplicate-of` is 22.8% of fix verdicts and
rises with round depth (20.6% → 23.0% → 25.2%)**. That is a measured,
non-constant quantity about whether a round is still learning anything. It is
named here as evidence, not proposed as a change.

---

## 8. Closing the vocabulary — what Step 4 shipped, and what it could not fix

**The verifier-written drift has already stopped.** All 28 non-canonical values
were written between **2026-07-02 and 2026-07-10**, across sets 077–087. None
since — 698 findings, 49 sets, zero. The prose-in-the-field examples the spec
quotes (`"Unspecified (treated as blocking per the anti-laundering rule)"`,
`"Major (claimed)"`) are a **closed historical episode**, not a live leak.

**But nothing prevents it recurring, and two live sources remain**, both fixed
here:

1. **The machinery writes a non-canonical token today.** Three production sites
   wrote `"severity": "unknown"` — `verification.py` and `verify_session.py`
   (×2). That sentinel is a *second spelling* for something an absent key
   already says: `is_blocking_issue` blocks on both, identically. Two spellings
   for one meaning is the exact defect Set 120 S1 named for step status. Fixed
   by **removal** (project-guidance G-005): the key is omitted, and every
   reader's behaviour is byte-for-byte unchanged.
2. **A shipped template offered a token no reader knows.**
   `ai_router/prompt-templates/task-prompts.md` offered
   *"Critical / Major / Minor / Suggestion"* — and `Suggestion` is one of the 28
   values on disk. Removed.
3. **The pull surface's `submit_verdict` tool schema declared
   `severity: {"type": "string"}`** with no enum, so a structured tool call
   could carry anything. Closed to the canonical three.

The Set 120 S1 shape is now on `ai_router/verification.py` beside the
`BLOCKING_SEVERITIES` it already owned — `CANONICAL_SEVERITIES`,
`is_valid_severity`, `suggest_severity`, `validate_severity`,
`require_severity`, `InvalidSeverityError` — plus one function Set 120 did not
need, `canonical_severity_for_write`. Readers are left lenient about the 28
values already committed, and hints are advisory only: they never normalize on
the way to disk, because silently rewriting a verifier's `"High"` into
`"Major"` would be laundering in the permissive direction. No new module; the
vocabulary lives in the module that already owned the severity predicates.

### 8a. What round 1 of verification corrected, and the general lesson

The first draft applied Set 120's pattern **literally**: the envelope writer
called a raising `require_severity`. Cross-provider verification returned that
as a **Major**, and it was accepted without argument, because the safety
argument had a hole:

> The raw `sN-verification*.md` is written before parsing, so no paid output is
> lost — **but `write_issues_artifact` runs before `record_round_completed`,
> `resolve_round` advances on raw-artifact existence, and the cross-round
> ledger reads only `sN-issues*.json`.** A raise therefore left a paid blocking
> finding in a raw-only, unledgered round that the next invocation skipped.

A vocabulary meant to close an anti-laundering hole had opened one. The fix
refuses the **token, not the round**: `canonical_severity_for_write` returns
the canonical spelling or `None` (omit the key), the envelope is *always*
written, and the refusal is **exactly blocking-preserving** — `"major"` /
`"High"` / `"unknown"` / prose all omit and still block; `"minor"` becomes
`"Minor"` and stays a nit. The equivalence is asserted token by token in
`ai_router/tests/test_severity_vocabulary.py`, and an end-to-end test drives a
full round with `Severity: major` and asserts the round reaches the ledger.

> **The transferable lesson, and it is not about severity.** *A refusal is only
> cheap where the caller can retry for free.* Set 120's `require_step_status`
> refuses an orchestrator running a CLI — re-run it, nothing is lost. The same
> shape inside a paid, stateful, bounded loop does not refuse a value, it
> **destroys a transaction**. Porting a known-good pattern means porting its
> preconditions too, and this one's precondition was invisible until a
> different provider looked at it.

Round 1's second Major was the same defect one surface over: the
`submit_verdict` **enum is a declaration to the provider, not an
enforcement**, so a binding that ignored it could still submit `"major"` and
`_parse_verdict` would copy it through `Finding.to_dict()` onto disk. The
producer path now canonicalizes on the same terms, and never raises — a paid
agentic critique must not be discarded over a token.

**One thing deliberately not done.** `_parse_issue_blocks` reads untrusted model
output and is **left tolerant**, as is `docs/session-issues.schema.json`
(`severity: {"type": "string"}`), which must keep validating the 28
non-canonical envelopes already committed. The raw `sN-verification*.md`
artifact preserves the verifier's words verbatim regardless; the constitution
forbids editing it.

---

## 9. Carry-forward to Session 3 — the `stepKey` candidate, costed

Session 1 found the same open-vocabulary defect in a **third** field: **1,427
distinct `stepKey` values**. The spec asks whether closing it is the same shape
of fix.

**It is the same shape, and it is worth doing — but not for the same reason.**

| | severity (this session) | `stepKey` (Session 3 candidate) |
| :--- | :--- | :--- |
| shape of fix | closed enum + `require_*` chokepoint at the writer | identical |
| host module | `verification.py` (existing) | `session_log.py` (existing — already hosts `require_step_status`) |
| minutes returned | 0 | **0** (Session 1: "returns ZERO minutes") |
| what it buys | a gate input that cannot silently drift | a corpus that can be grouped by step — the reason Session 1's by-step-key breakdown **could not be produced at all** |

**Costed for Session 3 under its re-scope (context, not minutes):** the fix is
one enum plus one chokepoint in a module that already has the pattern —
mechanically ~40 lines. It returns **no minutes** and Session 1 correctly kept
it off the minutes list. Under Revision 1's context framing it is a
**measurement-integrity** candidate, not a context cut, so it does not compete
with the preload work for Session 3's step 2 budget. **Recommendation: record
it as a residual with a named owner, not as a Session 3 cut** — Session 3's
non-goals explicitly bar "closing `stepKey` and re-measuring" as a route to
rescuing the 2.3×, and its own budget is for deletions that shrink context.
This session did **not** widen to take it, as instructed.

---

## 10. Sources — all committed

| artifact | what it gave |
| :--- | :--- |
| `docs/session-sets/**/s*-issues*.json` | 415 envelopes, 771 findings, the severity field |
| `docs/session-sets/**/s*-rounds.jsonl` | 70 ledgers, 249 rounds, `blocking` / `endedLoop` |
| `docs/session-sets/**/s*-acceptance-round-*.json` | 108 files, 225 acceptance results |
| `ai_router/verification.py` | `is_blocking_issue`, `is_doc_only_issue`, `classify_blocking` — run, not re-implemented |
| `ai_router/prompt-templates/verification.md` | the instruction that closes the vocabulary |
| `git log -S` | the dating of Set 071 S1 (2026-06-18) and Set 096 S1 (2026-07-12) |

**No gitignored file was read, and no conclusion here depends on one.**
Session 1's blocking Major does not have a sibling in this document.
