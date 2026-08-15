# Release and Listing Truth Spec

> **The release set for `dabbler-ai-router 1.0.0` and extension `0.51.0`.**
> Both artifacts have been staged and operator-gated since 2026-08-09/10, and
> roughly twenty sets have landed since. This set does not decide whether to
> publish — the operator has. It makes the thing being published **describe
> itself truthfully**, then records what actually shipped.

## Session Set Configuration

```yaml
requiresUAT: false        # No new rendering surface. The deliverables are release notes, listing copy and a policy ruling — judged by a diff, a published listing, and a journal entry.
requiresE2E: false        # No extension source changes. The README and media are packaged, not executed; Layer 3 has nothing new to assert.
uatStyle: ad-hoc
prerequisites:
  - slug: 121-guidance-becomes-executable
    condition: complete
```

> **`pathAwareCritique` is deliberately absent** — the guide's default is
> `none`, and a set that declares nothing pays nothing. This set changes no
> gate, removes no verification control, and ships no product code.

---

## Why this set exists now

Three facts, established out-of-band on 2026-08-15 and re-derivable:

1. **The read-only tool grant is unpublished.** `READ_ONLY_TOOLS` landed in
   commit `d13e7b9d` (Set 125), which is **not an ancestor of `v0.34.0`** —
   verify with `git merge-base --is-ancestor d13e7b9d v0.34.0`. Six staff are
   running the seat transport on the published router, where a routed call —
   including a verifier — holds `--allow-all-tools` with no
   `--available-tools` allowlist. That is the configuration that modified 23
   files in this repo on 2026-08-12.
2. **That fix has no changelog entry.** `grep -rl "Set 125" ai_router/changelog.d/`
   returns only the Set 120 S3 fragment, which mentions it in passing. The
   release notes, as they stand, do not tell a reader that routed calls could
   previously write to their workspace.
3. **`1.0.0` is breaking.** It refuses `tier: lightweight` at config load. That
   failure was *designed* to be loud, immediate and one line to fix, which is
   why the remedy is documentation rather than detection — see
   **Limitations of record** below.

The Marketplace listing is rendered from
`tools/dabbler-ai-orchestration/README.md` **inside the VSIX**, so listing copy
only reaches users at publish time. The screenshot is different: the extension
README references media by absolute `raw.githubusercontent.com` URL pinned to
`master`, so images update on push without a republish.

---

## Sessions

### Session 1 of 2: Say what shipped, and say it well

Everything in this session must be in the commit that gets tagged.

**Steps:**

1. Register.
2. **Write the missing Set 125 changelog fragment, then fold both targets.**
   Author `ai_router/changelog.d/` fragment for the read-only tool grant: what
   a routed call could do before (arbitrary shell, file create/edit, sub-agent
   spawning against the live working tree), what it can do now (`view`,
   `grep`, `glob`), and why it matters (a verifier able to edit the code it
   judges can report VERIFIED on its own edit). State it as the
   consumer-visible security-relevant change it is, not as a refactor. Then
   run `python -m ai_router.changelog fold --target router` and
   `--target extension` so the tagged commit carries real version sections
   rather than 16 loose fragments. **Do not invent entries for sets that
   already have fragments** — fold what is there; the gap being closed is
   Set 125 specifically.
   **Then make the breaking change self-remedying in the same pass.** The
   `1.0.0` section must state, at the top and in one screen: the symptom a
   user actually sees (config load refuses the spec), the one-line fix, and a
   working link to
   `docs/cross-repo-lightweight-removal-notice.md`. This replaces detection
   with remediation on purpose — it reaches every consumer of an open-source
   package, which no sweep of known checkouts can do.
3. **Rework the extension README into the Marketplace listing.** This is the
   pitch, and it is the artifact six staff and every future adopter read.
   Lead with what the framework *is* — the work is organized and standardized,
   and the verification is one you can check — not with what the AI writes.
   Use the new `media/ai-work-explorer.png` (committed in `d370e8f0`),
   referenced by **absolute raw.githubusercontent URL** like the existing
   image; a relative path does not render on the Marketplace. Also refresh
   `package.json`'s `description` and `keywords`, which are what Marketplace
   *search results* show and which are equally baked at publish.
   **Claim auditability, never efficacy.** Supported: the verifier is chosen
   by excluding the orchestrator's own provider (resolved from the model id,
   not a self-reported label); a session blocks rather than passing when no
   different-provider verifier exists; a close with no cross-provider evidence
   runs the verification itself; a finding closes only when its criterion
   fails before the fix and passes after; rounds are bounded and only the
   operator may authorize another; full suites run before commit, push and
   close. **Not supported and not to be claimed:** any defect-catch rate or
   "catches bugs before they ship" — the framework has never measured what
   fraction of real defects it finds. Keep the register of the existing docs
   (*"it is containment, not a sandbox, and the docs must not claim
   otherwise"*); that candour is the most credible asset here and a marketing
   pass must not sand it off.
4. **Correct the root README's two false statements.** It calls the tree
   "Session Set Explorer" (Set 132 S1 renamed it to **AI Work Explorer**, and
   `package.json` agrees; the stale phrase is line-wrapped, so grep for both
   halves). And its Prerequisites section states API-key accounts for all
   three providers are required — wrong for the Copilot-seat population that
   Sets 078/112 exist to serve, and wrong for the six staff now using it.
   Reconcile it with the seat path described earlier in the same file.
5. Cross-provider verification.
6. Required portion of the full test suite.
7. Close-out.

**Creates:** `ai_router/changelog.d/` fragment for Set 125
**Touches:** `ai_router/CHANGELOG.md`, `tools/dabbler-ai-orchestration/CHANGELOG.md`, `tools/dabbler-ai-orchestration/README.md`, `tools/dabbler-ai-orchestration/package.json`, `README.md`
**Ends with:** the content of the commit about to be tagged is true — the
read-only tool grant has its own changelog entry, the `1.0.0` section states
the breaking change's symptom, one-line fix and remedy link on one screen,
both changelogs carry folded version sections, the Marketplace listing
describes the framework accurately and claims nothing about efficacy, and the
root README's two false statements are gone.
**Progress keys:** `toolGrantDocumented`, `breakingChangeSelfRemedying`, `changelogsFolded`, `listingReworked`, `rootReadmeTrue`

> **The operator tags after this session closes, not during it.** The
> `require-green-test` gate blocks both publish workflows until `Test` is green
> on the tagged commit, so the sequence is: close → push → CI green → operator
> pushes `v1.0.0` and `vsix-v0.51.0`. Pushing and tagging within the same few
> minutes leaves the gate waiting. **No session may push a tag.**

---

### Session 2 of 2: Confirm and correct the record

Runs after the publish. Nothing in it can be done before.

**Steps:**

1. Register.
2. **Confirm both registries are live and correct the release-status row.**
   Verify `dabbler-ai-router 1.0.0` on PyPI and the extension `0.51.0` on the
   VS Code Marketplace and Open VSX, then update
   `docs/repository-reference.md` → *Current release status* to say what is
   live rather than what is staged. **This row has been wrong twice** — Set
   112 S3 found it still naming `0.33.0` live nine releases on, and Set 107 S1
   found it claiming `0.46.0` was staged after it had shipped. Both times the
   publish happened and the row was never updated, which is why correcting it
   is a named deliverable and not bookkeeping. Record the workflow run ids and
   the tagged commit, as the surrounding rows do.
3. **Journal the deletion-cost ruling.** Operator decision, `authority=human`,
   via `python -m ai_router.decision_journal`: *deleting a test whose only
   subject is deleted code is not a verification reduction.* The reasoning to
   record: the framework currently makes addition cheap and deletion
   expensive, because deleting a module means deleting its tests, and reducing
   verification is a hard human-only carve-out that an orchestrator may never
   self-authorize. Measured symptoms — 4,640 tests, ~+29 test functions/day,
   **zero guards ever retired**; Set 116 S3 demoted five gates and deliberately
   deleted nothing; of six modules scheduled for deletion three went and the
   three survivors *grew* (`contract_gate` 1,158 → 1,319, `spec_admission`
   403 → 1,082, `replacement_gate` 546 → 652). Pair it with the extension of
   the existing rule *"no gate is added without deleting one"* from gates to
   **modules**. This is a ruling, not an implementation: no code changes here.
4. Cross-provider verification.
5. Required portion of the full test suite.
6. Close-out.

**Creates:** `change-log.md`; a `decisions.jsonl` entry for the deletion-cost ruling
**Touches:** `docs/repository-reference.md`
**Ends with:** both registries confirmed live with run ids recorded; the
release-status row states what is live; the deletion-cost ruling is journaled
with the operator as authority, so the next paring set inherits a decision
rather than re-litigating one.
**Progress keys:** `registriesConfirmed`, `statusRowCorrected`, `deletionRulingJournaled`

> **Step 9** (the reorganization review of `project-guidance.md` /
> `lessons-learned.md`) runs after the notification, as the terminal session of
> the set.

---

## Limitations of record

**Consumer repositories are not swept, and this set does not treat that as a
gap to close.** The extension is an open-source effort used by government
employees; accessing their repositories is prohibited. That is a legal and
organizational constraint, not a scheduling one, and no version of this set may
reintroduce an obligation that depends on it.

What stands in its place:

- **The operator's attestation, 2026-08-15:** staff are using the published
  extension and have reported no major issues. That is the evidence of record
  for the currently published versions.
- **The remedy is documentation, not detection** (Session 1 step 2). A loud
  fail-closed error plus a one-line fix in the release notes reaches *every*
  consumer of a public package, including the ones nobody here can enumerate.
  A sweep of two known checkouts never covered that population.

**The one residual, stated precisely so it is not rediscovered as a surprise.**
The published extension `0.47.0` still renders the Getting Started tier radio,
which Set 112 removed in `0.50.0`. A user who scaffolded a set on `0.47.0` may
hold a `spec.md` declaring `tier: lightweight`; on upgrading the router to
`1.0.0` that spec fails to load until the line is removed. Note the direction
this points: it is an argument **for** shipping extension `0.51.0` alongside
the router, not against it, because `0.51.0` is what stops new specs being
written that way.

## Non-goals

- **Implementing `WORK_STEP_BUDGET = 4`.** The operator's 2026-08-14 ruling
  owes its implementation to a follow-on set. It touches
  `authoring.max_steps_per_session` and the admission gate, and mixing a
  policy change into a time-boxed release is how a Monday morning slips.
- **Acting on the ceremony measurement.** The 2026-08-15 out-of-band analysis
  found ceremony cost per step rising 7.1 → 16.3 min while work per step stayed
  flat at ~7.1. That is the strongest simplification signal on file and it
  belongs to its own set, authored on its own evidence.
- **Any product code change.** If verification raises a code finding outside
  these five artifacts, record it as a residual with a named owner rather than
  fixing it here; a release set that starts changing code invalidates the very
  artifact it is describing.
