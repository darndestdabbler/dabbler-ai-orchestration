# AI Assignment — 110-work-explorer-native-treeview

## Session 1 of 4 — Decide with good advice, and measure before committing

- Orchestrator: claude / anthropic / claude-opus-5 / high (operator-invoked;
  picked up automatically after Set 109 closed, per a standing operator
  instruction to poll and proceed).
- Routed step-3.5 analysis: [`s1-ai-assignment-analysis.json`](s1-ai-assignment-analysis.json)
  (route `task_type=analysis`, excl. anthropic → `gemini-2.5-pro`, $0.0091,
  truncation-clean, `served_model_mismatch: false`).
- Set-level facts carried from the spec (immutable at runtime): **Full tier**,
  `requiresUAT true` (**S4** walks it; S1 neither arms nor runs it),
  `requiresE2E true` (L-064-12 arms at full strength — this *is* the
  Explorer-rendering surface — but **S1 changes no shipping code**, so the
  Layer 3 obligation lands on S2–S4, not here), `pathAwareCritique advisory`
  (set-terminal, in S4). Prerequisite `109-model-registry-and-pricing-truth`
  confirmed `complete` before registration.
- **Budget note, by source.** This session spent **$0.1514** of `DABBLER_*`
  provider credit: one routed analysis ($0.0091), two routed panel seats
  ($0.0367 Sonnet 5, $0.1056 GPT-5.6 Sol), plus verification. The Opus 5 panel
  seat cost **$0** because the operator ruled that the orchestrator *is* Opus 5
  and need not be routed to. **Zero Copilot seat capacity** was consumed.

### Routing plan

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; preload; keys; confirm the 109 prerequisite. | Orchestrator direct — bootstrapping. |
| 3.5 | Assignment analysis + next-orchestrator / next-set recommendations. | **Routed** (`analysis`) — repo rule: never self-opine on model choice. |
| 2 | Re-run the architecture panel on the corrected registry. | **Routed** (`architecture`) ×2 with `prefer_model`, **plus the orchestrator's own written opinion** as the Opus 5 seat, committed before the routed ones were read. |
| 3 | Measure startup cost at four scales. | Orchestrator direct — **execution, not reasoning**. Timings are facts; asking a model to estimate them would substitute recall for evidence. |
| 4 | Spike `contributes.submenus`, `"group": "inline"`, lazy `getChildren`, and the operator's status SVGs. | Orchestrator direct — a real Extension Development Host answers these; a model would only recite documentation the spec explicitly refused to trust. |
| 5 | Put the density trade to the operator. | **Human only** — never consensus-eligible. |
| 6 | Write `s1-migration-decision.md`. | Orchestrator direct — synthesis of the above. |
| Verify | Phased `verify_session` for this set. | **Routed** — `session-verification`, anthropic auto-excluded per the no-skip mandate. |
| Close | `disposition.json`; commit + push; `close_session`; notify. | Orchestrator direct — mechanics. |

### The routed analyst's forward-looking recommendations

**Orchestrator assignments for S2–S4** (recorded as advice; the operator
assigns):

| session | recommended | analyst's reasoning |
| :--- | :--- | :--- |
| S2 | `codex` / gpt-5.6-sol | greenfield implementation against a typed SDK; wants precise idiomatic TypeScript |
| S3 | `claude` / opus | ~2k lines of deletion plus a test-suite rewrite from DOM assertions to provider assertions; wants reasoning about code *intent* |
| S4 | `gemini` / gemini-3.1-pro-preview | human-centric walk, triage, UAT checklist, CHANGELOG |

On within-set independence the analyst declined the premise: *"select
orchestrators based on task suitability rather than mandating maximum provider
diversity"*, on the grounds that mandatory cross-provider verification already
mitigates shared blind spots.

**Two caveats the operator should weigh before adopting any of this.**

1. **These are engine-seat costs, not `DABBLER_*` key costs.** Running S2 on
   `codex` or S4 on `gemini` means driving those CLIs as the orchestrator,
   which draws on whatever subscription backs them — a different budget from
   the API keys this session spent, and one the operator has recently been
   cutting back. An all-`claude` set spends nothing extra.
2. **S3's recommendation is the one worth taking seriously on its merits.**
   S3 is the session all three panelists called riskiest, and it is a deletion
   plus a behavioural-spec re-expression rather than greenfield authoring.

**Candidate next session set.** The analyst proposed
`111-core-router-registry-hardening` — the owed `route()`-side model-id
validation, `pull_verifier._pricing_for`'s fail-open on unknown ids, and the
two redundant identity-only registry entries. That is a coherent set and all
three items are genuinely owed.

**This session surfaced a second, stronger candidate the analyst could not have
known about:** the Explorer's empty-tree cost is ~102 ms of blocking host work,
essentially all of it a synchronous `git worktree list` subprocess inside
`discoverRootsWithFamilies()`, run twice per refresh. It is the actual cause of
the operator's original complaint, Set 110 explicitly does **not** fix it, and
it is now backed by a measurement rather than a hunch. See
[`s1-migration-decision.md`](s1-migration-decision.md) §2.

### Where this session departed from the routed analysis

The analyst's **risk prediction was exactly right** and deserves the credit:

> *"The performance measurement incorrectly attributes startup latency to the
> legacy webview renderer when the true bottleneck is the underlying
> data-gathering filesystem scan. A 'go' decision would then be made on a false
> premise."*

The measurement bore this out — with a refinement the analyst did not
anticipate: it is not the filesystem scan either (0.3 ms on an empty tree) but
the **git subprocess inside root discovery**.

**Its proposed mitigation was adopted; its proposed decision rule was not.** The
analyst wrote that *"the go/no-go decision must be contingent on buckets 3 and 4
being the primary latency source"* — i.e. **no-go** once the scan dominates.
This session isolated the buckets exactly as advised, found that rendering is
**not** the primary latency source, and still returned **GO** — because the
migration's case was never primarily performance, and all three panel voices
ranked defect-class elimination first. The honest response to "the perf premise
is false" is to **withdraw the perf claim in writing**, which
`s1-migration-decision.md` does, not to abandon a migration justified on other
grounds.

One further departure: the analyst's four proposed buckets assume a running
extension host. Two of them (view creation, first paint) are not measurable from
Node, and this session says so rather than fabricating them.

---

## Session 2 of 4 — The TreeDataProvider (complete vertical slice)

- Orchestrator: claude / anthropic / claude-opus-5 / high (operator-invoked).
  S1's `next_orchestrator` recorded this as the continuation default rather
  than an opinion; the routed analyst's S2 recommendation (`codex` /
  gpt-5.6-sol) was not adopted because it draws on **engine-seat** budget,
  which the operator has been cutting back, and S1 left an unusually
  well-specified brief that lowers the value of an engine switch.
- Routed step-3.5 analysis: [`s2-ai-assignment-analysis.json`](s2-ai-assignment-analysis.json)
  (`task_type=analysis`, excl. anthropic → `gemini-2.5-pro`, $0.0164,
  truncation-clean). A first attempt made the same paid call and lost the
  response to a `RouteResult` attribute typo in the orchestrator's harness
  script; the re-run is the artifact, and the wasted call is disclosed here
  rather than silently absorbed.
- Set-level facts carried from the spec (immutable at runtime): **Full tier**,
  `requiresUAT true` (**S4** walks it), `requiresE2E true` (L-064-12 arms at
  full strength — this session adds a *new* Explorer-rendering surface, so the
  Layer 3 obligation is live here, not deferred), `pathAwareCritique advisory`
  (set-terminal, in S4).
- Prerequisite: Session 1 `complete` (verdict WAIVED), confirmed by reading
  `session-state.json`, and its go/no-go read: **GO**.

### Design variance: LOW — and that is what decides the routing

S1 did the deciding. It shipped an operator-confirmed density mapping table, a
ranked icon-precedence table, two hard constraints proven by spike evidence (at
most **two** inline actions; implement precedence as code, not prose), a
four-level tree shape confirmed against the operator's asks, and a working
spike extension. The remaining work is *prescribed wiring* over surfaces that
already exist (`readAllSessionSets`, `computeVisibleModules`,
`buildBucketPayloads`, `ROW_ACTIONS`), which is the Set 101 S1 precedent for
orchestrator-direct implementation under routed verification.

The routed analyst disagreed and recommended routing the provider
implementation, the row mapping, the menu wiring and the tests as
`code_generation` / `test_generation`. **Not adopted, and the reason is
recorded rather than assumed:** the delegation rule's "more than ~50 lines of
reasoned output" trigger is about *reasoning*, and S1 already paid for the
reasoning — routing prescribed wiring would buy re-derivation of decisions the
operator has already confirmed, at the cost of an integration seam. What the
analyst's rule protects (an independent read of this code) is delivered by the
mandatory cross-provider session verification over the whole diff, which runs
regardless.

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1–3 | Register; preload; keys; read the spec, `s1-migration-decision.md`, the operator notes, and the existing model / view / registry / package.json. | Orchestrator direct — read-only reconnaissance before any claim (L-064-8). |
| 3.5 | Assignment analysis + next-orchestrator / next-set recommendations. | **Routed** (`analysis`) — repo rule: never self-opine on model choice. |
| 4a | Carry the already-parsed `sessions[]` ledger onto `SessionSet` so the fourth level costs no disk read. | Orchestrator direct — mechanical field surfacing of data the scanner already reads and discards. |
| 4b | Pure tree model (`workExplorerTreeModel.ts`): node union, per-level children, and the row descriptor (label / description / icon / tooltip / contextValue) including the icon-precedence table. | Orchestrator direct — S1's mapping table transcribed into code; no design latitude. |
| 4c | Thin vscode adapter (`WorkExplorerTreeProvider.ts`) + registration behind the existing surface. | Orchestrator direct — platform wiring. |
| 4d | `package.json`: the second view, submenus, `view/item/context`, inline cap. | Orchestrator direct — declarative contribution, parity-tested against the registry. |
| 4e | **The status-icon theme fix.** | **Neither routed nor asserted — settled by running code.** See below. |
| 4f | Startup instrumentation (S1's assigned residual). | Orchestrator direct — timestamps at named lifecycle points. |
| 6 | Provider unit tests + menu-gating parity tests. | Orchestrator direct — contract-driven matrices over pure functions (093/094/098–101 precedent). |
| E2E | Layer 3 against the new view (L-064-12). | Orchestrator direct — executable validation. |
| Verify | Phased `verify_session`. | **Routed** — `session-verification`, anthropic auto-excluded. |
| Close | `disposition.json`; commit + push; `close_session`; notify. | Orchestrator direct — mechanics. |

### Where this session departs from the routed analysis

1. **The routing plan** — see above. Recorded, not silently ignored.
2. **`icon_fix_recommendation`.** The analyst recommended re-authoring the four
   status SVGs to a single `currentColor` path, at **HIGH** confidence — while
   also saying the change *"MUST be verified by running the extension in a real
   host."* S1 made the same recommendation, reasoning from the operator's
   activity-bar icon. **Both may be reasoning from the wrong precedent:** a
   `viewsContainers` activity-bar icon and a `TreeItem.iconPath` are not
   rendered by the same mechanism, and `currentColor` in an *externally
   referenced* SVG resolves against that SVG's own document, not the host
   page's. This session takes the analyst's own advice over its recommendation
   and settles it with executable evidence in a real Extension Development
   Host before choosing. Whatever the answer, it is recorded with the evidence.
3. **`next_orchestrator` for S3.** The analyst recommends Claude Code on the
   grounds that S3 is *"primarily file deletion and minor `package.json` edits,
   which are highly mechanical."* The recommendation is plausible; **the
   reasoning is not, and is rejected on the record.** All three S1 panelists
   independently named S3 the riskiest session in the set, and the operator
   imposed an internal ordering (write the new suites → prove them green →
   seed a regression and prove the new Layer 3 catches it → *only then* delete)
   precisely because it is not mechanical. The S1 analyst's own advice — Claude
   for S3, because it is deletion plus behavioural-spec re-expression rather
   than greenfield authoring — is the better-argued route to the same engine.

### The routed analyst's forward-looking recommendations

- **Session 3:** Claude Code (see the correction above). Budget: `DABBLER_*`
  provider keys for routed calls; **no engine-seat spend**.
- **Next session set:** make the ~102 ms synchronous `git worktree list`
  discovery async / cached — *"directly addresses the ~102 ms of blocking
  synchronous work on activation that was quantified in S1."* This agrees with
  S1's own recommendation and is now backed by two independent analyses. Note
  the standing constraint the analyst could not know: **111 is reserved** for
  the capability-scaling simplification pass, so this is a candidate for a
  fresh number, not for 111.
- **Its three named S2 risks**, all accepted as live and tracked here:
  vertical-slice incompleteness invalidating S4's comparison; an imprecise
  `when` clause leaking actions onto the wrong node type; and new
  per-expansion latency inside `getChildren` / `getTreeItem` trading a slow
  paint for a laggy expand (which is also the spec's own last listed risk).
  The second is answered by a parity test between `ROW_ACTIONS` and the
  `package.json` menu contributions rather than by care.

### Budget note, by source

Routed spend before verification draws on `DABBLER_*` provider credit only:
$0.0164 (analysis) + $0.0164 (the lost first attempt, disclosed above)
= **$0.0328**. **Zero Copilot / engine-seat capacity consumed.**
