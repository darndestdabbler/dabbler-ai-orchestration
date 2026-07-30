# S2 remediation — rounds 1 (discovery, fan-out 2/2) + 2 (supplementary)

Five findings across three rounds de-duplicate to **three distinct blockers**.
All three accepted; none disputed. The discovery fan-out found the same two
defects independently in both calls (1≡3, 2≡4), which is the fan-out working as
intended rather than four separate problems.

| # | Finding | Severity | Verdict |
| --- | --- | --- | --- |
| B1 | Step 4's commands are Windows-only (discovery 1 ≡ 3) | Major | **Fixed** |
| B2 | The gate does not enforce what it claims (discovery 2 ≡ 4) | Major | **Fixed** |
| B3 | Git is omitted from the prerequisites (supplementary 1) | Major | **Fixed** |

---

## B1 — the completion steps were unrunnable on macOS and Linux

**Accepted without qualification.** Step 2 gave both `.venv\Scripts\python.exe`
and `.venv/bin/python`; step 4 gave only the Windows form, for both the test
re-run and the program. A macOS or Linux reader following literally hits a path
that does not exist **at the moment the tutorial pays off** — the exact place a
first run must not fail.

Worse than a bare omission: step 2 *trained* the reader to expect a
platform-specific pair, so its absence in step 4 reads as "this one is the same
on both", which is false.

**Fix:** step 4 now carries the macOS/Linux form for both commands, in step 2's
shape. Also added the missing "They now pass:" lead-in that step 2 has and
step 4 did not.

## B3 — git was an undeclared prerequisite

**Accepted, and it is the most serious of the three** because it is a **true
cold start** failure (L-079-3): the reader satisfies every stated prerequisite
and still cannot finish.

The command runs `git init`, writes a repository-local identity, and makes a
baseline commit; the agent commits before closing, and `close_session`'s
`working_tree_clean` gate depends on it. The shipped code even has a
`GIT_MISSING_MESSAGE` for precisely this case — so the product knew git was
required and the tutorial did not say so. A clean Windows machine very commonly
has no git.

The surrounding wording made it worse rather than merely incomplete: `README.md`
promised "no git host, no repository, and no git commands", and
`adopt-dabbler.md` called the sample "no host and no git". Those sentences
actively tell a reader that git is not involved.

**Fix, propagated to every echo in one pass (L-065-1):**

- `hello-world.md` — git added as prerequisite 3, phrased so it does not import
  a concept: *"installed but not configured — you will not type a single Git
  command"*, with the download link. Added a plain sentence that no account,
  server or hosted project is needed, which is the true version of the claim the
  other documents were making badly.
- `README.md` — "no existing repository, and no git commands **for you to type**".
- `docs/quick-start.md` — same correction.
- `docs/tutorials/adopt-dabbler.md` — "no host and no git **commands to type**".
- `docs/templates/consumer-bootstrap/getting-started.md.template` — "no host and
  no git **commands from you**"; `dist/` and both cold-start goldens regenerated.

## B2 — the gate did not enforce the contract it advertised

**Accepted in full.** This is the finding worth the round. `s2-conventions.md`
told the verifier that check 6 "machine-enforces" the first-run constraint, and
the verifier did what a good verifier does: it went and read the implementation
instead of believing the claim. Every specific it raised was true.

| What was claimed | What the code did | Now |
| --- | --- | --- |
| "no git command" | An **allowlist** of 21 subcommands. `git diff`, `git log`, `git show`, `git reset`, `git clean`, `git rm`, `git cherry-pick`, `git worktree` all passed. | Matches `git <any-subcommand>`, with a negative lookahead for the prose forms (`git commands`, `git history`, `git identity`). A hand-maintained list of things to forbid always falls behind — the same reason the sample bundle derives its file list instead of hardcoding one. |
| "no YAML" | Only fences **labelled** ```` ```yaml ````. **Every fence in this tutorial is unlabelled**, so a contributor pasting config in the document's own established style sailed through. | Untagged fences whose bodies read as YAML are detected by content. |
| branch/host/governance vocabulary | Only `branch protection` / `branch polic…`; an ordinary "start a branch" passed. Patterns were **case-sensitive**, so a sentence-initial `Commit your work first.` passed. | `branch`, `commit`, `merge`, `repository` added; all terms case-insensitive except the three acronyms (`CI`, `CODEOWNERS`, `DABBLER_*_KEY`) whose lowercase forms are ordinary English. |
| "binds the before **and** after tallies" | Accepted a single `Ran 2 tests`. A tutorial that quietly dropped the failing state would have passed — losing the red-to-green transition the sample exists to demonstrate. | Both `FAILED (errors=1)` and `OK` are now required. |
| the starter line is "pinned against bundle.json" (claimed in `s2-duplicate-procedure-adjudication.md`) | Only the slug was checked. Deleting or rewording `Start the next session of` passed. | The full line is pinned, built from `bundle.json`'s slug. |
| the required closing Full-tier sentence | Not checked at all. | Required **exactly once** — its absence and its duplication are both violations. |
| product UI literals | The gate never read `sampleProject.ts`, so the dialog title, button labels, notification and clipboard confirmation were unbound. | Six strings bound **in both directions**: the tutorial dropping one fails, and the *source* renaming one fails too. |
| missing inputs | Fail-**open**: absent `package.json` / bundle / tutorial produced no violations, and a test codified it. | A `required-surfaces` check fails closed on any tree that has `docs/tutorials/`. The per-check tolerance is kept, so the checks still run on synthetic trees. |

### The gate then caught two more defects in this very session's work

Once strengthened, it immediately failed on the real repository — which is the
first evidence that it is a gate rather than a decoration:

1. `Creating your sample project...` is not in `utils/sampleProject.ts`; it is
   the `withProgress` title in `commands/trySampleProject.ts`. The check now
   reads both modules. **The tutorial's quote was correct; my assumption about
   where the string lived was not.**
2. The Full-tier sentence check found **0**, because the sentence is reflowed
   across two lines and the check ran on raw text. Now matched on the
   whitespace-normalised copy, with a regression test naming the line wrap.

### Falsification

The tests went from 34 to **62**, and the new ones exist because Round 1 proved
the old set insufficient. Every enforcement claimed above now has a test that
introduces the defect and asserts the gate fires, plus negative tests that
legitimate prose (`.gitignore`, `git-scm.com`, naming Copilot/Claude Code, the
sanctioned Full-tier sentence) does **not** fire.

**The general lesson, and it is the one I got wrong twice:** the first version of
this gate passed on its first run and I nearly trusted it. Falsifying it caught
one real weakness before Round 1 (a `missingFunction: "shout"` presence check
satisfied by the slug `001-add-a-shout` — the same coincidence-satisfies-check
class S1's third-provider opinion found). Round 1 then caught eight more that my
falsification set had not thought to try. A gate is only as good as the defects
someone actually attempted against it.

---

## Suites after remediation

Re-run and recorded in the disposition. `tutorial_gate.py` exits 0;
`drift_guard.py` exits 0.

---

## Post-verdict: round 3's two nits (added AFTER the VERIFIED verdict)

Round 3 returned **VERIFIED**, 0 findings, fix verdicts 2 accepted + 1
accepted-with-modification, and carried two Minors. The loop was over — a
Minor-only result is non-blocking — but both were cheap, so they were fixed
rather than carried. **Neither fix was re-verified by a routed round**; the
close backstop sees them in the committed diff.

**Nit 1 — a literal contradiction in the tutorial. Accepted, fixed.** The
prerequisites demand an AI agent the reader is "already signed in to" and then
said "You do not need an account anywhere." Now: *"Beyond that agent, you do not
need any additional account, a server, or anything hosted online."*

**Nit 2 — the untagged-YAML detector was still narrow. Half accepted, half
declined, and the declined half is the interesting one.**

Round 3 named two missed shapes. Taking both at face value made the gate fail on
**the very document it protects**:

- **Taken:** a mapping key followed by an indented scalar list (`providers:` /
  `  - codex`). The detector required *every* line to be a `key:`, so list items
  disqualified the block. Fixed, with a test.
- **Declined:** a lone `tier: lightweight`. Widening to single-line blocks
  immediately flagged `hello-world.md` lines 31 and 103 — which are
  ```` ```\nDabbler: Try a sample project\n``` ```` and
  ```` ```\nclose_session: succeeded\n``` ````. A one-line `word: value` fence is
  **not distinguishable from configuration by shape**, and this tutorial
  legitimately contains two. Two real lines stays the threshold.

Both rejected shapes now have *negative* tests, so a future contributor cannot
re-widen the detector without seeing exactly which real strings it breaks. The
residual — a single-line YAML block in an untagged fence goes undetected — is
recorded in the disposition rather than traded for false positives on the
document the gate exists to protect.

Worth naming plainly: this is the second time in this session that acting on a
correct-sounding review point without testing it against the real artifact would
have made things worse. The first was assuming `Creating your sample project...`
lived in `sampleProject.ts`.

## Not changed, and why

- **`s2-conventions.md` was updated in one place only** — the falsification
  count (11 → 62) — so later rounds are not handed a stale number. It is a round
  *input*, not a saved verifier artifact; no `sN-verification*.md` or
  `sN-issues*.json` was touched.
- **`adopt-dabbler.md`'s body remains unrewritten.** The spec relocates it
  "unchanged in substance"; only its framing header and the corrected "no git"
  clause changed.
