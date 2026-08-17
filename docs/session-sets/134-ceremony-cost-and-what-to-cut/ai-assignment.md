# AI Assignment Ledger — 134-ceremony-cost-and-what-to-cut

> Routed analysis (Step 3.5), never self-opined. Authored by
> `claude-sonnet-4.6` on the `copilot-cli` transport on 2026-08-17 via
> `route(task_type="analysis")` (tier 0, seat-metered, `cost_usd` 0.0 —
> the seat carries no per-call dollar figure; see `disposition.cost`).

> **Standing analyst defect — first set in five where it did NOT fire.**
> Sets 130–133 each recorded the step-3.5 analyst emitting model ids this
> router cannot call (`claude-3-opus-20240229`, `gemini-1.5-pro-latest`).
> This run was asked for a callable id *or* provider-and-family with an
> explicit statement of low confidence, and it took the second option
> unprompted in every row. The recommendations below therefore name
> **provider + family**, which is the actionable half and is what the
> router enforces anyway: an anthropic orchestrator is verified by google
> or openai, never by itself. The router-side fix remains an owed
> follow-on, but the defect is no longer reproducing on every set.

---

## Session 1: Attribute the 2.3×

### Recommended orchestrator

anthropic / current flagship family @ effort=medium

### Rationale

Session 1 is entirely data-analysis and synthesis over committed artifacts
(`activity-log.json`, changelog fragments, session-set docs) — no file writes
except the final measurement document. Anthropic's current flagship family
handles multi-document numerical attribution well at medium effort, and its
extended context window is needed to hold 219-session log data alongside the
spec's methodology paragraph.

### Estimated routed cost

low-to-moderate (~$1.50–$3.00)

| Step | Route | Model |
|------|-------|-------|
| 1. Register | `operator-execute` | — |
| 2. Re-derive all numbers from `activity-log.json`; per-step interval breakdown | `routed-analysis` | anthropic / current flagship family |
| 3. Date each rise against changelog/set history | `orchestrator-execute` | — |
| 4. Name reduction candidates with measured minutes, consequence, owner | `orchestrator-execute` | — |
| 5. Cross-provider verification | `verifier-execute` | google / gemini-2.5-pro family |
| 6. Required portion of full test suite | `operator-execute` | — |
| 7. Close-out | `operator-execute` | — |

> Step 2 is routed because re-deriving 219-session statistics from raw JSON
> logs and producing an attributed breakdown is classification + arithmetic
> synthesis — not mechanical file editing. Steps 3 and 4 are
> `orchestrator-execute` because they are interpretive reasoning over the
> numbers Step 2 produces, exercising standing knowledge of the set timeline;
> a second routed call would be cost without benefit.

### Actuals

```yaml
sessionID:
orchestrator:
cost:
stepRuntimes:
findings:
```

**Next-session orchestrator recommendation (Session 2):**
anthropic / current flagship family @ effort=medium.
Rationale: Session 2 is discrimination testing over structured JSON envelopes
and a journaled decision — same synthesis shape as Session 1, same provider.

---

## Session 2: Does severity still carry information?

### Recommended orchestrator

anthropic / current flagship family @ effort=medium

### Rationale

Session 2 combines quantitative analysis over ~680 structured findings with a
consequential journaled decision (a/b/c call) and a small, surgical code edit
(closed-vocabulary writer). The quantitative and decision work fits the same
synthesis shape as Session 1; the code edit (Set 120 pattern, already proven)
is mechanical enough that medium effort covers it without needing to step up.

### Estimated routed cost

moderate (~$2.00–$3.50; the severity-distribution analysis over all envelopes
will be the dominant call)

| Step | Route | Model |
|------|-------|-------|
| 1. Register | `operator-execute` | — |
| 2. Measure severity distribution, by-round, by outcome | `routed-analysis` | google / gemini-2.5-pro family |
| 3. Decide defect type; journal via `decision_journal` | `orchestrator-execute` | — |
| 4. Apply Set 120 closed-vocabulary pattern to severity writer + tests | `orchestrator-execute` | — |
| 5. Cross-provider verification | `verifier-execute` | google / gemini-2.5-pro family |
| 6. Required portion of full test suite | `operator-execute` | — |
| 7. Close-out | `operator-execute` | — |

> Step 2 is routed to **google** (cross-provider from the anthropic
> orchestrator) to surface any discrimination signal the orchestrator's
> provider framing might suppress — the whole question is whether 92% Major
> is an accurate signal, so the analysis should not be produced by the same
> provider that will act on it. Step 3 stays `orchestrator-execute` because
> the decision logic (a/b/c) is the orchestrator's synthesis of Step 2's
> output; routing it again would add cost and latency without independence
> benefit. The verification at Step 5 is the required cross-provider check on
> the code change at Step 4.

### Actuals

```yaml
sessionID:
orchestrator:
cost:
stepRuntimes:
findings:
```

**Next-session orchestrator recommendation (Session 3):**
anthropic / current flagship family @ effort=medium.
Rationale: Session 3 executes cuts justified by Sessions 1–2; the same
context-holding and reasoning capability is needed to work the candidate list
and report the net accurately.

---

## Session 3: Cut, on the evidence

### Recommended orchestrator

anthropic / current flagship family @ effort=medium

### Rationale

Session 3 takes the cuts Sessions 1 and 2 justify — deletions, parameter
changes, and document edits only, no new modules. The work is applying
measured findings to specific files and reporting the net accurately; medium
effort at the same provider maintains context continuity across the three
sessions and handles the re-measurement pass (Step 3) without needing to step
up effort.

### Estimated routed cost

low-to-moderate (~$1.00–$2.50; the dominant call is the re-run of the Session 1
instrument over Sessions 1–2's own `activity-log.json` entries)

| Step | Route | Model |
|------|-------|-------|
| 1. Register | `operator-execute` | — |
| 2. Take justified cuts (deletions / param changes / doc edits) | `orchestrator-execute` | — |
| 3. Re-run Session 1 instrument over this set's own sessions | `routed-analysis` | anthropic / current flagship family |
| 4. Report net (lines, ceremony minutes, obligations retired) | `orchestrator-execute` | — |
| 5. Cross-provider verification | `verifier-execute` | google / gemini-2.5-pro family |
| 6. Required portion of full test suite | `operator-execute` | — |
| 7. Close-out | `operator-execute` | — |

> Step 2 is `orchestrator-execute` because the cuts are mechanical application
> of a pre-built candidate list to specific files — no open-ended analysis.
> Step 3 is routed because running the measurement instrument neutrally over
> the set's own sessions is the same analysis shape as Session 1 Step 2, and
> the result must be credible as an independent check. Step 4 is
> `orchestrator-execute` because it is a rendering of Step 3's output plus git
> diff line counts — no reasoning delegation needed. Any cut that would make
> the verification loop stop earlier is operator-owned per the spec; the
> orchestrator surfaces it as an education-mode brief, never takes it.

### Actuals

```yaml
sessionID:
orchestrator:
cost:
stepRuntimes:
findings:
```

### Revision 1 refresh (routed at Session 3's own Step 3.5, 2026-08-17)

The table above predates Revision 1's re-scope from minutes to context; its
Step 3 `routed-analysis` row is **withdrawn**. Re-routed to
`claude-sonnet-4.6`, which returned the recommendation this session followed:

| Step | Route | Model |
|------|-------|-------|
| 2. Measure context footprint; cut the preload | `orchestrator-execute` | — |
| 3. Cut the per-session ceremony | `orchestrator-execute` | — |
| 4. Report the net; measure this set's own footprint | `orchestrator-execute` | — |
| 5. Cross-provider verification | `verifier-execute` | google or openai / current flagship family |

> **Routed verbatim:** *"Steps 2, 3, and 4 must NOT be routed. […] a routed
> analysis call to count lines the orchestrator can count itself would be
> self-refuting on the set's own stated premise."*

Step 5 is exempt — its purpose is independence, not analysis cost.
Orchestrator retained at anthropic / current flagship family; effort raised to
**high**, because Steps 2–3 mutate the files they measure.

**Next-set recommendation (set-terminal, routed):** **do product work next —
stop measuring the framework.** The analyst rejected both
framework-introspection candidates unprompted:

| candidate | verdict | why |
| :--- | :--- | :--- |
| `135-stepkey-vocabulary-and-cost-attribution` | rejected | ships measurement infrastructure "the operator explicitly does not want more of, in service of an attribution that already failed to hold up" |
| `135-loop-gate-signal-proposal` | rejected | "a full session set to produce a document is ceremony by another name" |
| **product work — an `ai_router` release, or the extension carve** | **recommended** | the open residuals are "a gitignored script that needs committing and an operator decision that needs making. Neither requires a session set." |

> **Routed verbatim:** *"The extension carve has been deferred for at least
> three sets; it is still correctly scheduled last — but 'correctly scheduled
> last' should eventually mean 'doing it now.'"*

The feature choice is the operator's.

---

## Analyst's own notes on the assignment (routed, verbatim)

1. **Session 2 Step 2 is routed to google, not anthropic.** The spec
   explicitly asks whether 92% Major is accurate — that question should not
   be analyzed by the same provider that will act on the answer. This is
   within the cross-provider verification constraint (the *verifier* route at
   Step 5 also uses google, which is acceptable because Step 2 and Step 5 are
   independent invocations serving different purposes).
2. **No specific model IDs are asserted.** The standing defect (four sets
   running) is that the routed analyst emits non-callable IDs. Per the
   established practice in Set 133's ledger, provider + family is given
   instead.
3. **Anything that shortens the verification loop is `operator-execute`
   throughout** — the spec makes this explicit and it is reflected in every
   session's Step 5 and in the rationale for Session 3 Step 2.
