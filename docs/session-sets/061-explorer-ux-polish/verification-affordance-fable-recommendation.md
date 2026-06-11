# Verification affordance for Lightweight sets — analysis & recommendation

> **Author:** Claude Fable 5 (direct response, no router), 2026-06-11.
> **Responds to:** [`verification-affordance-design-brief.md`](verification-affordance-design-brief.md).
> **Grounded in:** the shipped Set 061 marker/action code paths
> (`tierLegibility.ts`, `SessionSetsModel.ts`, `fileSystem.ts`,
> `tierRewrite.ts`, `switchTier.ts`, `ActionRegistry.ts`,
> `copyPromptCommands.ts`) and the Set 057 typed-session writer
> (`register_typed_session_start` / `--type verification`).

## Summary

Reshape the operator's idea in one specific way: **keep the per-row signal,
but never make the glyph itself a state-mutating toggle.** Ship a quiet
informational marker whose tooltip names a context-menu action; the action
does the mode flip and hands the user a ready-to-paste agent prompt. Split
delivery into three increments — render-the-state (extension-only, ship
now), agent-handoff (extension-only, ship now), and the A→B mode flip on
started sets (requires a scoped, deliberate amendment to the Python
capture guard — design-lock it separately before building).

---

## 1. The affordance

**A de-emphasized text-presentation glyph, `◇` (U+25C7 WHITE DIAMOND), in
the existing marker slot** — same family and styling as `*`, `lw`, and
`⛓︎` (`SessionSetsModel.ts` marker pipeline). Hollow = "no record here."
Deliberately **not** a warning glyph, not colored, no `⚠` — the absence of
a verification record on a Mode-A set is a *fact*, not a *defect*, and the
brief's own risk list (misleading "unverified" on a legitimately Mode-A
set) is mitigated primarily by refusing warning semantics.

**Tooltip (the load-bearing copy):**

> *No verification recorded — this set's verification mode is
> out-of-band-or-none. If it was verified by a human or external agent,
> nothing further is needed. To add dedicated verification sessions,
> right-click → "Set up verification…".*

Three sentences, three jobs: state the fact, absolve the legitimate
Mode-A case explicitly, and name the action. This is the "icon that tells
the user what to do" from the operator's intent — but the *telling*
happens in the tooltip and the *doing* happens in the context menu, which
is the established pattern (markers are informational; actions live in the
QuickPick row menu, per `Switch Tier…`).

A left-click on the marker may open the same row context menu (harmless
shortcut, consistent with the L5 row-activation pattern). It must never
directly mutate anything: a one-click toggle on a tiny glyph that rewrites
`spec.md` is an accidental-click hazard and breaks the "rows are quiet"
ethos in spirit even if it looks quiet.

**Why not break the quiet ethos with a real button?** Because the moment
the affordance matters (work complete, nothing recorded), the row is
otherwise inert — a quiet marker on an inert row has plenty of relative
salience. The ethos survives intact.

## 2. States and their derivations

All states are pure derivations from spec config + the session ledger —
no new persisted fields. The crucial observation: **most of the state
machine already exists.** The `N/M+` suffix (`shouldRenderPlusFraction`,
`tierLegibility.ts:51-59`) already renders "Mode B, verification promised
but not yet appended." The only rendering gap is Mode A after work
completes.

| # | State (Lightweight set) | Rendering | Derivation |
|---|---|---|---|
| S1 | Work sessions still in progress | **nothing new** | set state ≠ `complete`, no `+` predicate hit |
| S2 | Mode B, verification pending append | **existing `N/M+`** | `shouldRenderPlusFraction` (tier + `dedicated-sessions` + no typed session in ledger) |
| S3 | Mode B, typed verification session in flight | **existing fraction/state** | `type: "verification"` session with `status: in-progress` in `sessions[]` |
| S4 | Verified | **no marker** (absence is the signal); enrich the fraction tooltip with the verdict | completed `type: "verification"` session exists (`hasTypedVerificationSession`, `tierLegibility.ts:38-47`); verdict text from the persisted `verificationVerdict` field (Set 054) |
| S5 | **Mode A, work complete, nothing recorded** | **new `◇` marker** | `tier === "lightweight"` ∧ `verificationMode === "out-of-band-or-none"` ∧ set state `complete` ∧ `hasTypedVerificationSession() === false` (defensive) |

Display rules: S5 shows **only on `complete` sets** — surfacing
"unverified" mid-work nags about something that isn't due yet, and the
brief's realistic moment ("I finished the work, now I want it verified")
is exactly set completion. Suppress on `cancelled` (matching the `⛓︎`
suppression rule). Do **not** add a positive "verified ✓" marker — on a
quiet row, absence of the diamond after completion *is* the verified/
opted-out signal, and the verdict belongs in the tooltip, not the row.

**The Mode-A gap, honestly:** the system **cannot know** whether a Mode-A
set was verified out-of-band. There is no derivable signal and inventing a
persisted "human attested" flag violates the no-new-fields rule for the
worst possible reason (it would persist an unverifiable claim). Two
consequences, both deliberate:

1. The marker copy must be **factual, not judgmental** — "no verification
   recorded," never "unverified." A human-attested Mode-A set wearing a
   quiet `◇` forever is acceptable; the tooltip explicitly says so.
2. For operators who *want* the diamond gone on an attested set, the
   sanctioned path already exists in embryo: record the attestation as a
   machine record via the blessed writer (a typed verification session
   closed with a manual verdict — the `--manual-verify` close path). That
   is "out-of-band verification, recorded in-band," and it costs no new
   schema. Offer it as a secondary QuickPick item, not the headline.

**Known visual-debt risk:** consumer repos with many historical complete
Lightweight Mode-A sets will grow a column of diamonds on day one. This is
truthful but potentially noisy. Accept it for v1 (the glyph is quiet and
tooltip-gated); if dogfooding proves it noisy, the cheap knob is
restricting S5 to non-archived/most-recent sets — do **not** pre-build
that.

## 3. The toggle (Mode A → Mode B)

**Yes — but as a context-menu action, not the marker itself, and the flip
must be sanctioned, not snuck past the capture guard.**

**Action:** `Set up verification…` in the row QuickPick (`ActionRegistry`
entry alongside `Switch Tier…`, group ~50x). What it does, in order:

1. **Rewrite `spec.md`**: `verificationMode: out-of-band-or-none` →
   `dedicated-sessions`, byte-preserving, via a sibling of
   `tierRewrite.ts` (same `CONFIG_BLOCK_RE` machinery, same outcome enum,
   same quote/CRLF/comment preservation). This is a solved problem as of
   Set 061 S3 — reuse it.
2. **Copy the agent handoff prompt** to the clipboard (§4) and toast:
   *"verificationMode → dedicated-sessions. Agent prompt copied — paste it
   to your AI agent to run the verification session."*
3. **Nothing else.** Critically, the extension must **not** append the
   typed verification session itself, even though it can run Python (the
   migrator chain proves the capability). Appending marks a session
   `in-progress`; doing that from a button click strands an in-flight
   session if the user never actually engages an agent. The typed session
   must be opened by the agent that runs it, via
   `start_session <slug> --type verification`. The UI records *intent*
   (the mode flip); the agent records *work*.

This split has a free, elegant feedback loop: the instant the spec is
rewritten, the existing `N/M+` predicate fires and the row renders the `+`
— zero new rendering code, and the `+` itself now communicates
"verification promised, not yet run."

**Eligibility — reconciling with immutability.** Distinguish the two
rules the brief conflates:

- **Tier flips** change per-session verification semantics for sessions
  that *already ran* (Full = mandatory cross-provider per session). That
  is why tier switching is not-started-only. **Unchanged.**
- **`verificationMode` A→B is purely additive.** Work sessions execute
  identically under Mode A and Mode B (router-off, no per-session
  verification either way); the mode only governs whether typed sessions
  get appended *afterward*. Flipping A→B on a completed set retroactively
  changes nothing about any executed session. The semantic argument for
  immutability does not apply to this transition.

What *does* apply is the Set 057 capture guard: the verification-mode
choice is captured at first record and writers fail-loud on mismatch — a
drift guard against silent hand-edits, which is exactly what a naive spec
rewrite would trip. So the flip on a started/complete set requires a
**scoped Python-side amendment**: permit exactly one transition class —
`out-of-band-or-none → dedicated-sessions`, only when no typed
verification session exists and no session is in flight — and record it as
an explicit mode-change event in the activity log so the audit trail shows
a sanctioned transition, not drift. `B → A` stays UI-unreachable once any
record exists (it would erase a promise the `+` already rendered); offer
both directions only on `not-started` sets, mirroring `Switch Tier…`.

> **Verify before locking:** confirm the exact enforcement point of the
> capture guard in `ai_router` (whether it hard-fails mismatch on every
> writer record). The amendment above assumes it does; if it is advisory,
> the Python change shrinks but the activity-log mode-change event should
> ship anyway — the transition deserves a record.

If the team declines the Python amendment, the honest fallback is **not**
a not-started-only toggle — hand-editing a not-started spec is trivial and
a UI for it solves nothing the operator asked about. The fallback is to
ship rendering + handoff (§4) and leave the flip manual, with the tooltip
pointing at the spec field.

## 4. The agent handoff

The lowest-friction path is the one the extension already uses everywhere:
**a copyable, pointer-style prompt** (the `copyPromptCommands.ts` L1
convention — reference commands and docs, embed no file content that can
go stale). One prompt builder, two entry points:

- From `Set up verification…` on a Mode-A set (after the flip, step 2
  above).
- As `Copy verification prompt` on any set already showing `N/M+` — this
  is a real gap today: a Mode-B set sits at `3/3+` with nothing telling
  the user how to make the `+` resolve. The same builder serves both,
  which is the strongest argument that this is one feature, not two.

Prompt shape (pointer-style, final wording from the Set 057 workflow doc):

> In `<repo>`, run the dedicated verification workflow for session set
> `<slug>`: read `docs/ai-led-session-workflow.md` § dedicated
> verification, start a typed session with
> `python -m ai_router.start_session <slug> --type verification`, perform
> the review, close with a recorded verdict, and append remediation via
> `--type remediation --handoff` if findings require it.

Do not auto-launch sessions, do not open terminals, do not pre-create
ledger entries. Clipboard + toast is the established medium (left-click
row activation already works exactly this way) and keeps the extension's
role honest: it renders state and hands off intent; blessed writers
mutate; agents work.

## 5. Scope & risk

**This splits into three increments**, and the split matters because they
carry different risk classes:

| Increment | Contents | Layer | Risk | Verdict |
|---|---|---|---|---|
| **D-a Render** | `◇` marker + tooltip; verdict in fraction tooltip | TS only, pure derivation | Lowest; visual-debt risk noted §2 | **Ship** |
| **D-b Handoff** | `Copy verification prompt` on `N/M+` rows; prompt builder | TS only | Low (prompt staleness — keep pointer-style) | **Ship** |
| **D-c Toggle** | `Set up verification…` flip on started/complete sets; spec rewrite sibling of `tierRewrite.ts`; **Python capture-guard amendment + activity-log mode-change event** | TS + Python, cross-layer | The only real risk in the feature; touches a Set 057 invariant | **Design-lock first, ship second** |

D-a and D-b are extension-only, derivation-pure, and could ride the next
extension release. D-c amends a deliberate invariant and deserves its own
audit-then-spec treatment with cross-provider verification of the gate
amendment.

**Risk register, with mitigations baked into the design above:**

1. *Misleading "unverified" on a legitimately Mode-A set* — factual copy
   ("no verification recorded"), no warning semantics, tooltip explicitly
   blesses the out-of-band case, marker only after completion.
2. *Implying automatic verification Lightweight deliberately doesn't do* —
   the UI never creates sessions; the toast says "paste to your agent";
   agency stays visibly with the user.
3. *Mid-set immutability break* — UI never rewrites while a session is in
   flight; the gate amendment is scoped to the one additive transition and
   leaves an audit record; B→A unreachable once started.
4. *Marker creep* — this is the fourth row marker (`*`, `lw`, `⛓︎`, `◇`,
   plus the `+` suffix). It earns its slot because it is the most
   state-scoped of the four (complete + Lightweight + Mode A only), so
   most rows never show it. Treat the slot as full: the next marker
   proposal should have to argue one of these out.

## Bottom line

Ship the operator's signal, reshape the operator's toggle. The `◇`
"no verification recorded" marker plus a `Copy verification prompt` action
on `N/M+` rows are pure-derivation, extension-only wins that directly
serve "make it easy to tell an agent to verify" — build them now. The
A→B flip is right in spirit but must be a sanctioned, audited transition
through an amended capture guard, never a glyph-click or a silent spec
edit — design-lock that Python change as its own piece before building it.
The marker must state facts ("no verification recorded"), never verdicts
("unverified"), because for Mode A the system genuinely cannot know.
