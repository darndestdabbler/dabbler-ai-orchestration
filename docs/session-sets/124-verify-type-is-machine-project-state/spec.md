# Verify Type Is Machine/Project State Spec

> **Purpose:** Set 123 shipped `project-verify-type.txt` as *committed
> project configuration*. That scoping is wrong, and the operator corrected
> it on 2026-08-12: the verify type is **machine/project state** — the
> answer to "what verifies *this project*, *on this machine*". This set
> re-scopes the file, retires the second mechanism that now occupies the
> same slot, and propagates the corrected claim to every surface that
> echoes it.
> **Created:** 2026-08-12
> **Session Set:** `docs/session-sets/124-verify-type-is-machine-project-state/`
> **Prerequisite:** `123-verify-type-and-startup-simplification`
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

**Operator ruling, 2026-08-12, verbatim in two parts.** First: *"It seems
that there was a design flaw with set 123. We should have stated explicitly
that the project-verify-type.txt should be excluded from git."* Then, when
the orchestrator characterised the file as machine state: *"It isn't machine
state per se, it is machine/project state."*

The second half is the load-bearing one, and it is why this is a set rather
than a `.gitignore` line.

## Session Set Configuration

```yaml
requiresUAT: false        # The deliverables are a re-scoped file judged by a git-ignore falsifier, a retired config key judged by a refusal falsifier, and doc edits. Session 3's cold-start walk is a dogfood the orchestrator runs, not an operator UAT — no new rendering surface exists to look at.
requiresE2E: false        # Set-wide default. Session 3 edits extension SOURCE (operator-facing strings in copilotSeatSetup.ts) and the two suite tests that pin them, so L-064-12 applies and that session runs the full Playwright suite at its close — declared in the session, not here.
uatStyle: ad-hoc
prerequisites:
  - slug: 123-verify-type-and-startup-simplification
    condition: complete
```

---

## Why this is a correctness defect, not a preference

Set 123's own rationale, quoted from `ai_router/router-config.yaml:86-87`:

> *"Two mechanisms for one fact is a defect class this repo has hit three
> times; the file is the one."*

The set was right about the disease and wrong about the cure's scope. Under
the corrected scoping there are **three** distinct scopes, and the current
code collapses two of them:

| scope | mechanism | committed? |
| :--- | :--- | :--- |
| **machine-wide** default across every project on the box | `AI_ORCHESTRATION_VERIFY_TYPE` | n/a (environment) |
| **machine × project** — this repo, on this machine | `project-verify-type.txt` **and** `ai_router/local-overrides.yaml` `transport.profile` | must be **neither** |
| **project-wide** default shipped to every consumer | `ai_router/router-config.yaml` `transport.profile: api` | yes — package data |

The middle row is the defect: after Set 123 there are still **two**
mechanisms for one fact, and the one Set 123 declared authoritative is the
one it also declared committed — so a Copilot seat and an API-key seat
cannot both be right about the same checked-out repo.

**The concrete symptom, observed at this set's authoring.** This repo's own
`project-verify-type.txt` does not exist; `python -m ai_router.verify_type`
exits 3 (setup required) on the canonical repo that shipped it. The machine
holds no `DABBLER_*` keys and a live Copilot seat
(`copilot_preflight` authenticates a probe as `claude-sonnet-4.6`), so the
only honest answer here is `COPILOT_CLI` — an answer that must **not** be
committed, because a consumer installing the wheel with provider keys needs
`DIRECT_API` for the same repo.

## Decisions already made — do not reopen

1. **`project-verify-type.txt` is machine/project state and is
   gitignored.** Operator, 2026-08-12. It is not machine-wide (two projects
   on one box may legitimately differ) and not project-wide (one project on
   two boxes may legitimately differ).
2. **`AI_ORCHESTRATION_VERIFY_TYPE` keeps its Set 123 role unchanged** — the
   machine-wide default that feeds branch 2's confirm-once, never part of
   the transport derivation. Set 123 settled that an unconfirmed default
   must not silently re-route dispatch; nothing here disturbs it.
3. **`router-config.yaml` stays committed package data on `api`.** It is the
   project-wide default a fresh install falls back to, and Set 110 S4's
   lesson (a seat-local `copilot-cli` committed into it would break every
   API-key consumer of the wheel) is untouched.
4. **The three-branch resolution order survives.** File → environment
   (confirmed once) → guided setup. This set changes the file's *scope* and
   its *vocabulary*, not the order.
5. **The repo-boundary walk survives.** Finding the project root by walking
   up to the first ancestor holding `.git` is still how a project is
   identified; a gitignored file at that root is still exactly one answer
   per project.

## What changes that Set 123 will not have anticipated

**A fresh clone now has no answer.** Under Set 123, cloning a configured
repo inherited its verify type. Under the correction, **branch 3 (guided
setup) becomes the normal first run on every machine**, not the rare
unconfigured case. That promotes guided setup from a fallback to a
load-bearing path, which is why Session 3 owes it a true cold-start walk
(`L-079-3`: a walk that starts from a partially-provisioned fixture
validates the steady state, not the first run).

**The word "committed" is not cosmetic — it is a semantic in the code.**
`verify_type.py` exposes a `committed` property; `transport_profile` returns
`None` until it is true; `to_dict()` publishes it; `needs_setup` is defined
as it. Renaming the concept is a real edit, not a find-and-replace, and the
CLI's own setup message currently ends *"Setup is finished when BOTH
$AI_ORCHESTRATION_VERIFY_TYPE is set and project-verify-type.txt is
committed carrying the same value."*

## Measured blast radius (2026-08-12, re-derive before trusting)

`project-verify-type` appears in **52 paths**; excluding Set 123's
read-only verification artifacts, the live surfaces are:

| surface | "commit" refs | note |
| :--- | ---: | :--- |
| `ai_router/verify_type.py` | 21 | the `committed` property, `to_dict`, the setup message, the branch-2 narration, the no-git-root error |
| `ai_router/tests/test_verify_type_resolution.py` | 10 | 457 lines; includes `test_project_file_beats_a_seat_local_override` and `test_cli_walks_a_project_from_setup_required_to_committed` |
| `docs/tutorials/adopt-dabbler.md` | 11 | tells the reader to `commit project-verify-type.txt` |
| `docs/quick-start.md` | 8 | the file-inventory table row says "Committed" |
| `README.md` | 5 | "answer the one setup question ... and commit it" |
| `ai_router/config.py` | 3 | precedence comments |
| `docs/planning/verify-type-resolution.md` | 3 | open question 1's settled answer |
| `docs/templates/consumer-bootstrap/getting-started.md.template` | 3 | "**committed** — it is project configuration, not machine state" |
| `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` | 2 each | "single source of truth, committed" |
| `ai_router/router-config.yaml` | — | the derivation comment block |
| `tools/.../src/utils/copilotSeatSetup.ts` | 21 refs to the file | operator-facing strings say "committed" |
| `tools/.../src/utils/providerKey.ts`, `src/extension.ts` | — | comments |
| `tools/.../src/test/suite/{copilotSeatSetup,gitScaffoldSeatSetup}.test.ts` | — | pin the strings above |

## Non-goals

- **Not re-opening the three-branch order, the qualified verdict, or the
  same-provider ruling.** Set 123 Sessions 1–2 stand.
- **Not restoring any webview.** Set 123 S3's deletion stands; setup remains
  a terminal step.
- **Not migrating consumer repos.** If a consumer has already committed the
  file, the tutorial and template must tell them to `git rm --cached` it;
  this set does not reach into other repos.
- **Not touching the Copilot seat's fail-closed `ProvenanceUnavailable`
  contract** (Sets 083/084).

---

## Sessions

### Session 1 of 3: The file is machine/project state

**Steps:**

1. Register.
2. **Gitignore `project-verify-type.txt`**, with a comment naming the scope
   (machine × project) and the reason, in the same voice as the
   `local-overrides.yaml` and `copilot-catalog.lock` entries above it. Ship
   the falsifier **both ways** (`L-112-1`): one that plants the file at the
   repo root and asserts `git check-ignore` claims it, one that asserts a
   deliberately-tracked look-alike is **not** ignored — a rule that ignores
   everything is indistinguishable from one that ignores the right thing.
3. **Retire the `committed` vocabulary in `ai_router/verify_type.py`.**
   Rename the property to one that means "the project file answered",
   correct `to_dict()`, the branch-2 narration, the no-git-root error
   (*"nowhere to commit"*), and the setup message's final line so the bar
   reads *the file exists carrying the same value*. Do not change the
   resolution order or the repo-boundary walk.
4. **Resolve this repo, and prove it.** Run `verify_type --set COPILOT_CLI`,
   set `AI_ORCHESTRATION_VERIFY_TYPE` in the machine's user environment, and
   show `python -m ai_router.verify_type` exiting 0 on branch 1 with
   `copilot_preflight` still green. The canonical repo failing its own
   setup check is the symptom that opened this set; it closes here.
5. Targeted pytest; verify; close.

**Creates:** the `.gitignore` entry, its two falsifiers
**Touches:** `.gitignore`, `ai_router/verify_type.py`, `ai_router/tests/test_verify_type_resolution.py`
**Ends with:** `project-verify-type.txt` is gitignored, proven by a planted violation; no shipped surface in `verify_type.py` calls the answer "committed"; and `python -m ai_router.verify_type` exits 0 in this repo.
**Progress keys:** `fileIgnored`, `ignoreFalsified`, `vocabularyCorrected`, `thisRepoResolved`

---

### Session 2 of 3: One mechanism for the machine/project fact

The middle row of the scope table has two mechanisms. This session leaves
it with one.

**Steps:**

1. Register.
2. **Retire `transport.profile` from `ai_router/local-overrides.yaml`.** Once
   the project file is gitignored, both files are machine × project scope
   and the seat-local override is pure duplication — the defect class
   `router-config.yaml:86` names. `config.py` must stop honouring it and
   name `python -m ai_router.verify_type --set <VALUE>` as the one way to
   say it.
3. **Choose refuse-vs-warn by the tiebreaks and journal it**
   (`decision_journal`). A hard refusal is louder but strands any seat
   mid-session on an expensive path; a warn-and-ignore is reversible and
   self-describing. Whichever is chosen, the message must name the exact
   replacement command — an existing seat (this machine included) carries
   the legacy key today and must not be left guessing.
4. **Replace, do not delete, the coverage that pinned the old precedence.**
   `test_project_file_beats_a_seat_local_override` asserts a precedence that
   stops being meaningful when the loser is retired; it becomes the
   legacy-key falsifier. Add the sibling that plants the legacy key and
   asserts the operator-facing message names the replacement.
5. Targeted pytest; verify; close.

**Creates:** the legacy-key refusal path and its falsifiers
**Touches:** `ai_router/config.py`, `ai_router/local-overrides.yaml` (this seat's own), `ai_router/router-config.yaml` (the comment block), `ai_router/tests/`
**Ends with:** exactly one mechanism answers "what verifies this project on this machine", and a seat still carrying the retired key is told precisely what to run instead.
**Progress keys:** `overrideRetired`, `migrationMessaged`, `precedenceTestReplaced`

---

### Session 3 of 3: Every echo, and the first run that is now normal

**Steps:**

1. Register.
2. **Fix every documentation echo in one pass.** Grep the *old* phrasing —
   "committed", "commit it", "project configuration, not machine state" —
   across `README.md`, `docs/quick-start.md` (the inventory table row),
   `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`, `docs/planning/verify-type-resolution.md`
   (its preamble and open question 1), `docs/tutorials/adopt-dabbler.md`
   (which instructs `commit project-verify-type.txt`), and
   `docs/templates/consumer-bootstrap/getting-started.md.template` (which
   asserts the exact inverse of the operator's ruling). A consistency fix is
   global, not point-local. Tell an already-committed consumer to
   `git rm --cached`.
3. **Fix the extension-side echoes and the tests that pin them** —
   `copilotSeatSetup.ts`'s operator-facing strings, the comments in
   `providerKey.ts` and `extension.ts`, and the assertions in
   `copilotSeatSetup.test.ts` / `gitScaffoldSeatSetup.test.ts`.
4. **Walk the cold start, because it is now the normal first run.** From a
   fresh checkout carrying no `project-verify-type.txt`, drive branch 3 to a
   finished setup and assert the resolved answer; `L-079-3` requires the
   walk begin from genuinely unprovisioned state, not a seeded fixture.
5. Extension source changed, so **`L-064-12` applies**: run the full
   `npm run test:playwright` after the last edit, then full pytest, verify,
   close, and run the Step 9 guidance review.

**Creates:** the cold-start walk record
**Touches:** `README.md`, `docs/quick-start.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/planning/verify-type-resolution.md`, `docs/tutorials/adopt-dabbler.md`, `docs/templates/consumer-bootstrap/getting-started.md.template`, `tools/dabbler-ai-orchestration/src/`
**Ends with:** no surface in the repo tells a reader to commit the file, and guided setup is proven from a genuinely cold checkout.
**Progress keys:** `docsEchoesFixed`, `extensionEchoesFixed`, `coldStartWalked`

> **Irony budget: 18 new test functions across all three sessions.** Well
> below Set 122's 30 because most of this set is retirement and
> re-wording against coverage that already exists — Session 1's two
> ignore falsifiers and Session 2's legacy-key pair are where the real
> risk sits. If the design cannot be covered in 18, simplify the design.

---

## End-of-set deliverables

- `project-verify-type.txt` gitignored, with both-direction falsifiers.
- One mechanism for the machine/project fact; the retired one migrates loudly.
- No "committed" claim left anywhere — code, config comments, docs,
  bootstrap files, consumer template, tutorial, or extension strings.
- A cold-start walk proving branch 3 from an unprovisioned checkout.
- `change-log.md`, `disposition.json`, and the Step 9 guidance review.
