# Change log — Set 124: Verify Type Is Machine/Project State

Set 123 shipped `project-verify-type.txt` as **committed project
configuration**. On 2026-08-12 the operator corrected that scoping in two
sentences: first *"there was a design flaw with set 123 — we should have
stated explicitly that the project-verify-type.txt should be excluded from
git"*, then the load-bearing sharpening, *"it isn't machine state per se, it
is machine/project state."*

The second sentence is why this was a set rather than a `.gitignore` line.
Machine × project is **exactly** the scope `ai_router/local-overrides.yaml`
already occupied, so gitignoring the file did not remove a duplicate
mechanism — it created one, in the same slot `router-config.yaml:86` calls
*"a defect class this repo has hit three times."*

---

## Session 1 — The file is machine/project state

- **Gitignored `project-verify-type.txt`**, with both-direction falsifiers
  (`L-112-1`): one plants the file and asserts `git check-ignore` claims it,
  one asserts a deliberately-tracked look-alike is *not* ignored. Planted in
  a throwaway repo seeded from the real `.gitignore`, never the working tree.
  Mutation-proved both directions.
- **Retired the `committed` vocabulary** in `verify_type.py`: the property,
  the `to_dict()` key, three docstrings, the guided-setup message, the
  branch-2 narration and the no-git-root error.
- **Found and fixed en route:** `write_project_verify_type` embedded a header
  reading *"Committed on purpose: it is project configuration, not machine
  state"* — the exact inverse of the ruling, shipped into every file the
  setup command wrote. A case-sensitive grep had missed the capitalised word;
  it is now pinned by a falsifier that asserts the written artifact.
- **Resolved this repo, which had never resolved itself.** The canonical repo
  that shipped verify-type resolution was exiting 3 (setup required); it now
  exits 0 on branch 1 as `COPILOT_CLI`.
- **Found a latent Set 123 defect:** 10 tests passed only while this repo had
  no `project-verify-type.txt`. Their synthetic workspaces carried no `.git`
  marker, so `find_project_root` walked past the tmp tree to the cwd anchor
  and the *real repo* answered. Proved by moving the file away and back.

## Session 2 — One mechanism for the machine/project fact

- **Retired `transport.profile` as a local override.** No `transport.*` key
  is locally overridable any more; a stale one is **refused** at config load
  with a message naming `python -m ai_router.verify_type --set <VALUE>`,
  where `<VALUE>` is *derived* from the stale profile rather than left as a
  placeholder.
- **Refuse-vs-warn decided under `prefer-reversible` and journaled.** The
  deciding case: on a Copilot seat with no project file, warn-and-ignore
  silently falls back to `api` and then fails `validate_provider_api_keys` on
  a seat that has no keys *by design* — a credential error a long way from
  its cause.
- **Replaced, not deleted,** both tests that pinned the retired precedence.
- **Dogfooded on this seat**, which carried the legacy key: the refusal fired
  naming `COPILOT_CLI` correctly, and the seat still resolves afterwards.
- **Commit provenance disclosed rather than rewritten** — a `git add -A`
  staged for verification left the index full, so S2's code landed under a
  mislabelled commit message. Rewriting pushed history needs a force-push,
  which is operator authority, so the mislabel is recorded instead.

## Session 3 — Every echo, and the first run that is now normal

The consistency pass landed as planned: `README.md`, `docs/quick-start.md`
(both inventory rows), the three engine bootstrap files,
`docs/planning/verify-type-resolution.md` (amendment banner per `L-064-8`,
not a rewrite — it is a dated design record), `docs/tutorials/adopt-dabbler.md`,
and the consumer-bootstrap template, which had asserted the *exact inverse*
of the operator's ruling. Consumers who already committed the file are told
to `git rm --cached` it.

Then the session found two defects the spec had not anticipated.

**The extension still wrote the key Session 2 had turned into poison.**
`performCopilotSeatSetup` rendered `transport.profile: copilot-cli` into
`ai_router/local-overrides.yaml` — the key S2 made a hard refusal — so a
**successful** `Dabbler: Set Up Copilot Seat` produced a project whose every
`load_config` raised. Reproduced in a throwaway fixture, brought to the
operator as an education-mode brief, and fixed by retargeting the write to
the one sanctioned entry point: the extension now spawns
`python -m ai_router.verify_type --set COPILOT_CLI --project-root <dir>`
through the same scaffolded venv the catalog refresh uses. One writer, so
every such file carries the header the writer emits. The Direct API path is
untouched by construction — an `"api"` pick was always a no-op there.

**The cold-start walk earned its keep.** `L-079-3` asks for a walk from
genuinely unprovisioned state; this one started from an empty folder and a
bare `git init`. Branch 3 fired correctly and drove to a resolved project —
and then `git status` showed the freshly written answer **untracked and
committable**, while the header inside it said *"Gitignored on purpose."*
The writer was shipping a promise nothing kept, the same class as Session
1's en-route finding. `write_project_verify_type` now calls
`ensure_gitignored()` **before** it writes the file.

That, in turn, made the `.gitignore` guarantee this same session had just
added to the extension a *second* implementation of one fact — so it was
deleted, along with the atomic file writer whose last caller it was. The
set's own thesis, applied to the set's own output.

**Verification round 1 caught the seam left by that removal** (Major,
accepted): the guarantee moved to the writer but its *failure signal* did
not, so an unwritable `.gitignore` would have produced a toast claiming the
file was gitignored when it was not. The extension now relays the writer's
own stderr warning rather than re-deriving anything, matched line-anchored on
`WARNING: ` so Python's own `RuntimeWarning` noise — which appears on every
invocation — is not mistaken for it.

---

## End-of-set deliverables

| deliverable | state |
| :--- | :--- |
| `project-verify-type.txt` gitignored, both-direction falsifiers | done (S1), and now **guaranteed by the writer** for every consumer (S3) |
| One mechanism for the machine/project fact | done (S2); the extension's duplicate writer closed in S3 |
| No "committed" claim left on any live surface | done (S3) |
| A cold-start walk from an unprovisioned checkout | done (S3) — and it found the defect above |
| `change-log.md`, `disposition.json`, Step 9 guidance review | this file; done; done |

**Irony budget:** 18 new test functions declared. Session 1 shipped 7,
Session 2 shipped 4, Session 3 shipped 10 (7 Python + 3 TypeScript relay
falsifiers) — 21 total, three over. The overage is entirely Session 3's two
unplanned defects, both of which were correctness fixes to shipped writers;
flagged here rather than trimmed, because dropping a falsifier to hit a
budget is the wrong trade.

## Suite state at close

| suite | result |
| :--- | :--- |
| pytest (full) | 4006 passed, 9 skipped |
| Playwright Layer 3 (full) | 31 passed |
| mocha Layer 2 | 1462 passing, 2 pending |
