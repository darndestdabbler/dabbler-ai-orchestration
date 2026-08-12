# Set 123 — Verify-type resolution and startup simplification

## What this set was for

The operator's framing, 2026-08-11: *replace the setup webview with a file
plus an environment variable, infer the verification type, and confirm it
only when inference is ambiguous.*

Two things were wrong at once. The answer to **"what verifies this project"**
was recorded in two places that could disagree — a `transport.profile` in
`ai_router/router-config.yaml` (or a seat-local `local-overrides.yaml`) and,
implicitly, whatever the operator had clicked in a webview form. And the
surface that asked the question was a webview: a form, a system-status strip,
a config editor and a cost dashboard, plus the Playwright scenarios that
proved they rendered.

The set ends with one file, one resolver, one derivation, and no webview.

## What shipped

**Session 1 — one entry point that resolves the type.**
`ai_router/verify_type.py` implements the operator's three-branch rule as a
single function: `project-verify-type.txt` at the project root if present and
valid → else `AI_ORCHESTRATION_VERIFY_TYPE` as a *suggestion* confirmed once
and written to the file → else a guided setup printed to the terminal the
agent is already in. `config.load_config` no longer defaults
`transport.profile` independently; it calls `derive_transport_profile()`
after the local-overrides merge, so **the committed project file outranks
both the tracked config and the seat-local override** and the `api` default
is the last step of resolution rather than a parallel answer. An invalid
value in either place is reported, never guessed at — a bad project file does
not fall through to the environment.

**Session 2 — the qualified verdict.** The `DIRECT_API` precondition is that
at least one provider has a key *and differs from the current orchestrator*.
When that cannot be met, the session proceeds and the record says so:
`check_direct_api_precondition()` compares against the **effective** provider
from `orchestrator_identity` (never a configured seat label),
`route()` warns on stderr and yields the orchestrator exclusion on that one
degraded path, and `classify_verification_qualification()` is the single
mechanism deciding whether a verdict is qualified. The qualification travels
omit-null on the three router-owned records, and
`validate_stamped_row` check 5 enforces it as a **bijection** — a
same-provider row passes only if it declares the qualification, and a
cross-provider row declaring it is refused — so a weaker verdict can neither
pass as corroborated nor let the flag become decorative.

**Session 3 — delete the webview.** Every webview in the extension is gone:
the Getting Started / System Status view, the visual config editor, the cost
dashboard, and the QuickPick-driven `wizard/` commands. The extension now
contributes exactly one view, the native Work Explorer tree. The activity-bar
container is `AI Orch`, so the header reads **AI ORCH: WORK EXPLORER**
instead of the same words twice. Net **−12,294 lines** of source, tests and
assets; Layer 3 went from **39 scenarios in 6.7 minutes to 31 in 4.1**.

## Decisions that shaped it

**The file is the single source of truth and `transport.profile` is derived
from it** (operator, settling the design doc's open question 4). Two
mechanisms for one fact is a defect class this repo had hit three times; the
set had to end with one.

**Same-provider verification is allowed, and warns.** Operator ruling,
verbatim: *"Verification with the same provider is better than no
verification at all, but the results should be flagged with this
limitation."* Session 2 discovered that honouring it meant **relaxing a
machine-enforced close gate** — today's behaviour with no different-provider
verifier is not "no verification", it is `verification_unavailable`. That is a
verification reduction, which is never self-authorized, so the session stopped
and the operator re-ruled for the automatic path.

**The deletion had to be earned before it was made.** Session 3's step 2
walked a true cold start (`L-079-3`) from two fresh `git init` folders holding
nothing but `.git` — no project file, no environment variable, no
`router-config.yaml`. Both branches reached a committed answer purely in the
terminal, and the committed file overrode a deliberately disagreeing
configured profile in both directions. Had that walk needed the webview, the
deletion would not have happened.

**The spec's deletion list was a measurement error, and the operator
re-scoped it.** The spec (and the design doc before it) named `configEditor/`,
`wizard/` and `dashboard/` as "the Getting Started / setup webview". Checked
against the code: `wizard/` makes **zero** webview API calls — it is three
QuickPick commands; `configEditor/` exports two libraries a *surviving*
command depends on; and the actual setup webview (~2,459 lines across
`SetupStatusView`, `systemStatus`, `gettingStartedActions`,
`gettingStartedDetection`, the protocol module and `media/session-sets-tree/`)
was never named in the spec, yet is exactly what the 8 retired Layer 3
scenarios drive. The spec's letter would have left the setup webview alive
while deleting three unrelated palette commands. The operator ruled: delete
every actual webview **plus** `wizard/`, accepting the loss of Import Project
Plan and the two prompt generators. Shared code was **relocated, not
deleted**.

## What verification bought

Every session's findings were accepted; none was disputed.

Session 1 took five rounds and the routed reader was right every time. The
pattern was one class: *the orchestrator kept writing "the file wins" and
testing the case where a file exists* — every finding lived in a combination
where one of two projects had not chosen.

Session 2 took four rounds, six findings, and the class was *the machinery is
correct and unreachable*: `_init()` died at config load before the
precondition could run; the CLI re-imposed the exclusion `route()` had just
lifted; the qualification was dropped by the metrics writer the close gate
reads; the disposition JSON Schema rejected the field the code writes; and
disabling a keyless provider left its **models** selectable.

Session 3 took four rounds. The one that mattered: deleting `wizard/` also
deleted the registration of **`Dabbler: Open Module Plan`**, a command the
operator never retired — while `package.json` still contributed it and module
rows still emitted `;can-open-plan;`, so the inline action stayed visible and
would have failed with command-not-found on the main module workflow. `tsc`
was happy (the whole import went, so nothing dangled), the menu-parity suite
checked *menu → contributes* rather than *contributes → registration*, and no
Layer 3 spec clicks Open Plan. Both discovery lenses found it independently.
A supplementary pass then caught a stale claim Session 1 had itself
falsified: the seat-setup failure messages promised the router "keeps
`transport.profile: api`" via `local-overrides.yaml`, which the new
derivation makes false on any project that committed `COPILOT_CLI`.

## What it cost to be wrong about docs

Session 3's first docs fix was **rejected** in remediation-review, correctly:
the rewrite of `docs/quick-start.md` removed one false claim and introduced
another, saying the palette scaffold writes `ai_router/budget.yaml` when that
path passes no budget and writes no file. A doc rewritten *from* a stale claim
can land on a different stale claim; a doc sweep needs the same grep-every-
echo discipline as a code fix.

## Residuals

- **The extension is not published.** `package.json` stays at `0.51.0` and the
  deletion is recorded under `[Unreleased]`; the Marketplace push remains
  operator-gated on the existing Set 112 deferral.
- **`media/getting-started.png` is deleted** and the README no longer shows a
  setup screenshot. The Work Explorer hero shot is unaffected.
- **`scripts/verify_vsix_claims.py` is annotated as superseded** rather than
  rewritten — it is pinned to `0.49.0` and has been unable to pass since; the
  claims that survived it are enforced as Layer 2 gates.
- **32 pre-existing Electron-mode Layer 2 failures** remain, verified as
  present at `HEAD` before this session's work: VS Code 1.132.1 makes
  `workspace.workspaceFolders` getter-only, which breaks a test helper that
  assigns it. Not this set's to fix, and not this set's to hide.

---

## Step 9 — guidance reorganization review (final session)

**Outcome: two changes made, one recommendation left for the operator.**

**1. A preload-ceiling breach, caused and then fixed here.** Adding the
`What verifies this project` section to the three bootstrap files pushed
`AGENTS.md` to 2,202 tokens against a 2,031 ceiling, and the preload total
to 12,064 against 12,000. Ceilings ratchet **down** only, so the fix was to
remove prose, not to raise a number: the new section was compressed to an
eight-line pointer at its canonical doc, and the `Session state schema`
section — sixteen lines restating what `docs/session-state-schema.md` and
the workflow doc already own — was cut to five. `AGENTS.md` now sits at
2,003 tokens (99% of ceiling) and the total at 11,865.

Worth recording for the next set: `AGENTS.md` was **already** at ~2,037
tokens before this session, a hairline breach nobody had caught. It is under
now, but the file has no headroom left. The next section anyone adds must
displace one.

**2. Lesson citations flagged three archived lessons as instrumental.**
`cite_lessons` reported `L-069-1` (a bug is a bug CLASS), `L-079-3`
(dogfood the true cold start) and `L-064-12` (manifest changes run full
Layer 3) as archived-but-used. All three earned their keep here: L-079-3 is
the rule that gated the deletion, L-064-12 is why the full Layer 3 ran, and
**L-069-1 was the failure mode of this session, twice** — two verification
rejections, both because a fix was applied to the reported line rather than
to the class.

No reactivation is recommended. Their rules already live in
`project-guidance.md`, which is preload, so the active tier would be pure
redundancy — and the tier has no room. The citation counters now record the
usage, which is what drives future archival decisions.

**3. One recommendation for the operator, not actioned here.**
`docs/planning/verify-type-resolution.md` still contains the measurement
that sent this session wrong: *"The webview surface is 3,576 lines
(configEditor/ 2,671 + wizard/ 583 + dashboard/ 322)."* Two of those three
were never the setup webview, and none of the three exists now. It is a
design doc rather than a session record, so unlike `docs/session-sets/**`
it is fair game to correct — but correcting it is a judgement about how much
of a superseded design doc to preserve, and this session had already spent
one operator stop on scope. Left as a named residual rather than quietly
rewritten.

**No changes recommended to `lessons-learned.md`.** The two active lessons
this session leaned on, `L-112-1` (ship gates with falsifiers) and
`L-064-8` (a replacement doc inherits the retired doc's claims at its
peril), were both directly instrumental and are correctly worded. L-064-8 in
particular predicted this session's exact failure twice over; it does not
need restating, it needed obeying.
