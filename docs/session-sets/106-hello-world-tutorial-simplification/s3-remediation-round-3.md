# S3 — Remediation after the discovery harvest (rounds 1–2)

> **Scope of this sidecar.** Round 1 (discovery, fan-out 2/2) returned **18
> blocking findings**; round 2 (supplementary completeness critic, run *before*
> any remediation, per the loop discipline) returned **2 more**. The fan-out
> duplicated five findings across its two calls, so the merged harvest is
> **15 distinct defects**. **Every one is accepted; none is disputed.**
>
> They are overwhelmingly of one kind, and it is the kind this session exists to
> avoid: *a step that cannot be performed from the state the previous step left
> behind.* Both gates this session ran were green while all fifteen were live —
> which is exactly the limitation `s3-authoring-gates.md` names in its own
> "what these gates do not establish" section. A correct string is not a
> followable instruction. That section was written before the verifier proved
> it, and the verifier proved it.

## Fan-out de-duplication

| Merged defect | Round-1 finding(s) | Round 2 |
| --- | --- | --- |
| A — Marketplace version | 1, 13 | — |
| B — Sam cannot merge without an approval | 2, 14 | — |
| C — CODEOWNERS already requests the reviewer | 3, 17 | — |
| D — unconditional commit after the sessions committed | 4 | — |
| E — the CI log cannot show what Walk 9 requires | 5 | — |
| F — Walk 11 has no Azure DevOps repository | 6, 16 | — |
| G — "required approvals 0" is not a selectable value | 7 | — |
| H — personal repos have no collaborator **Write** role | 8 | — |
| I — the macOS key probe is bash-only | 9 | — |
| J — neither scene 1 installs the Azure CLI | 10, 15 | — |
| K — "install whichever agent you use" is not literal | 11 | — |
| L — the checklist preconditions contradict Walk 1 | 12 | — |
| M — scene 1 never checks the VS Code version | 18 | — |
| N — the ADO take needs a private repo the README forbids | — | 1 |
| O — the direct-API route still sends Sam to the Copilot CLI | — | 2 |

## What was fixed, and how

### A — the scripts install a Marketplace version that predates the templates they teach

Extension **0.46.0** (Session 2) is what re-cut `CODEOWNERS` and
`monorepo-ci.yml`; the Marketplace still serves **0.45.0** because the publish is
operator-gated. Scene 1 said "install from the Marketplace" with no version
check, so a recorder following it today scaffolds the *old* templates and scene
4 beat 13's "add two steps" edit does not match the file on screen. The
checklist silently substituted a local VSIX, which made the contradiction worse:
Walk 13 asks whether every beat was performed **as written**, and this one could
not be.

**Fixed** by making the branch explicit *in the script*, where it belongs, so
the substitution is a scripted path rather than an undocumented deviation:
scene 1 beat 2 and the direct-API take's beat 2 now tell the recorder to read
the version on the extension page and, if it is behind 0.46.0, install the local
build via **Install from VSIX…** and say so on camera. Checklist Walk 1 step 1
now points at that branch instead of overriding the script, and the precondition
says in as many words that this is *the one deliberate departure* in the walk and
that the script sanctions it.

### B — Sam cannot merge either of the two pull requests he opens after approvals are raised

Part 5 raises required approvals from 0 to 1, and the next two pull requests are
opened by their own authors. Neither the tutorial nor the scripts told anyone to
approve them. This was **certain on the scripted state**, not an edge case.

**Fixed in four places**, and turned into teaching rather than a patch — this is
the first moment in the tutorial where somebody else's decision is load-bearing,
so the scripts now say so:

- Tutorial Part 5 step 5 — "**Ask Sam to approve it**: you raised approvals to 1
  a moment ago, and you cannot approve your own pull request."
- Tutorial Part 5 step 6 — Sam's lifecycle PR "is all planning files, so no
  CODEOWNERS rule matches and nobody is requested automatically — Sam asks
  **you** to approve it".
- Scene 5 beat 8 — the approval is now a scripted action with its own narration,
  and the **See** clause pins the disabled/enabled Merge button on both sides of
  it. It was previously an "If this fails on camera" note, which was wrong: it
  does not *fail*, it *always* happens.
- Scene 5 beat 12 and checklist Walks 7–8 — same, from Sam's side.

### C — CODEOWNERS already requests the reviewer, so the manual request is a no-op

The rules land on `main` in Part 5 step 5. Sam's implementation pull request in
Part 6 changes `services/app/`, so GitHub requests Priya **by itself**. The
tutorial nevertheless told him to request her by hand and justified it with
"rules added in the same pull request are not a useful demonstration of routing"
— true of the pull request that *adds* them, false of this one.

**Fixed**, and the fix makes the tutorial demonstrate more, not less:

- Tutorial Part 5 step 3's justification now scopes itself correctly ("Rules only
  route on pull requests opened *after* they land, so this one, which adds them,
  still needs asking by hand") and forward-references Part 6.
- Tutorial Part 6 step 1 now says the rules request Priya for him, and — this is
  the substantive correction — **separates the two mechanisms the old text
  conflated**: `touches:` is what let `app`'s sessions reach into `greeter`'s
  code; CODEOWNERS is what put the result in front of `greeter`'s owner. The old
  wording attributed the review request to `touches:`, which is simply not what
  requests reviewers.
- Scene 6 beat 2 becomes "the review request is already there" — a *look, don't
  click* beat — and carries a genuinely valuable failure path: if nobody is
  requested, the handles are wrong, and GitHub declines to route silently.
- Checklist Walk 9 makes the auto-request an explicit PASS/FAIL observation and
  grades a silent no-route as a Major against Walk 7.

### D — the scripted commit fails when there is nothing to commit

Scene 4 beat 8 ran `git add -A && git commit` unconditionally, two beats after
saying the plan session finishes "with a summary and a commit". On the normal
path the tree is clean and the command exits non-zero with *nothing to commit*
— an unscripted error in the flagship scene.

**Fixed** by making the check the action: `git status --short` first, and commit
"if — and only if — that printed anything". The tutorial's prose was already
conditional; it now says the usual case out loud ("`git status --short` is
usually empty here").

### E — Walk 9 asked for an observation the CI log cannot produce

Walk 9 required the log to "show pytest running against BOTH `services/app/` and
`services/greeter/`". It cannot: `pytest -q` does not print its target, and
GitHub's `run:` shell does not echo expanded loop commands. The central claim of
the whole CI design was **unverifiable**.

**Fixed by making it observable rather than by weakening the check** — one line,
`echo "== $module"`, added to the loop in the tutorial and in scene 4's copy of
it. This is an addition, and the removal-first rule was considered: the removal
option was to soften Walk 9's expectation to "the job passed", which would have
deleted the only evidence a viewer ever gets that the aggregate job is doing what
the tutorial spends a paragraph justifying. One echo line buys the teaching
point *and* the verdict. Scene 4's narration and scene 6 beat 3's **See** clause
now name the two `== services/<module>/` lines.

### F — Walk 11 inspects policy pages on a repository nothing creates

Its preamble established only "signed in to a scratch Azure DevOps
organisation", then demanded **Project Settings > Repositories > a repo >
Policies**. On an organisation with no project, none of the four checks exist.

**Fixed** in the preamble: the walk now requires a scratch project with an
initialised repository, and points at scene-2-alt beats 1–2 as the two-minute
way to create it.

### G — GitHub's classic branch protection has no "0 approvals" to select

"Set required approvals to **0**" describes the *state* correctly and the
*control* wrongly: the classic UI expresses zero approvals by leaving **Require
approvals** unticked. The later "raise 0 → 1" then names a transition that does
not exist either.

**Fixed** in the tutorial (Part 3 step 5, Part 5 step 4), scene 3 beat 11, scene
5 beat 7, and checklist Walks 3 and 7 — all now name the checkbox. Walk 3's
Expectation additionally asks the operator to **record whether the wording
matched the control they saw**, because this correction was made from reasoning
about GitHub's UI rather than from looking at it, and S4 is where that gets
settled.

### H — a personal repository has no collaborator role picker

Scene 2 establishes a personal-account repository; scene 5 then said to add Sam
"with the **Write** role". Repository roles are an organisation feature —
on a personal repo, accepting the invitation is what grants push access.

**Fixed** in tutorial Part 5 step 1, scene 5 beat 2 (whose **See** now says
explicitly that there is no role dropdown, so nobody hunts for one on camera),
and checklist Walk 7, which records it if a picker *does* appear (that would mean
the walk ran on an org repo).

### I — the macOS key probe is bash-only

`${!n}` is bash indirect expansion; macOS defaults to `zsh`, which rejects it as
a bad substitution. The snippet was labelled "On macOS or Linux".

**Fixed** with `printenv "$n"`, which works in both shells and still never
prints the value — the property that beat exists to preserve.

### J — neither scene 1 take installs the Azure CLI

Both install `gh`. The ADO take's beat 5 then ran `az login` on a machine with no
`az`.

**Fixed** in scene-2-alt beat 5: `winget install Microsoft.AzureCLI` and
`az --version` before the login, with brew/Linux equivalents, a stale-`PATH`
failure note, and a sentence saying out loud that this install belongs here
because neither scene 1 does it.

### K — "install whichever agent you use" is not a literal action

The beat named three products and gave no install command, no sign-in path, and
no expected on-screen result — every direct-API recorder would have had to invent
it, and later scenes depend on the panel it was supposed to open.

**Fixed** by choosing **one canonical agent** (Claude Code) with a literal
three-step install-and-open action and a literal **See**, plus one sentence
telling a recorder using Codex or Gemini Code Assist exactly what to substitute
and to say so on camera.

### L — the checklist's preconditions made Walk 1 unstartable

`Notes` required the extension installed and the Copilot CLI authenticated
*before the walk starts*; Walk 1 requires both absent so it can install and
authenticate them. Under the checklist's own **STOP AND RESCHEDULE** rule, the
operator could never legitimately begin.

**Fixed**: the precondition is now the *seat* (which must exist) and a local
`.vsix` (which must be present), with an explicit instruction **not** to
pre-authenticate the CLI or pre-install the extension, and the reason.

### M — scene 1 never actually checked the VS Code version

Beat 3 told the recorder to "say the VS Code version out loud from Help > About
rather than opening the dialog" — no action produced it and no **See** asserted
it, so one of the four required tool checks was neither performable nor
attestable.

**Fixed** with `code --version` in the integrated terminal in both scene 1 takes,
a **See** naming the first line and the 1.85.0 floor, a recovery note for a
missing `code` shell command, and a matching expectation in checklist Walk 1.

### N — the ADO take required recording a private repository the README forbade

`video/README.md` said, unconditionally, that private repositories must never be
on screen. The ADO take creates a **Private** project, because that is what Azure
DevOps gives you. The two documents were mutually exclusive, and the take could
not be attested as followable.

**Fixed by narrowing the rule rather than adding an exception clause** — the rule
was always *about* not leaking your other work, and had been over-stated. It now
reads "**Any repository or project but the throwaway one you created for this
recording**", with the ADO take carrying one note explaining that its private
scratch project is that repository and that the organisation's *other* projects
are what must stay off screen.

### O — the direct-API route still sent Sam to the Copilot CLI

Scene 5 beat 3 says Sam does "all of part one, **including signing in to the
Copilot CLI**". A recorder on the direct-API take chose that take precisely
because they have no Copilot seat — and the take's downstream-change table
claimed to be exhaustive while omitting this beat.

**Fixed on both sides**: the table gains a fourth row naming scene 5 beat 3 and
the literal substitute setup (three `DABBLER_*` keys off camera, Claude Code
installed and signed in, `Dabbler: Install ai-router` unchanged); scene 5 beat 3
gains the matching callout; the tutorial's Part 5 step 1 now says Sam does Part 1
"exactly as you did it — including the Copilot CLI sign-in, **or the provider API
keys if that is the variant you chose**"; and checklist Walk 12 now asks about a
four-row table.

## Where the fixes landed

| File | Defects |
| --- | --- |
| `docs/tutorials/hello-world.md` | B, C, D, E, G, H, O |
| `docs/tutorials/video/README.md` | N |
| `docs/tutorials/video/scene-1-install-and-verify.md` | A, M |
| `docs/tutorials/video/scene-1-alt-direct-api.md` | A, I, K, M, O |
| `docs/tutorials/video/scene-2-alt-azure-devops.md` | J, N |
| `docs/tutorials/video/scene-3-dabbler-setup.md` | G |
| `docs/tutorials/video/scene-4-first-module.md` | D, E |
| `docs/tutorials/video/scene-5-second-module.md` | B, C, G, H, O |
| `docs/tutorials/video/scene-6-pr-and-merge.md` | C, E |
| `…-uat-checklist.json` | A, B, C, E, F, G, H, L, M, O |
| `s3-check-literals.py` | pins the new shared literals (below) |

**Seven of the fifteen touched `docs/tutorials/hello-world.md`.** The spec lets
S3 touch the tutorial "only if scripting exposes a gap"; every one of these is
that case, found by scripting or by the verification of the scripts, and each
makes the tutorial *more* correct rather than merely different. They are listed
individually above so a reader of this set can audit that judgment rather than
take it on trust.

## Gates re-run after remediation

The literal-fidelity gate was **extended** so the four most drift-prone fixes
cannot silently re-open: `Require approvals` (scene 3 and scene 5),
`echo "== $module"` (scene 4, on top of the existing byte-identical YAML check),
and `Automatically included reviewers` (the ADO take).

```text
$ .venv/Scripts/python.exe docs/session-sets/106-hello-world-tutorial-simplification/s3-check-literals.py
[A] 10/10 PASS
[B] 57/57 PASS
[C] 37/37 PASS

TOTAL: 104/104 PASS

$ .venv/Scripts/python.exe docs/session-sets/106-hello-world-tutorial-simplification/s3-check-checklist.py
[D] 255/255 PASS
[E] 26/26 PASS
[F] 64/64 PASS

TOTAL: 345/345 PASS
```

Suite unchanged and re-confirmed: pytest **3060 passed / 6 skipped**; extension
unit **1767 passing**, `tsc --noEmit` clean. Layer 3 remains correctly unarmed —
this remediation touched only markdown and one JSON artifact.

---

# Round-3 addendum — the fix-delta review's two findings

Round 3 (`remediation-review`) accepted 13 of the 16 fix verdicts, accepted one
with modification, and **rejected two**. Both rejections are about the Azure
DevOps take, both are correct, and one of them is a fair hit on how fix **N** was
made.

## R3-1 — Walk 11 could not establish that the ADO take is followable

Walk 11 was a **spot check**: it inspected four settings pages and never
performed the take's clone, Azure CLI install, authentication, or rejoin. Walk 13
then attested that "every scene script is followable as written". The verifier's
point is unanswerable — the newly added Azure CLI install (fix **J**) is the
*least*-exercised instruction in the whole set, and the walk that was supposed to
cover it skipped exactly that beat.

**Fixed by making Walk 11 a real execution**, not by softening Walk 13 alone:

- Walk 11 now performs **scene-2-alt beats 1–6 as written** — create the project,
  initialise the README, copy the clone URL, `Git: Clone` into VS Code, install
  and authenticate the Azure CLI, and only then inspect the four guardrail
  controls. Its Expectation calls out step 5 as the one that most needs walking,
  and says why.
- It stays flagged **INTENTIONALLY OUT OF TUTORIAL ORDER**, with the reason
  restated: it *replaces* scene 2, so walking it in tutorial order would mean
  walking Part 2 twice. Executing it in full does **not** turn the tutorial into
  an ADO walkthrough (an explicit spec non-goal) — the walk stops at the take's
  rejoin point and never runs a Dabbler session on Azure DevOps.
- Walk 13 gains a fifth action and a fifth report item: **state the attestation's
  scope**. Eight of the nine scripts are now executed beat by beat; only
  `scene-1-alt-direct-api` is attested as **REVIEWED, not walked**, for the
  destructive-and-duplicative reason Walk 12 records. Its item label now says
  "every scene script **that was EXECUTED**". An attestation that quietly covers
  a script nobody ran is worth less than one that names its own gap.

## R3-2 — fix N weakened the privacy rule instead of satisfying it

This one lands. Fix **N** resolved the contradiction between "private
repositories must never be on screen" and an ADO take that creates a **Private**
project by **narrowing the rule** — carving out the scratch repository. The
verifier is right that this is the wrong direction: the spec requires the OBS
notes to cover *"what must never be: real tokens, org names, private repos"*, and
a script does not get to amend that by rewriting the README it was told to
write.

**Fixed by satisfying the rule instead.** Azure DevOps supports public projects;
the organisation policy just has to allow them, and this take already demands a
brand-new organisation the recorder owns.

- `video/README.md` restores an **unconditional** prohibition — *"Private
  repositories — including the throwaway one"* — and states that both takes
  create the scratch repository public: on GitHub because branch protection needs
  it on the free plan, and on Azure DevOps because of this rule.
- The ADO take's warning block gains **Organization Settings > Policies > Allow
  public projects** as a pre-beat step, and beat 1 now creates the project
  **Public**, with a **See** clause pinning the Public badge and an
  If-this-fails note that says in as many words: *do not fall back to Private and
  keep recording.*
- Beat 1's narration keeps the honest distinction the old version was reaching
  for: public here is a **recording** constraint, not a product one — Azure
  DevOps branch policies work fine on a private project, unlike GitHub Free.
- Both escape hatches are hard stops that route to the human: no fresh
  organisation, or a tenant that will not allow public projects, means **do not
  record this take**. Relaxing the privacy rule is the operator's call, not a
  script's.
- Walk 11's preamble now requires the policy to be on before it begins, and tells
  the operator to record that the walk could not run rather than walking it
  private.

## Gates after the round-3 addendum

```text
$ .venv/Scripts/python.exe docs/session-sets/106-hello-world-tutorial-simplification/s3-check-literals.py
[A] 10/10 PASS
[B] 57/57 PASS
[C] 38/38 PASS

TOTAL: 105/105 PASS

$ .venv/Scripts/python.exe docs/session-sets/106-hello-world-tutorial-simplification/s3-check-checklist.py
[D] 255/255 PASS
[E] 26/26 PASS
[F] 64/64 PASS

TOTAL: 345/345 PASS
```

Walk 11 remains one of the two `INTENTIONALLY`-flagged out-of-order walks, so the
checklist gate's "exactly two, flagged in both `Subarea` and `HumanAction`" check
still holds — it is now an out-of-order **execution** rather than an out-of-order
spot check.

---

# Round-4 addendum — the bound is reached; one finding, fixed, awaiting operator adjudication

Round 4 (`remediation-review`, **cycle 2 of the bounded 2**) accepted **15 of 16**
fix verdicts and rejected one. **The loop is now suspended by rule** — the
constitution's bound is at most two remediation-review cycles, and a third is not
the orchestrator's to open. The finding is recorded here with its fix so the
operator adjudicates a fix, not a gap.

## R4-1 — the Marketplace fix swapped one unavailable dependency for another

Fix **A** told a recorder whose Marketplace shows 0.45.0 to "install the local
build" via **Install from VSIX…**. The verifier's objection: for the Session 4
operator that VSIX is a stated precondition, but **for a future recorder it is
nothing** — no location, no download, no build command. The scene therefore
still could not be performed from its own declared starting state, which is the
exact defect fix A was meant to close.

**Accepted, and fixed by removal rather than by adding an acquisition
procedure.** The deeper problem with fix A was that it put a *sideload* branch in
a script whose output is a **public video**: a viewer following a recording of
that branch cannot reproduce it. So the branch is gone. Both scene-1 takes now
carry a **recording precondition** instead:

> **Do not record this scene until the Marketplace is at 0.46.0 or newer** — the
> whole point of the video is a path a viewer can follow, and a local build is
> not one. Check the version before you press record, not during the take.

That leaves exactly one consumer of the VSIX — the S4 walk, which *must* run on
0.46.0 because its job is to test those templates **before** the operator
publishes them. Checklist Walk 1 step 1 now states this as an explicit,
deliberate **departure** from scene 1 beat 2, with the reason (a walk is not a
recording), and the precondition block says the same. It is the only departure in
the walk, and it is now named identically in both places.

Gates after this fix: literals **105/105 PASS**, checklist **345/345 PASS**,
extension unit **1767 passing**.

## Why this session stops here rather than opening cycle 3

The constitution's rule is that past the bound the loop **suspends**: an unfixed
Critical/Major, or one the orchestrator disputes, goes to the human — never to
another round on the orchestrator's own authority. This finding is neither
unfixed nor disputed; it is fixed above, and the fix has **not been reviewed by a
verifier**, because reviewing it is what a third cycle would be.

What the operator is being asked to decide is therefore narrow:

1. **Accept the close** on the fix as written — the change is a five-line
   documentation edit that *removes* a branch, both mechanical gates are green,
   and the substance (do not film an install path viewers cannot reproduce) is
   hard to get wrong; **or**
2. **Spend one more cycle** (~$0.19, ~2 minutes) to have the fix delta reviewed;
   **or**
3. **Take a third-provider opinion** on this finding specifically.

For the record, the arc across four rounds is one of convergence, not grinding:
**18 → 2 → 2 → 1** blocking findings, with fix-acceptance rising 13/16 → 15/16,
and every finding in every round accepted rather than disputed. Nothing has
reopened under fresh wording.

---

# Round-5 and the third-provider opinion — operator adjudication, 2026-07-29

The operator was stopped to at the bound and ruled: **"One more cycle, then
third-provider opinion, then close."** Both ran.

## Round 5 — remediation-review cycle 3 (operator-authorized)

`VERIFIED`. **Zero findings.** Fix verdicts: **16 accepted, 0 rejected, 1
accepted-with-modification.** Cost $0.1583. The round-4 fix (the Marketplace
recording precondition) was accepted.

That closed the loop on the same-provider axis: **18 → 2 → 2 → 1 → 0**.

## The third-provider opinion — and it was worth every cent of $0.074

All five rounds were judged by **openai / gpt-5-6**; the orchestrator is
**anthropic**. The opinion went to **google / gemini-3.1-pro-preview** — the one
provider family that had not seen the work — with the whole evidence bundle
(198k chars: the tutorial, all nine scripts, the checklist, both gate artifacts,
and this remediation record) and one question a same-provider re-run cannot
answer: *did this converge because the work became sound, or because the verifier
stopped noticing?*

Its answer: **`ISSUES_FOUND`. `convergence_assessment.genuine: false`.** Raw
output in [`s3-third-provider-opinion.md`](s3-third-provider-opinion.md).

> "The verifier successfully cleaned up logical gaps, UI mismatches, and script
> contradictions, leaving a tutorial that is narratively flawless. However, it
> completely lost sight of the physical constraints of the execution
> environment. … It achieved 0 findings by ignoring the execution layer."

And it named the thing five rounds walked past.

### TP-1 (Critical) — `gh` is global, and it breaks the two-person staging every time

`gh auth login` writes **one credential for the whole OS user** — not per folder,
not per VS Code window. `Dabbler: Open PR for this set` runs `gh pr create`, and
GitHub records a pull request's author as **whoever `gh` is logged in as**, not
whoever authored the commits.

The staging asks one operator to play two people on one machine, separated by a
second *browser profile* and a second *clone*. Neither touches `gh`. So every
pull request "Sam" opens is authored by **Priya**, and two things follow, both
certain rather than probable:

- **Priya cannot approve them.** GitHub refuses self-approval. Scene 5 beat 12
  and scene 6 beat 5 — and checklist Walks 8 and 9 — dead-end at a disabled
  Merge button.
- **Scene 6 beat 2's automatic review request never appears.** CODEOWNERS never
  requests a pull request's own author. The beat this session *added* in round 1,
  as the payoff for the whole CODEOWNERS story, would have shown an empty
  Reviewers box.

Two people on two machines never hit this. One person playing both hits it every
time — and the operator was about to spend two hours doing exactly that.

**Why five rounds missed it, in the opinion's own words:** *"salience exhaustion
on the physical staging layer. The verifier perfectly verified the logical
narrative (Sam opens PR → Priya approves) but completely forgot that both actors
are sharing a single local OS user session where `gh auth login` is global
state."* Every round reasoned about the **documents**; none reasoned about the
**machine**.

**Accepted and fixed.** The fix stays entirely in the staging — scene scripts and
checklist — and **does not touch the tutorial**, because the tutorial is correct:
real Priya and real Sam are on their own machines with their own `gh` logins.
This is a video-and-walk artefact, not a product or doc defect.

- **Scene 5's staging note** gains a block explaining the trap, its two
  consequences, and the fix. It says plainly that a second browser profile is not
  enough.
- **Scene 5 beat 3** (Sam's setup) adds `gh auth login` as Sam, then
  `gh auth status`, so both accounts exist in the CLI from the moment Sam appears.
- **Scene 5 beats 8 and 12, and scene 6 beat 1** each add an explicit
  `gh auth switch --user <handle>` + `gh auth status` before the pull-request
  action — *"check `gh auth status` rather than trusting your memory of the last
  switch."*
- **Scene 5 beat 12 and scene 6 beat 1** add the byline to their **See** clauses:
  if the pull request says Priya, stop, because the next beats cannot work.
- **Checklist**: a new `THE ONE-MACHINE STAGING TRAP` paragraph in `Notes`, the
  second `gh auth login` in Walk 7 step 2, the switch in Walk 7 step 7, Walk 8
  step 5 and Walk 9 step 1, and byline checks in the Walk 8 and Walk 9
  Expectations.
- **The literal gate** now pins `gh auth status` in scenes 5 and 6, so the switch
  discipline cannot be edited away silently. **107/107 PASS.**

### TP-2 (Minor) — the checklist flattened cross-platform commands to Windows

The checklist quotes `winget install GitHub.Copilot` and
`.venv\Scripts\python.exe` as literals; the scene scripts carry the macOS/Linux
forms beside them and the checklist dropped them.

**Accepted, graded Minor and fixed at that weight** — the walk machine is
Windows, so the probability for *this* walk is low, but a defect in the checklist
is a defect. `Notes` gains a `PLATFORM` paragraph naming the three substitutions
and telling the operator to take them from the scripts and record that they did.

### What the third provider did *not* find

`fixes_i_would_challenge` came back **empty** — it challenged none of the 19
fixes made across rounds 1–4, including the two that were themselves corrections
of earlier fixes (the privacy rule, the Marketplace precondition). That is the
useful shape of this result: the *document-layer* work was sound, and the loop
that produced it was converging honestly on that axis. What it could not see,
because it never looked at the machine, was an entire second axis.

### The lesson this earns

A same-provider verification loop converges on the axis it started reasoning
about. Five rounds of increasingly clean results on the **document** layer were
genuine *and* said nothing about the **execution** layer. `VERIFIED` from a loop
is a statement about what that loop looks at — and the cheapest way to find out
what it does not look at is one call to a provider family that has not been in
the room. It cost **$0.074** and it saved a two-hour walk from walling at Walk 8.

## Gates after the third-provider remediation

```text
$ .venv/Scripts/python.exe docs/session-sets/106-hello-world-tutorial-simplification/s3-check-literals.py
[A] 10/10 PASS
[B] 59/59 PASS
[C] 38/38 PASS

TOTAL: 107/107 PASS

$ .venv/Scripts/python.exe docs/session-sets/106-hello-world-tutorial-simplification/s3-check-checklist.py
[D] 255/255 PASS
[E] 26/26 PASS
[F] 64/64 PASS

TOTAL: 345/345 PASS
```

Extension unit re-run: **1767 passing**. The TP-1/TP-2 fixes are **not
verifier-reviewed** — the operator's ruling was one cycle, then the opinion, then
close, and re-reviewing this delta would be cycle 4. They are markdown and JSON
staging notes in this session's own deliverables, and the S4 walk is where they
get exercised for real.

## What is still not established

Unchanged from `s3-authoring-gates.md`, and now with two additions worth naming.
Both are corrections made by **reasoning about somebody else's UI**, not by
looking at it — which is precisely the class of claim a walk exists to settle:

- **Fix G — GitHub's branch-protection approval control.** The correction ("leave
  **Require approvals** unticked" rather than "set required approvals to 0") comes
  from how the classic rule UI is structured, not from a live look. Checklist
  Walk 3 asks the operator to report whether the new wording matched the control
  in front of them.
- **Fix R3-2 — Azure DevOps public projects.** That **Organization Settings >
  Policies > Allow public projects** exists and is toggleable by the owner of a
  fresh organisation is likewise reasoned. If it turns out not to be reachable,
  the take's own hard stop fires and Walk 11 reports that it could not run —
  which is the designed outcome, not a surprise, but it has not been observed.
- **Fix TP-1 — `gh auth switch`.** That the GitHub CLI supports multiple logged-in
  accounts and switches between them with `gh auth switch --user <handle>`
  (GitHub CLI 2.40+), and that `gh auth status` shows which is active, is
  reasoned from the CLI's documented surface, not run. Walk 7 step 2's
  expectation — *"`gh auth status` must list BOTH handles; if it lists one, the
  second login did not take"* — is where that gets settled, and it is deliberately
  placed one walk **before** the walk it protects.

And one thing this session now knows it cannot establish at all: **what a
verification loop is not looking at.** Five rounds on one provider converged
honestly on the document layer and were silent about the execution layer. That
is not a gap a sixth round of the same kind closes.
