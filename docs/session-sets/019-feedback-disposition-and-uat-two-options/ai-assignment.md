# Set 019 — AI Assignment (Sessions 1 & 2)

**Session 1 Status:** Completed 2026-05-11; committed in `94260a6` (not pushed; holding for end-of-set).
**Session 2 Status:** Authored 2026-05-11; awaiting operator approval before edits.

**Scope** — disposition-gate discoverability. Three concrete fixes
in response to `dabbler-platform`'s
[upstream-feedback-disposition-gate.md](../../../../dabbler-platform/docs/session-sets/admin-users-cross-links/upstream-feedback-disposition-gate.md):

1. A canonical schema doc at `docs/disposition-schema.md`.
2. Step 8 of `docs/ai-led-session-workflow.md` names
   `disposition.json` explicitly and links to the schema doc.
3. Both `CloseoutGateFailure` / `invalid_invocation` messages in
   `ai_router/close_session.py` link to the schema doc and inline
   the required-field list.

`--write-template` is **deferred** per operator decision
2026-05-11. Recorded in `change-log.md` at session close as a
follow-up candidate.

The UAT two-options split and the W0-runner upstream-feedback file
are **Session 2**, not this session.

---

## 1. Findings (from prerequisite reads)

### 1a. `Disposition` dataclass surface

[ai_router/disposition.py](../../../ai_router/disposition.py)
defines `Disposition` with seven fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | `str` | always | One of `DISPOSITION_STATUSES` (`"completed"`, `"requires_review"`, `"in_progress"`, `"blocked"`, plus the others enumerated in the module). |
| `summary` | `str` | always | One-paragraph human description; lives in `change-log.md` first paragraph in practice. |
| `files_changed` | `List[str]` | always | Paths created/modified during the session. |
| `verification_method` | `str` | always | `"api"` (synchronous, outsource-first) or `"queue"` (outsource-last) or other entries in `VERIFICATION_METHODS`. |
| `verification_message_ids` | `List[str]` | conditional | Non-empty **iff** `verification_method == "queue"`. Empty for `"api"`. |
| `next_orchestrator` | `Optional[NextOrchestrator]` | conditional | **Required when `status == "completed"` AND the session is not the final session of the set.** Specifies who runs the next session and a reason code. |
| `blockers` | `List[str]` | conditional | **Non-empty when `next_orchestrator.reason.code == "switch-due-to-blocker"`.** Empty otherwise (best practice). |

Three fields the feedback file flagged as "non-obvious semantics
an orchestrator without docs can't guess correctly" —
`verification_method`, `next_orchestrator`, `blockers` — are exactly
the three conditional fields. The new schema doc must give each one
explicit treatment with an example.

### 1b. Current error-message sites (two of them)

- **[ai_router/close_session.py:670-688](../../../ai_router/close_session.py#L670-L688)** — `run_gate_checks()` synthesizes a `GateResult(check="disposition_present", passed=False, remediation=...)` when the file is absent. This is the gate surface that `mark_session_complete()` calls. The text is:
  > `"disposition.json is required for close-out — write it before calling mark_session_complete (or pass force=True to bypass the gate; incident-recovery use only)."`

- **[ai_router/close_session.py:1304-1311](../../../ai_router/close_session.py#L1304-L1311)** — `run()` CLI flow, the `disposition is None and not args.force` branch. Sets `result = "invalid_invocation"` with the text:
  > `"disposition.json is required (or pass --force to bypass; incident-recovery use only — see ai_router/docs/close-out.md Section 5)"`

Both messages get the same improvement: file path, required-field
list, schema doc link, preserved `--force` clause.

### 1c. Current Step 8 of `docs/ai-led-session-workflow.md`

Lines 1099–1126. The current text names commit/push,
`close_session`, and the notification — and explicitly says the
script "writes idempotent state" — but **never says
`disposition.json`** in prose. The feedback's exact diagnosis: an
orchestrator reading Step 8 with no prior knowledge of the gate
has no signal that authoring `disposition.json` is a Step 8
deliverable.

### 1d. Test sites asserting the existing error strings

To be confirmed by Grep at execution time. The test files that
plausibly cover this:

- [ai_router/tests/test_close_session_session4.py](../../../ai_router/tests/test_close_session_session4.py) — most likely site for `mark_session_complete` ↔ gate interaction tests.
- [ai_router/tests/test_close_session_skeleton.py](../../../ai_router/tests/test_close_session_skeleton.py) — covers the CLI `invalid_invocation` path.
- Possibly [ai_router/tests/test_close_session_integration.py](../../../ai_router/tests/test_close_session_integration.py).

The first edit step will be a grep across `ai_router/tests/` for
the literal strings `"disposition.json is required"` and
`"disposition_present"`; every match gets its matcher updated.

### 1e. Existing schema-adjacent docs

No `docs/disposition-schema.md` exists today (verified via Glob).
[ai_router/docs/close-out.md](../../../ai_router/docs/close-out.md)
exists and is referenced by the second error message; it's the
operator-facing close-out CLI reference, not a disposition schema.
A new top-level `docs/disposition-schema.md` is the right place —
discoverable from the workflow doc and from error messages,
parallel to `docs/ai-led-session-workflow.md`.

---

## 2. Edit plan (concrete)

All edits are local to this repo. **No version bump, no VSIX
rebuild** — the extension does not read disposition or close-out
state mechanically beyond the snapshot, which is unchanged.

### 2a. New file: `docs/disposition-schema.md`

Target ~150 lines. Sections in order:

- **Purpose** (one paragraph) — what disposition is, when it's
  written, who writes it, who reads it.
- **When to author** — the canonical place is Step 8 of
  `ai-led-session-workflow.md`, before `python -m
  ai_router.close_session` runs. The gate validates presence; the
  schema validates shape.
- **File location** — `docs/session-sets/<slug>/disposition.json`.
- **Fields table** — every field, type, required-conditions, a
  one-line example.
- **Invariants the gate enforces** — three explicit rules:
  1. `verification_method` ↔ `verification_message_ids` empty/non-empty pairing.
  2. `status == "completed"` AND not final session ⇒ `next_orchestrator` required.
  3. `next_orchestrator.reason.code == "switch-due-to-blocker"` ⇒ `blockers` non-empty.
- **Minimal viable template** — copy-paste JSON for the common
  case (outsource-first, status: completed, mid-set continuation).
- **Common variations** — examples for outsource-last (queue
  method with message ids), `status: "blocked"`, and the
  `is_final_session: true` case (no `next_orchestrator`).
- **Reference** — pointer to [ai_router/disposition.py](../../../ai_router/disposition.py) as the authoritative source; the doc rephrases the dataclass but doesn't re-derive validation logic.
- **`--force` is not a substitute** — short paragraph: `--force`
  bypasses the gate for incident recovery and emits a
  `closeout_force_used` event with the operator's reason. Routine
  closeouts must author `disposition.json`.

### 2b. Edit Step 8 of `docs/ai-led-session-workflow.md`

Target site: lines 1099–1126 (the prose introduction to Step 8).
Replace the third sentence ("It does **not** run git commit /
push / notification …") with an expanded version that:

1. Names `disposition.json` as a Step 8 author-deliverable, before
   `close_session` runs.
2. Links to `docs/disposition-schema.md`.
3. Flags `next_orchestrator` and `blockers` as the two
   most-frequently-missed fields — `next_orchestrator` is required
   when the session is not the last and status is `completed`;
   `blockers` is required when the reason code is
   `switch-due-to-blocker`.
4. Keeps the existing pointer to `ai_router/docs/close-out.md`
   Section 1 for the ownership contract; the new schema doc is the
   *what* the operator authors, close-out.md is the *how* of
   invoking close_session.

Target net delta: +12 lines, -1 line.

### 2c. Edit `ai_router/close_session.py` — Site 1 (gate)

Replace the remediation string at
[ai_router/close_session.py:677-681](../../../ai_router/close_session.py#L677-L681) with (line-wrapped for the source code):

```python
remediation=(
    "disposition.json is required for close-out at "
    "<session_set_dir>/disposition.json. Required fields: "
    "status, summary, verification_method, files_changed, "
    "next_orchestrator (when status='completed' and not the "
    "final session), blockers (when reason='switch-due-to-"
    "blocker'). Schema: docs/disposition-schema.md (or the "
    "Disposition dataclass in ai_router/disposition.py). "
    "Pass force=True to bypass — incident-recovery only; "
    "emits closeout_force_used event."
),
```

`<session_set_dir>` is a placeholder string in the message, not an
f-string substitution — the gate runs before the caller resolves a
path. The schema-doc relative path is what an orchestrator can
search for in the repo.

### 2d. Edit `ai_router/close_session.py` — Site 2 (CLI)

Replace the message at
[ai_router/close_session.py:1306-1311](../../../ai_router/close_session.py#L1306-L1311) with:

```python
outcome.messages.append(
    "disposition.json is required at <session-set-dir>/"
    "disposition.json. Required fields: status, summary, "
    "verification_method, files_changed, next_orchestrator "
    "(when status='completed' and not the final session), "
    "blockers (when reason='switch-due-to-blocker'). "
    "Schema: docs/disposition-schema.md "
    "(or the Disposition dataclass in ai_router/disposition.py). "
    "Pass --force to bypass — incident-recovery use only; see "
    "ai_router/docs/close-out.md Section 5."
)
```

### 2e. Update test string matchers

Grep across `ai_router/tests/` for occurrences of:
- `"disposition.json is required"`
- `"disposition_present"`
- `"incident-recovery"` (in disposition-related contexts)

For each match, update the assertion to match the new prefix
("disposition.json is required for close-out at …" or
"disposition.json is required at …"). Most matchers should be
relaxed to a substring check on a stable phrase
(`"disposition.json is required"` + a schema-doc reference fragment
like `"docs/disposition-schema.md"`) so future minor wording tweaks
don't require test churn.

### 2f. Smoke test (manual; no scratch artifacts committed)

Create a temporary scratch directory; do not commit it. Run:

```
python -m ai_router.close_session --session-set-dir <scratch>
```

Confirm the new `invalid_invocation` message renders with the
schema-doc link and the required-field list. Discard the scratch
dir.

### 2g. Close-out artifacts (Session 1 only — set stays open)

- `docs/session-sets/019-feedback-disposition-and-uat-two-options/session-reviews/session-001-prompt.md` — verification prompt template for the eventual end-of-set verifier (Session 2 owns the actual route).
- `session-state.json` snapshot updates (Session 1 → closed; Session 2 pending).
- `session-events.jsonl` lifecycle events.
- **No `change-log.md` yet** — that's authored at end-of-set in Session 2.
- **No `disposition.json` yet** — same; final disposition is end-of-set in Session 2.
- Git commit of the Session 1 deliverables. **Do not push** until end-of-set, so the whole Set 019 lands as a coherent unit. (Or push after Session 1 if the operator prefers — flag the choice in the action checklist.)
- **No router routes** — Session 1 has zero metered cost.

---

## 3. Risk callouts

- **Test churn.** Test files asserting the old string verbatim
  will fail until the matchers are updated. Mitigation: relax to
  substring matchers on stable phrases as part of the same diff;
  fast-fail test feedback loop (run `pytest` immediately after
  the source edit).
- **Two error-text sites drifting apart over time.** Sites 1
  (gate) and 2 (CLI) carry the same intent but slightly different
  wording today, and the edits keep them similar but not
  identical. Mitigation: not worth deduping into a module-level
  constant — the two contexts are real (one is a `GateResult`
  remediation surfaced in lists alongside other gate failures;
  the other is a top-level `invalid_invocation` message). A
  future cleanup could DRY them, but the spec's scope is "make
  the messages discoverable", not "refactor the error surface."
- **Schema doc + dataclass drift.** Authoring a separate
  `docs/disposition-schema.md` creates a doc that must stay in
  sync with `Disposition` in code. Mitigation: the doc explicitly
  names the dataclass as the authoritative source and rephrases
  it rather than re-deriving validation. Future field additions
  must update both the dataclass and the doc; that ordering rule
  goes into the doc itself.
- **`<session-set-dir>` placeholder confuses the reader.** The
  gate runs in a context where the path *is* known
  (`session_set_dir` is the function argument), but the remediation
  string is generated before the caller decides how to format it.
  Mitigation: the placeholder convention (`<session-set-dir>`) is
  visibly a placeholder. If the operator prefers, the message can
  be parameterized with the actual path at the gate level — that
  changes the gate function signature slightly and is a small
  bonus polish, flagged below.
- **Bonus polish, opt-in:** make the remediation message
  parameterized so the actual `session_set_dir` substitutes for
  `<session-set-dir>`. ~5 lines + 1 test. I'd recommend doing
  this — it's small enough that the cost is genuinely trivial
  and the gain (an orchestrator's error message names the exact
  path) is real. Flagging here so the operator can include or
  exclude in the action checklist.

---

## 4. Out of scope (Session 1)

- **`uatStyle` field, UAT rule split, authoring-guide edits.** Session 2.
- **`docs/upstream-feedback/...` file for W0 runner.** Session 2.
- **Wizard prompt edits in the extension.** Session 2 (and only
  if the wizard's session-gen prompt enumerates config-block
  fields — check first).
- **`--write-template` flag.** Deferred per operator decision.
  Recorded in `change-log.md` at end-of-set as a follow-up
  candidate.
- **Reference from `ai_router/docs/close-out.md` to the new
  schema doc.** That file already references the gate's failure
  modes; the back-link can land in Session 2 or a follow-up. Not
  Session 1's deliverable.
- **Cross-provider verification of the doc edits.** Session 1 has
  no router routes. End-of-set verification is Session 2's job
  per the spec.

---

## 5. Acceptance criteria for Session 1

- [ ] `docs/disposition-schema.md` exists; documents all seven fields, three invariants, minimal viable template, three variation examples.
- [ ] `docs/ai-led-session-workflow.md` Step 8 names `disposition.json` in prose and links to the schema doc; flags `next_orchestrator` and `blockers` as the most-frequently-missed fields.
- [ ] `ai_router/close_session.py` lines ~677-681 and ~1306-1311 — both messages link to the schema doc and name the required-field list.
- [ ] `python -m pytest ai_router/tests/` green.
- [ ] Smoke test: `python -m ai_router.close_session --session-set-dir <scratch>` (no `disposition.json` present) renders the new message text with the schema-doc reference.
- [ ] Session 1 close-out artifacts authored (session prompt, snapshot, events). Git commit.
- [ ] **Set 019 stays open.** Session 2 follows on a later turn.

---

## 6. Decisions still open (waiting on operator)

1. **`<session-set-dir>` placeholder vs parameterized path** —
   2c/2d use a literal placeholder; the alternative is to
   parameterize the gate's remediation message with the actual
   path. Recommendation: **parameterize**. ~5 extra lines, real
   value for orchestrators that copy the error into a doc search.
2. **Push after Session 1, or hold for end-of-set?** Recommendation:
   **hold** — Set 019 lands as one coherent unit. Operator can
   override if they want intermediate visibility on the disposition
   fixes.

---

**Awaiting operator approval. After approval, edits land in the
order 2a → 2b → 2c → 2d → 2e (with the test grep first inside 2e)
→ 2f (smoke test) → 2g (close-out artifacts).**

**Session 1 outcome (2026-05-11, commit `94260a6`):**
All five action-checklist items landed as planned. The
`<session-set-dir>` parameterization (operator's chosen polish from
the open-decisions list) is in both error sites. 741/743 tests pass;
the two failures are pre-existing `test_restart_role.py` PID-mismatch
flakes (confirmed unrelated via stashed-baseline run). `--write-template`
deferred per operator decision. Commit held locally — not pushed
until end-of-set.

---

# Session 2 — UAT two-options split + W0 upstream-feedback handoff

## 1. Findings (from prerequisite reads)

### 1a. Current UAT/E2E rules assume one path (DSL-driven)

[docs/ai-led-session-workflow.md:657-740](../../ai-led-session-workflow.md#L657-L740) frames UAT and E2E as a single coherent flow:

- **§UAT Checklist Rule (657-676)** — every set with `requiresUAT: true` authors `<slug>-uat-checklist.json` matching the `uat-checklist-editor` schema. No mechanism for non-web UAT.
- **§E2E Coverage Before UAT (705-740)** — "every functional checklist item must have a Playwright test that drives the same steps." The mechanical gate is `uat-coverage-review`. Items marked `IsJudgmentItem: true` are exempt. This is the DSL-driven path baked in as the only path.

A non-web consumer (e.g., `dabbler-homehealthcare-accessdb`, MS Access) either:
- Declares `requiresE2E: false` and loses the "human UAT is not the first line of defense" principle entirely (no mechanical floor at all), or
- Tries to fit the Playwright requirement and either ships fake Playwright tests or stalls.

Neither outcome is good. The split this session introduces fixes that.

### 1b. Config-block surface needs `uatStyle` added in three places

The flag has to be visible wherever an author meets the config block:

1. **[docs/ai-led-session-workflow.md:407-413](../../ai-led-session-workflow.md#L407-L413)** — spec-template snippet inside the workflow doc.
2. **[docs/ai-led-session-workflow.md:637-655](../../ai-led-session-workflow.md#L637-L655)** — §"Reading the Session Set Configuration" prose currently enumerates `requiresUAT`, `requiresE2E`, `uatScope`.
3. **[docs/planning/session-set-authoring-guide.md:132-196](../../planning/session-set-authoring-guide.md#L132-L196)** — the authoritative config-block reference (field semantics + defaults).

### 1c. Wizard prompt also enumerates config fields

[tools/dabbler-ai-orchestration/src/wizard/sessionGenPrompt.ts:24-42](../../../tools/dabbler-ai-orchestration/src/wizard/sessionGenPrompt.ts#L24-L42) generates spec stubs with `totalSessions / requiresUAT / requiresE2E / effort`. No `uatStyle`. A spec generated today would need the operator to remember to add it manually for `requiresUAT: true` web sets. Easy fix: extend the prompt's spec template + guideline bullet.

This is the **only TypeScript edit** in Session 2. No extension version bump needed — the prompt is read at clipboard-copy time, not compiled into runtime behavior. (The `vsce package` cycle from prior sets stays untouched.)

### 1d. No existing `docs/upstream-feedback/` folder

Confirmed via Glob. The W0-runner feedback file creates the convention. Per Set 019's spec risks section, the file's lifecycle is "hand-off, not permanent doc" — close-out note will point the operator at it next time `dabbler-uat-dsl` is touched.

### 1e. Rules list at end of workflow doc references the UAT/E2E gates

[docs/ai-led-session-workflow.md:1590-1604](../../ai-led-session-workflow.md#L1590-L1604) — Rules 9, 10, 11 govern UAT/E2E behavior. Rule 11 specifically calls Playwright coverage out. These need `uatStyle: "dsl"` scoping on Rule 11; Rules 9 and 10 stay unchanged (they're style-agnostic).

---

## 2. Design decisions

### 2a. Default: `uatStyle: "ad-hoc"` when `requiresUAT: true` and `uatStyle` omitted

Per Set 019 spec §"What the set delivers" + operator's confirmation
2026-05-11. Universal-core / gated-extensions philosophy — the
lower-scaffolding path is the default; DSL is the gated extension
that opt-in repos declare.

**Trade-off accepted:** `dabbler-platform`'s existing
UAT-enabled specs (the only consumer of the DSL path today) need
to add `uatStyle: "dsl"` to preserve current behavior. Migration
note lands in `change-log.md`; platform updates its own specs in
its next UAT-touching session set on its own schedule.

**Transition heuristic deferred.** The spec floated an
inference rule ("if a spec references Playwright artifacts, infer
`uatStyle: "dsl"`"). Decision: **skip the heuristic.** Reasons:
(i) the migration is a one-off; (ii) heuristics that infer load-bearing
behavior age badly; (iii) the operator owns the platform repo and
will see the migration note. If `dabbler-platform` *forgets* to
migrate, the orchestrator on the next UAT-enabled session there will
fail the new ad-hoc gate (missing `NoProgrammaticPathReason` / missing
programmatic-verification reference on items the spec author expected
Playwright coverage for). The failure message will name the spec's
declared `uatStyle` (default `"ad-hoc"`) and point at the
authoring-guide section — the operator self-corrects by adding
`uatStyle: "dsl"` to the spec.

### 2b. Rule split shape

The current `### UAT Checklist Rule` becomes:

- **Shared preamble** (filename convention, schema, editor URL, inline review results, do-not-bypass-pending-review) — unchanged from current.
- **`### UAT Checklist Rule — DSL-driven path` (uatStyle: "dsl")** — current `### E2E Coverage Before UAT` content moves here. Playwright matching, `uat-coverage-review` gate, `IsJudgmentItem` exemption.
- **`### UAT Checklist Rule — Ad-hoc path` (uatStyle: "ad-hoc")** — new content. Per functional item: either a `ProgrammaticVerification` field (free-form description of the unit/integration/component test or AI exploratory check that satisfies the item) OR a `NoProgrammaticPathReason` (one-sentence justification why human-only is unavoidable). `IsJudgmentItem` carries over unchanged.

`### E2E Coverage Before UAT` section title goes away — its content split across the two new subsections.

### 2c. `NoProgrammaticPathReason` and `ProgrammaticVerification` are forward-compatible

These are new optional fields on checklist items. The
[uat-checklist-editor](https://github.com/darndestdabbler/uat-checklist-editor)
schema doesn't know about them. Two options:

- **Treat as forward-compatible JSON additions.** Editor ignores unknown fields; existing checklists continue to validate. Orchestrator validates the presence of one-or-the-other on functional items. Editor-side work is a separate effort if the operator wants explicit UI support.
- **Update the editor's schema this session.** Heavier; touches a sibling repo; not in scope per Set 019 §Non-goals.

**Decision: forward-compatible.** Match the spec.

### 2d. Verification: API route, single verifier, `architecture` task type

Per Set 019 spec cost projection ($0.10–$0.25 metered,
`outsource-first`, single verifier).

- **Task type:** `architecture` (complexity 80, typical Opus). Because this orchestrator is Opus, the cross-provider rule routes to a non-Anthropic verifier — typically Gemini 2.5 Pro per the router config.
- **Content:** the diff (workflow.md + authoring-guide.md + wizard prompt + this assignment file) plus a one-paragraph design summary (why the split, why default ad-hoc, why forward-compatible).
- **Question to the verifier:** "Does the `uatStyle` split preserve the universal-core / gated-extensions philosophy stated at the top of CLAUDE.md? Are the defaults right (ad-hoc as default, with explicit opt-in to DSL)? Are there cases the split misses?"
- **Saved to:** `docs/session-sets/019-feedback-disposition-and-uat-two-options/verification/<provider>-<model>.md`.

If the verifier returns ISSUES_FOUND with blocking findings,
follow Step 7's adjudication flow. Most likely outcome is either
VERIFIED or a context-gap finding (the verifier asks for something
the prompt didn't include); the latter is resolved with the
reverify-reshaped path, not a redesign.

---

## 3. Edit plan (concrete)

### 3a. Edit `docs/ai-led-session-workflow.md` — config-block surfaces

**Site 1: spec template (lines 407-413).** Add `uatStyle` to the YAML snippet with a comment:

```yaml
requiresUAT: false      # see When-UAT-Is-Required heuristic in authoring guide
requiresE2E: false      # see When-E2E-Is-Required heuristic in authoring guide
uatStyle: ad-hoc        # dsl | ad-hoc; only meaningful when requiresUAT: true. Default ad-hoc.
uatScope: none          # per-session | per-set | none
```

**Site 2: §"Reading the Session Set Configuration" (line 640).** Update prose:

> "Every spec begins with a Session Set Configuration block declaring `requiresUAT`, `requiresE2E`, `uatStyle`, and `uatScope`."

### 3b. Rewrite §"UAT Checklist Rule" and §"E2E Coverage Before UAT"

Replace lines 657-740 with the new three-subsection structure:

1. **§"UAT Checklist Rule" (shared preamble)** — naming convention, schema, editor URL, inline results, do-not-bypass-pending-review. Filename + schema unchanged. Add: "Every spec with `requiresUAT: true` declares `uatStyle: "dsl"` or `uatStyle: "ad-hoc"` (default if omitted). The two paths share this preamble and diverge on the mechanical-verification gate."
2. **§"UAT Checklist Rule — DSL-driven (`uatStyle: "dsl"`)"** — current E2E-Coverage-Before-UAT content, renamed and clarified. Playwright coverage gate, `uat-coverage-review` task, `IsJudgmentItem` exemption, judgment-item sequence-reachability rule.
3. **§"UAT Checklist Rule — Ad-hoc (`uatStyle: "ad-hoc"`)"** — new content. Per functional item:
   - `ProgrammaticVerification: "<one-line reference to the unit test / component test / data-layer assert / AI exploratory check that satisfies this item>"`, OR
   - `NoProgrammaticPathReason: "<one-sentence justification why human-only verification is unavoidable for this item>"`.
   - `IsJudgmentItem: true` still applies and is still exempt.
   - The mechanical gate: orchestrator validates that every non-judgment functional item has one-of-the-two fields populated before notifying. Mismatch blocks notification.
   - No `uat-coverage-review` route on the ad-hoc path (Playwright-specific); the gate is local.

Tail paragraph (after both subsections) preserves the existing "When the spec declares `requiresE2E: true` but `requiresUAT: false`…" guidance, generalized: "behavioral changes ship with E2E coverage, but no UAT checklist is involved."

### 3c. Edit §"When UAT Is Required" (lines 678-703)

Add a `### Choosing uatStyle` subsection at the end of §"When UAT Is Required":

> When the active spec declares `requiresUAT: true`, the author
> also picks `uatStyle`:
>
> - `uatStyle: "dsl"` — web/browser UI changes where the checklist
>   compiles to Playwright via `dabbler-uat-dsl`. The DSL path
>   requires `requiresE2E: true` too; the Playwright suite is the
>   mechanical floor.
> - `uatStyle: "ad-hoc"` — non-web UI (CLI, native, MS Access,
>   COM-driven apps, IDE plugins, etc.) where Playwright is not
>   applicable. Items declare per-item programmatic verification or
>   a `NoProgrammaticPathReason`.
> - **Default when omitted:** `"ad-hoc"`. This is the lower-scaffolding
>   path; DSL is opted into explicitly.
>
> Mixed surfaces (a set whose work spans web and non-web)
> should split into sibling sessions or sibling sets if practical;
> otherwise pick the `uatStyle` that covers the majority of
> functional items and use ad-hoc-mode for the rest within a single
> checklist.

### 3d. Edit Rule 11 in the rules list (line 1597-1604)

Current rule:

> 11. **E2E coverage before UAT handoff** *(applies only when the active spec declares both `requiresUAT: true` AND `requiresE2E: true`).* Every functional checklist item must have matching Playwright coverage and pass `uat-coverage-review` before the checklist is …

New rule (scope tightened to DSL path):

> 11. **E2E coverage before UAT handoff (DSL path only)** *(applies only when the active spec declares `requiresUAT: true`, `requiresE2E: true`, AND `uatStyle: "dsl"`).* Every functional checklist item must have matching Playwright coverage and pass `uat-coverage-review` before the checklist is committed. Items marked `IsJudgmentItem: true` are exempt.

Add a new Rule 11.5 (or 12; renumber as needed):

> **Programmatic-verification floor (ad-hoc UAT)** *(applies only when the active spec declares `requiresUAT: true` AND `uatStyle: "ad-hoc"`).* Every non-judgment functional checklist item must declare either a `ProgrammaticVerification` reference or a `NoProgrammaticPathReason`. The orchestrator validates this before notifying.

### 3e. Edit `docs/planning/session-set-authoring-guide.md`

**Site 1: config-block reference (lines 132-196).** Add `uatStyle` field documentation between `requiresE2E` and `uatScope`:

```markdown
- **`uatStyle: "dsl"`** — checklist items compile to Playwright
  tests via `dabbler-uat-dsl`. Requires `requiresE2E: true`. The
  `uat-coverage-review` task gates handoff.
- **`uatStyle: "ad-hoc"`** — checklist items are human-runnable
  steps; each functional item declares either a
  `ProgrammaticVerification` reference (unit/component/data-layer/AI-
  exploratory) or a `NoProgrammaticPathReason`. Appropriate for
  non-web surfaces.
- **Default when `requiresUAT: true` and `uatStyle` omitted:**
  `"ad-hoc"`. Per universal-core / gated-extensions: the
  lower-scaffolding path is the default; DSL is the gated extension
  that opt-in repos declare. *Note for `dabbler-platform`: existing
  UAT-enabled specs need to add `uatStyle: "dsl"` to preserve current
  behavior — see [docs/disposition-schema.md](TODO no, change-log) for the migration note.*
```

(The migration-note pointer will land in this set's `change-log.md`,
not the schema doc — fix the cross-reference at write time.)

**Site 2: §"When UAT is required" (around line 199-227).** Add a
parallel `### Choosing uatStyle` subsection mirroring the
workflow-doc one (3c above). Authoring guide owns the *which to
pick*; workflow doc owns the *what it does at execution time*.

### 3f. Edit `tools/dabbler-ai-orchestration/src/wizard/sessionGenPrompt.ts`

Two small changes inside the `PROMPT_SYSTEM` template literal:

**Spec template (lines 26-30):** add `uatStyle`:

```yaml
totalSessions: <estimate 1–6>
requiresUAT: <true|false>
requiresE2E: <true|false>
uatStyle: <ad-hoc|dsl>      # only when requiresUAT: true; default ad-hoc; dsl = web w/ Playwright
effort: <low|normal|high>
```

**Guidelines (lines 40-42):** add bullet:

> - When `requiresUAT: true`, set `uatStyle: dsl` for web/browser UI (compiles to Playwright via dabbler-uat-dsl) or `uatStyle: ad-hoc` for non-web surfaces (CLI, native, Access, COM apps). Default is `ad-hoc`.

**No version bump, no VSIX rebuild.** The prompt is read at
`generateSessionSetPrompt` invocation time (line 92:
`vscode.env.clipboard.writeText(prompt)`); the next clipboard-copy
picks up the change. Verified via inspection of the file's only
runtime path.

### 3g. Author `docs/upstream-feedback/2026-05-11-w0-runner-pre-signin-conflict.md`

Format: GitHub-issue-ready. Sections:

- **Repo:** `darndestdabbler/dabbler-uat-dsl`
- **Suggested issue title** — restated from the platform feedback.
- **What happens** — concrete reproduction (the wrapper's `SeededSignInAsync` line, the DSL's `NAVIGATE TO "/login"` first step, the `GetByLabel("Email address")` timeout on `/dashboard`).
- **Why a consumer can't work around it on their end** — runner overwrites the wrapper on every compile; suppressions only quiet validators; hand-authoring deprecates W0.
- **Three concrete suggestions** ordered by leverage:
  1. Auto-detect DSL-driven login (first nav step → `/login`).
  2. Explicit CLI flag `--no-pre-sign-in`.
  3. `PreSignIn: false` checklist top-level field.
- **Cross-reference** — `dabbler-platform/admin-users-cross-links/Session 1` as surfacing context.
- **Status of consumer-side workaround** — what the platform did in the meantime (W2 blocker in `disposition.json`; bUnit coverage of programmatic concerns; re-run W2 once the runner enhancement lands).

### 3h. End-of-set close-out artifacts

- `docs/session-sets/019-feedback-disposition-and-uat-two-options/change-log.md` — narrative summary of both sessions' deliverables, the `dabbler-platform` migration note, `--write-template` follow-up callout, cumulative spend reconciliation.
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/disposition.json` — `status: "completed"`, `verification_method: "api"` (post-route), `verification_message_ids: []`, `files_changed`: full list across both sessions, `next_orchestrator: null` (final session of the set), `blockers: []`.
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/activity-log.json` — full session 1 + 2 step records.
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/session-state.json` — flip to `status: "complete"`, `lifecycleState: "closed"`, `completedAt` timestamp.
- `docs/session-sets/019-feedback-disposition-and-uat-two-options/verification/<provider>-<model>.md` — saved verifier response.

### 3i. Run tests + commit + push + close-out

- `python -m pytest ai_router/tests/` — must stay green (same 741/743 baseline).
- Commit Session 2's deliverables.
- **Push** Session 1's `94260a6` + Session 2's commit together — Set 019 lands as a coherent unit per the operator's call.
- Run `python -m ai_router.close_session --session-set-dir docs/session-sets/019-feedback-disposition-and-uat-two-options/` — the close-out gate now finds a present, valid `disposition.json` (Session 1's gate-fix dogfooded on its own set).

---

## 4. Risk callouts (Session 2 specific)

- **Default-ad-hoc silently downgrades existing UAT-enabled specs.** Same as the spec's risks section. Mitigation: change-log.md migration note. If platform's next UAT session breaks, the failure message points at the fix.
- **Editor schema drift.** `uat-checklist-editor` doesn't know about `ProgrammaticVerification` or `NoProgrammaticPathReason`. Mitigation: forward-compatible per 2c; editor-side support deferred.
- **Wizard prompt clipboard timing.** No version bump means the user must re-copy the prompt to pick up the new guidance. Acceptable — the prompt is a low-friction copy-and-paste action; new sets generated tomorrow get the new fields.
- **Rule 11 / 11.5 renumbering touches doc references.** Rules list is referenced from a few places. Mitigation: grep for "Rule 11" and "Rule 9" / "Rule 10" before reordering; preserve existing reference numbers by ADDING a sub-numbered rule (11a/11b) rather than inserting between integers.
- **Verifier returns ISSUES_FOUND with a context-gap finding.** Probable outcome shape. Mitigation: the prompt includes the diff, the design summary, AND the universal-core / gated-extensions sentence from CLAUDE.md so the verifier has the philosophical frame.
- **Verifier times out or fails.** Two-attempt fallback per workflow doc; if both fail, log a Major issue, commit anyway, surface to operator. Per cost projection ($0.10–$0.25), single attempt is $0.05-$0.10; fallback is the same.

---

## 5. Out of scope (Session 2)

- **`dabbler-platform` spec migration.** Platform updates its own UAT-enabled specs in a future session set on its own schedule. Set 019 documents the requirement; doesn't perform it.
- **`uat-checklist-editor` schema update.** Forward-compatible additions only; editor-side work is a separate effort.
- **`uat_runner` (W0 runner) code changes.** Lives in `dabbler-uat-dsl`. This set produces only the upstream-feedback artifact.
- **`--write-template` flag for `close_session`.** Deferred per operator decision in Session 1. Restated as a follow-up candidate in `change-log.md`.
- **Set 020 (`complexity-critical-review`).** Sibling set; not bundled. Spawned after Set 019 closes.
- **`ai_router/docs/close-out.md` back-link to `docs/disposition-schema.md`.** Could land in Session 2 as a one-line addition; flagged as optional polish below.

---

## 6. Acceptance criteria for Session 2

- [ ] `uatStyle: "dsl" | "ad-hoc"` documented in `docs/planning/session-set-authoring-guide.md` config-block reference, with `"ad-hoc"` as default-when-omitted (`requiresUAT: true`).
- [ ] §"Choosing uatStyle" subsection added to authoring guide AND mirrored summary added to workflow doc.
- [ ] §"UAT Checklist Rule" in workflow doc is restructured into shared preamble + DSL-driven subsection + Ad-hoc subsection. Former §"E2E Coverage Before UAT" content rehomed in the DSL subsection.
- [ ] Rules list (workflow doc) — Rule 11 scoped to `uatStyle: "dsl"`; new programmatic-verification-floor rule added for `uatStyle: "ad-hoc"`.
- [ ] Wizard prompt at `tools/dabbler-ai-orchestration/src/wizard/sessionGenPrompt.ts` includes `uatStyle` in the spec template + a guideline bullet.
- [ ] `docs/upstream-feedback/2026-05-11-w0-runner-pre-signin-conflict.md` exists, GitHub-issue-ready.
- [ ] `change-log.md` includes the `dabbler-platform` migration note and the `--write-template` follow-up callout.
- [ ] `disposition.json` exists, validates, `next_orchestrator: null`, `blockers: []`. Dogfoods the Session 1 gate fix.
- [ ] `python -m pytest ai_router/tests/` green (741/743 baseline preserved).
- [ ] Cross-provider verification routed; response saved under `verification/`; no blocking issues from the verifier (or, if blocking, adjudication recorded and resolved).
- [ ] Set 019 commits pushed; `close_session` succeeds; all five close-out gates pass.

---

## 7. Decisions still open (Session 2)

1. **Field name choice — `ProgrammaticVerification` vs alternatives.** Alternatives: `ProgrammaticCheck`, `VerifiedBy`, `Coverage`. Recommendation: **`ProgrammaticVerification`** — verbose but unambiguous; matches existing terminology in the workflow doc (`uat-coverage-review`, `verification_method`, `verification_message_ids`). Push back if you'd rather have something tighter.
2. **Cross-provider verifier — let the router pick, or constrain to Gemini 2.5 Pro?** Recommendation: **let the router pick.** Routing already enforces cross-provider; constraining to a specific verifier here would be premature given the router's existing logic.
3. **Optional polish: add a one-line back-link from `ai_router/docs/close-out.md` to `docs/disposition-schema.md`.** Recommendation: **include.** Adds ~3 lines; closes the doc loop. Low cost.

---

**Awaiting operator approval. After approval, edits land in the order 3a → 3b → 3c → 3d → 3e → 3f → 3g → 3i (tests + close-out artifacts in 3h order last).**
