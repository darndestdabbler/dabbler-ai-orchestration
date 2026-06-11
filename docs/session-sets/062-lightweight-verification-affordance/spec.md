# Lightweight Verification Affordance (extension 0.30.0 + ai_router 0.17.0)

> **Purpose:** Make it trivial to see, and act on, the verification posture
> of Lightweight session sets in the Session Set Explorer: a quiet per-row
> verification marker (`v?` / `v+`) with honest tooltips, one-click copyable
> agent-handoff prompts for the dedicated-verification workflow, and a
> sanctioned Mode A → Mode B (`verificationMode`) transition — spec-seed
> rewrite on not-started sets, a new blessed Python writer on completed sets.
> Also ships a **hello-world UAT fixture workspace** (so operator UAT never
> requires hand-built sample projects) and the **combined Marketplace
> 0.30.0** release carrying Set 061's unreleased Explorer changes.
> **Created:** 2026-06-11
> **Session Set:** `docs/session-sets/062-lightweight-verification-affordance/`
> **Prerequisite:** `061-explorer-ux-polish` (complete — this set reuses its
> `N/M+` predicate, marker rendering pattern, and `tierRewrite` machinery.
> 061 was cut short by operator direction on 2026-06-11: its Session 4
> closes by recording that its UAT + release are deferred **here**, so the
> prerequisite is satisfied by that deferral close-out, and this set ships
> the release for both sets.)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification
> **Design input:** the operator's problem statement and three-engine design
> consult, adjudicated in Set 061's
> [`verification-affordance-synthesis.md`](../061-explorer-ux-polish/verification-affordance-synthesis.md)
> (sources: the design brief + Fable, Gemini Pro, and GPT-5.4 responses,
> same directory). The synthesis — including its three empirical
> corrections — is the design lock for this set; deviations from it are
> flagged at session close, not silently absorbed.

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true
requiresE2E: false
uatScope: per-set
uatStyle: ad-hoc
totalSessions: 5
prerequisites:
  - slug: 061-explorer-ux-polish
    condition: complete
```

> Rationale: Sessions 1–2 are Session Set Explorer **webview rendering /
> action** changes — the layer the mechanical test stack (`vscode-stub`)
> cannot fully exercise (the standing Set 058 lesson), so `requiresUAT: true`
> (ad-hoc, per-set) with operator UAT on a **local build before any
> publish**. The UAT here is double-duty: Set 061's surfaces (deferred,
> never operator-UAT'd) **plus** this set's — walked against the Session 4
> fixture workspace rather than hand-built samples. `requiresE2E: false` —
> Explorer webview interactions are non-deterministic under Playwright
> (Set 052 precedent); deterministic unit tests on the pure
> predicates/helpers plus the ad-hoc UAT are the gates. Session 3 adds
> packaged `ai_router` surface (a blessed writer), so this set ships
> **both** the combined Marketplace **0.30.0** (carrying Sets 061 + 062) and
> PyPI **0.17.0**.

---

## Project Overview

### Motivation

The operator's intent (recorded verbatim in the design brief): *"I don't
want to make it difficult for users to tell AI agents to create
verification and remediation sessions. It might almost be helpful to have
an icon on each Lightweight session set that hasn't been verified, and
have that icon tell the user what to do — maybe even serve as the toggle
to turn on verification."*

Today the gaps are:

1. **A completed Mode-A (`out-of-band-or-none`) Lightweight set is silent.**
   Nothing distinguishes "verified out-of-band" from "nobody verified it,"
   and nothing tells the user that dedicated verification is one spec field
   away.
2. **A Mode-B (`dedicated-sessions`) set sitting at `N/M+` is a dead end.**
   The `+` (Set 061 D1) says verification is owed, but nothing explains how
   to make it resolve — the user must already know the typed-session CLI.
3. **`verificationMode` is hand-edit-only.** And — established empirically
   during the design consult — the Set 057 capture is a one-way *silent*
   gate (`dedicated_verification.py` returns `None` once a
   `verification_mode` activity-log record exists): a spec edit after first
   record is **ignored by Python but honored by the Explorer**, so a naive
   UI rewrite on a started set would create silent spec-vs-record drift.
4. **Operator UAT of Explorer features has no cheap fixture story.** Every
   UAT pass so far has needed hand-built sample sets in contrived states;
   the marker/action matrix of Sets 061 + 062 makes that prohibitive — the
   direct trigger for cutting 061 short.

### Relationship to Set 061 (cut short, 2026-06-11)

Set 061 S1–S3 shipped the `N/M+` fraction, `lw` marker, blocked-prereqs
marker, and `Switch Tier…` — but its Session 4 (operator UAT + 0.30.0
release) was cut short by operator direction: those surfaces cannot be
adequately UAT'd without this set's verification affordance and fixture
workspace. 061 S4 closes by recording the deferral; its authored UAT
checklist (`../061-explorer-ux-polish/061-explorer-ux-polish-uat-checklist.json`)
is **subsumed** by this set's combined checklist, and the single
Marketplace **0.30.0** ships from here carrying both sets (the Set 059→060
fold precedent).

### Design decisions (locked by the three-engine synthesis, 2026-06-11)

- **D1 — quiet verification marker, two states, click = open row menu.**
  A de-emphasized text marker in the existing marker strip (the `lw`
  pattern: help cursor, tooltip does the work). Clicking it opens the row
  context QuickPick — it **never mutates state directly**.
  - **`v?`** renders when: `tier: lightweight` ∧ `verificationMode:
    out-of-band-or-none` ∧ row state `complete` ∧ no `type: verification`
    session in the ledger ∧ **no `external-verification.md` in the set
    directory**. Tooltip: *"Lightweight — verification is out-of-band or
    none. The Explorer cannot tell whether this set was reviewed out of
    band. Click for verification options."*
  - **`v+`** renders when: `tier: lightweight` ∧ `verificationMode:
    dedicated-sessions` ∧ all `type: work` sessions complete ∧ row state
    not terminal. Tooltip: *"Dedicated verification enabled — a
    verification/remediation session is still owed or in flight. Click for
    the next step."* (The Set 061 `N/M+` fraction keeps covering the
    pre-completion arithmetic; the marker adds the action surface at the
    actionable moment.)
  - **No marker** on: Full rows, cancelled rows, Mode-A rows with an
    `external-verification.md` present (the sanctioned out-of-band record
    exists — quiet is success), and rows with a completed `type:
    verification` session (quiet is success; the fraction tooltip gains the
    persisted `verificationVerdict`, e.g. "Verification: VERIFIED
    (session 4)"). **No positive "verified" badge** — absence is the
    signal. Copy never says "unverified" — Mode A is a posture, not a
    deficiency.

- **D2 — agent handoff is a state-specific copyable prompt.** A new
  pointer-style prompt builder (the `copyPromptCommands.ts` L1 convention —
  reference commands and docs, embed no content that can go stale):
  `Copy verification kickoff prompt`, offered on Lightweight
  `dedicated-sessions` rows with no completed verification session. The
  prompt instructs the agent to run the Set 057 dedicated flow: read the
  workflow doc's dedicated-verification section, open a typed session via
  `start_session <slug> --type verification` on a **different engine**,
  record the verdict, and chain remediation via `--type remediation
  --handoff` when findings require. The generic start-next-session prompt
  is *not* reused — the dedicated flow is not generic. The UI **never
  appends typed sessions itself**: a button-created `in-progress` session
  with no agent behind it is a stranded session; the agent's own
  `start_session --type verification` is the only session creator.

- **D3 — `Set up dedicated verification…` action (Mode A → Mode B), phased
  by set state.** Offered on Lightweight Mode-A rows via the row QuickPick,
  with an explicit confirmation step (one-way action; consequence copy
  names the `N/M+` growth). Eligibility:
  - **`not-started`** (Session 2): no durable record exists yet, so the
    spec-config `verificationMode` seed is still the authority — the action
    rewrites the seed byte-preservingly (a sibling of `tierRewrite.ts`,
    same `CONFIG_BLOCK_RE` machinery, same outcome enum) and refreshes.
    Mirrors `Switch Tier…`. Both directions (A↔B) are legal here.
  - **`complete`** (Session 3): the realistic "I finished the work, now I
    want it verified" case. The action invokes the **new blessed Python
    writer** (D4); only on writer success does it align the spec seed and
    copy the kickoff prompt (toast: *"verificationMode →
    dedicated-sessions. Kickoff prompt copied — paste it to your AI
    agent."*). On writer failure (or missing venv/python) it informs and
    changes **nothing** — no drift by construction.
  - **`in-progress` is excluded** deliberately: verification is not yet
    due, and excluding in-flight sets avoids contention with a running
    session. **B→A is never offered once any activity-log record exists.**

- **D4 — a sanctioned `verification_mode_change` blessed writer
  (ai_router).** A new CLI entry point that appends a superseding
  `verification_mode_change` record to `activity-log.json`, gated
  fail-loud: set is Lightweight; effective recorded mode is
  `out-of-band-or-none`; no `type: verification`/`remediation` session
  exists in the ledger; no session is in flight; target mode is
  `dedicated-sessions` (A→B only — B→A is refused). The mode-resolution
  read path (`dedicated_verification.py`) honors the latest record, so the
  7-state derivation and close-out gates follow the transition. The
  rationale (locked): A→B is **purely additive** — work sessions execute
  identically under both modes; the transition only governs whether typed
  sessions are appended afterward — so it does not violate the reason the
  Set 057 capture is immutable, but it must be **recorded, not snuck past**
  the capture. Session 3 first audits empirically whether
  `start_session --type …` gates on the recorded mode and aligns it with
  the new record.

- **D5 — releases (combined).** Marketplace **0.29.0 → 0.30.0** — one
  release carrying Set 061's unreleased Explorer changes plus this set's
  (no standalone 061 release; the 059→060 fold precedent; the extension
  `CHANGELOG.md` entry names both sets) — and PyPI **0.16.0 → 0.17.0** for
  the blessed writer. Both gated on a passing operator UAT on a local
  build (the Set 058/059/060 lesson) and shipped only via
  operator-authorized tag pushes (`vsix-v0.30.0`, `v0.17.0`); release docs
  stay in pre-push wording until the workflow runs succeed, run ids
  recorded post-publish (the Set 060 S4-V1-001 lesson).

- **D6 — hello-world UAT fixture workspace.** A committed fixture matrix
  (`test-fixtures/uat-matrix/`) of trivial hello-world sample projects
  whose session sets cover every marker/action state across Sets 061 + 062
  (Full control row; Lightweight Mode A not-started / complete-without-note
  / complete-with-note; Mode B mid-work / work-complete / verified;
  blocked-by-prereqs incl. unknown slug; needs-migration), plus a small
  generator script that assembles a disposable workspace **outside the
  repo** for the operator to open. Synthetic state files are fixtures —
  the writer-discipline rule governs real sets; the cold-start fixtures
  (Set 058) are the precedent. Fixtures live under `test-fixtures/` (never
  `docs/session-sets/`), keeping the one-active-set drift guard honest;
  the session confirms the guard interaction empirically.

### Non-goals

- **No new persisted `session-state.json` fields** — every Explorer signal
  is derived from spec config + the session ledger + existing set-directory
  artifacts (`external-verification.md` presence). The
  `verification_mode_change` activity-log record is a blessed-writer audit
  event in the established activity-log home, not Explorer-derived state.
- **No port of the Python 7-state ladder to TS.** The Explorer keeps its
  four row states; the marker predicates are simple ledger approximations.
- **No UI-created typed sessions**, no auto-launched agents, no chat-panel
  integration (no such surface exists), no `verify now` language.
- **No positive "verified" badge** and no persisted "human attested" flag —
  the out-of-band record is `external-verification.md`, as Set 057 defined.
- **No B→A transition after first record**, no mid-set (`in-progress`)
  mode changes, and no change to the Mode-A default or to tier-switch
  rules (`Switch Tier…` stays not-started-only).
- **No synthetic session sets under `docs/session-sets/`** — fixture sets
  live in `test-fixtures/` and generated temp workspaces only.

---

## Sessions

### Session 1 of 5: Verification marker — states, predicates, tooltips

**Goal:** Render D1 — the `v?` / `v+` marker with honest derived states.
**Steps:**
1. Extend the set scan to carry the two new derived inputs:
   `external-verification.md` presence in the set directory, and the
   completed-verification verdict (`verificationVerdict` of the completed
   `type: verification` session, when one exists) — derived in
   `fileSystem.ts` alongside the existing tier/mode/ledger reads, onto the
   in-memory record and row payload.
2. Implement the marker predicates as pure, unit-tested functions in
   `tierLegibility.ts` (beside `shouldRenderPlusFraction`): given (tier,
   verificationMode, ledger sessions, externalVerificationNoteExists, row
   state) return `"v?" | "v+" | none` per D1, including the
   suppression rules (terminal-cancelled, note-present, verified).
3. Render the marker in the strip (the `lw` pattern: `SessionSetsModel` →
   payload → `client.js` / `tree.css`, de-emphasized, help cursor) with the
   D1 tooltip copy; marker click sends the existing row-context-menu
   message (no new mutation path). Enrich the fraction tooltip with the
   verdict on verified sets.
4. Tests: predicate matrix (Full / LW Mode A pre- and post-completion /
   note present / LW Mode B before-during-after typed sessions / cancelled),
   payload carriage, rendering, tooltip copy; full suite; cross-provider
   verification.
**Creates:** the marker predicate module additions + tests.
**Touches:** `src/utils/tierLegibility.ts`, `src/utils/fileSystem.ts`,
`src/providers/SessionSetsModel.ts`, `src/providers/CustomSessionSetsView.ts`,
`src/types/sessionSetsWebviewProtocol.ts`, `media/session-sets-tree/client.js`,
`media/session-sets-tree/tree.css`, tests.
**Ends with:** complete Mode-A sets without a note show `v?`; Mode-B sets
with work done show `v+`; verified and note-bearing sets show nothing;
suite green.
**Progress keys:** `session-001/derived-inputs`,
`session-001/marker-predicates`, `session-001/marker-rendering`,
`session-001/verified`.

### Session 2 of 5: Agent handoff + not-started toggle

**Goal:** D2's kickoff prompt and D3's safe (not-started) half of the
toggle.
**Steps:**
1. The `verificationModeRewrite` helper: a sibling of `tierRewrite.ts`
   (same config-block regex, byte-preserving, same outcome enum), rewriting
   only the `verificationMode:` scalar; unit-test the same matrix
   (present / absent / quoted / commented / CRLF / non-config occurrences
   untouched).
2. `Copy verification kickoff prompt` (`dabbler.copyVerificationKickoffPrompt`):
   pointer-style builder in `copyPromptCommands.ts` per D2; ActionRegistry
   entry visible on Lightweight `dedicated-sessions` rows with no completed
   verification session.
3. `Set up dedicated verification…` (`dabblerSessionSets.setupVerification`):
   ActionRegistry entry on Lightweight Mode-A rows, **not-started only at
   this session** (the predicate widens in Session 3); confirmation
   QuickPick with one-way consequence copy; applies the seed rewrite;
   refreshes. Offer the reverse (B→A) only on not-started rows where no
   activity-log record exists, mirroring `Switch Tier…` symmetry.
4. Reuse `dabbler.openExternalVerificationDoc` as a row action on Mode-A
   `complete` rows (`v?` rows) — the sanctioned out-of-band recording path;
   note in its QuickPick detail that creating the note clears the marker.
5. Tests: rewrite-helper matrix, ActionRegistry applicability (per state ×
   tier × mode), prompt-builder content (references, no embedded doc
   bodies), confirmation flow; full suite; cross-provider verification.
**Creates:** `src/utils/verificationModeRewrite.ts`,
`src/commands/setupVerification.ts`, the kickoff prompt builder, tests.
**Touches:** `src/commands/copyPromptCommands.ts`,
`src/providers/ActionRegistry.ts`, `src/providers/CustomSessionSetsView.ts`,
`package.json` (command contributions), tests.
**Ends with:** a Mode-B row one click from a paste-ready verification
kickoff prompt; a not-started Mode-A row togglable to `dedicated-sessions`
with confirmation; `v?` rows offering the external-note path; suite green.
**Progress keys:** `session-002/rewrite-helper`,
`session-002/kickoff-prompt`, `session-002/setup-action`,
`session-002/verified`.

### Session 3 of 5: Sanctioned A→B on completed sets (blessed writer + wiring)

**Goal:** D4's blessed writer and D3's completed-set toggle.
**Steps:**
1. **Audit first:** confirm empirically how `start_session --type …` and
   the close-out gates consume the recorded verification mode
   (`dedicated_verification.py` read path), so the new record kind is
   honored everywhere a mode decision is read; record findings in the
   session notes before writing code.
2. Implement the blessed writer in `ai_router` (CLI entry point, e.g.
   `python -m ai_router.change_verification_mode <slug>`): append a
   `verification_mode_change` record to `activity-log.json` under the D4
   fail-loud gates (Lightweight; effective mode `out-of-band-or-none`; no
   typed sessions; nothing in flight; target `dedicated-sessions` only).
   Make the mode-resolution read path honor the latest record. Python
   tests for every gate + the read-path precedence.
3. Extension wiring: widen the `setupVerification` ActionRegistry predicate
   to `complete` Mode-A rows; on those rows the action invokes the writer
   via the established Python-invocation pattern (the Set 050 migrator-chain
   precedent), and **only on success** runs the seed rewrite + copies the
   kickoff prompt + toasts. Missing venv/python or writer failure → inform
   and change nothing.
4. Documentation: the new record kind and transition rules in the
   activity-log/session-state schema docs and the workflow doc's
   dedicated-verification section (including the locked rationale: additive
   A→B, recorded-not-snuck, B→A refused); `ai_router/CHANGELOG.md` entry.
5. Tests: TS predicate widening + invocation/fallback paths; full Python +
   TS suites; cross-provider verification (the verifier is pointed at the
   D4 gates and the drift-by-construction claim).
**Creates:** the `ai_router` writer module + CLI + Python tests.
**Touches:** `ai_router/dedicated_verification.py` (read path),
`ai_router/` CLI surface, `src/commands/setupVerification.ts`,
`src/providers/ActionRegistry.ts`, schema/workflow docs,
`ai_router/CHANGELOG.md`, tests.
**Ends with:** a completed Mode-A set converts to `dedicated-sessions`
through the recorded, gated transition end-to-end from the Explorer, with
the kickoff prompt on the clipboard; suite green.
**Progress keys:** `session-003/mode-read-audit`,
`session-003/blessed-writer`, `session-003/ui-wiring`,
`session-003/docs`, `session-003/verified`.

### Session 4 of 5: Hello-world UAT fixture workspace

**Goal:** D6 — make the combined UAT walk cheap: generated sample projects
covering every marker/action state, no hand-built fixtures.
**Steps:**
1. Author the committed fixture matrix under
   `tools/dabbler-ai-orchestration/test-fixtures/uat-matrix/`: one or two
   trivial hello-world consumer projects (a few files of real content so
   wizard/prompt surfaces aren't empty) whose `docs/session-sets/` cover
   the state matrix — Full mid-progress (control, no markers); LW Mode A
   not-started (Switch Tier + Set up verification eligible), complete
   without note (`v?`), complete **with** `external-verification.md` (no
   marker); LW Mode B mid-work (`N/M+` only), work-complete (`N/M+` +
   `v+`), verified with a completed typed session + verdict (no marker,
   verdict tooltip); blocked-by-prereqs (real pending + unknown-slug
   variants); needs-migration (older `schemaVersion`, `*` marker). Each
   set's spec is a 2–3 session hello-world task. Synthetic state files are
   fixtures (cold-start precedent) — never under `docs/session-sets/`.
2. The generator: a small script (npm script in the extension package,
   e.g. `npm run make-uat-workspace`) that copies the matrix into a fresh
   temp folder **outside the repo** and prints the path to open. Confirm
   empirically that neither the committed matrix nor the generated copy
   trips the drift guards (one-active-set, stale-framing); allow-list
   deliberately if needed.
3. Wire the matrix into at least one deterministic test (extend the
   Layer-2 tree-provider harness or the golden-render fixtures over a
   couple of matrix rows) so the fixtures cannot silently rot as schemas
   evolve.
4. Docs: a short "UAT fixture workspace" section in `CONTRIBUTING.md`
   (how to generate, what each sample demonstrates, how to refresh).
5. Full suite; cross-provider verification.
**Creates:** `test-fixtures/uat-matrix/**`, the generator script, the
CONTRIBUTING.md section, fixture-consuming tests.
**Touches:** extension `package.json` (script), `CONTRIBUTING.md`,
possibly drift-guard allow-lists, tests.
**Ends with:** one command yields a disposable hello-world workspace where
every Set 061 + 062 marker/action state is visible at once; suite green.
**Progress keys:** `session-004/fixture-matrix`, `session-004/generator`,
`session-004/fixture-tests`, `session-004/docs`, `session-004/verified`.

### Session 5 of 5: Combined operator UAT on a local build, then 0.30.0 + 0.17.0

**Goal:** Gate both releases on a passing local UAT — covering Set 061's
deferred surfaces and this set's — then ship.
**Steps:**
1. Author the combined ad-hoc per-set UAT checklist
   (`062-lightweight-verification-affordance-uat-checklist.json`),
   **subsuming the rows of Set 061's authored checklist**
   (`../061-explorer-ux-polish/061-explorer-ux-polish-uat-checklist.json`:
   `N/M+` before/after, `lw` marker, blocked marker/tooltip/badge-absence,
   Switch Tier directions + guardrails, Getting Started no-regression)
   plus this set's items: `v?` on a completed Mode-A fixture; marker
   suppressed when `external-verification.md` exists; `v+` on a Mode-B
   work-complete fixture and its disappearance after a completed typed
   verification session (with the verdict tooltip); marker click opening
   the row menu; kickoff-prompt content; the not-started toggle (both
   directions + confirmation); the completed-set toggle through the blessed
   writer (success, gate-refusal, and missing-python paths). Every item
   walks against the Session 4 fixture workspace; each non-judgment item
   declares `ProgrammaticVerification` or `NoProgrammaticPathReason`.
2. Build a local `.vsix`; generate the fixture workspace; **operator UAT is
   the pre-publish gate**; fold feedback and re-walk affected rows before
   closing the gate.
3. On pass: bump `package.json` + lock + extension `CHANGELOG.md` to
   **0.30.0** (the entry names Sets 061 + 062 — combined release); bump
   `pyproject.toml` + `ai_router/CHANGELOG.md` to **0.17.0**; update
   `docs/repository-reference.md` in **pre-push wording**, run ids recorded
   in a post-publish follow-up commit.
4. Cross-provider verification; close-out (final session →
   `change-log.md`).
5. Release: push `vsix-v0.30.0` and `v0.17.0` only with explicit operator
   authorization; watch both publish runs to completion before recording
   "published."
**Touches:** version files, both CHANGELOGs, `docs/repository-reference.md`,
the set's UAT checklist.
**Ends with:** a locally-UAT'd, operator-authorized extension 0.30.0
(carrying Sets 061 + 062) and ai_router 0.17.0 (or held for the operator's
tag pushes).
**Progress keys:** `session-005/uat-checklist`,
`session-005/operator-uat-passed`, `session-005/versions-bumped`,
`session-005/verified`, `session-005/change-log-written`.

---

## End-of-set deliverables

- A quiet `v?` / `v+` verification marker on Lightweight rows with honest,
  state-specific tooltips; suppressed on verified, note-bearing, and
  cancelled sets; verdict surfaced in the fraction tooltip (D1).
- A `Copy verification kickoff prompt` action producing a pointer-style,
  typed-session, different-engine handoff prompt (D2).
- A `Set up dedicated verification…` action: confirmed spec-seed rewrite on
  not-started Mode-A sets; blessed-writer-backed transition on completed
  Mode-A sets; `Open external verification note` reused on `v?` rows (D3).
- A sanctioned, gated `verification_mode_change` blessed writer in
  `ai_router` with documented transition rules (A→B only, recorded, never
  in-flight) (D4).
- A committed hello-world UAT fixture matrix + one-command disposable
  workspace generator covering every Set 061 + 062 marker/action state
  (D6).
- A combined, operator-UAT'd extension **0.30.0** (carrying Sets 061 + 062)
  and ai_router **0.17.0**, released under the held/authorized-tag-push
  contract (D5).
