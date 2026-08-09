# Set 112 — Remove the Lightweight Tier

## What this set was for

The framework had **two tiers**. Full ran the routed, cross-provider
verification loop. Lightweight — added in Set 048 for adopters with no
provider access — ran no routed calls at all, and substituted one of two
hand-driven verification modes in its place: Mode A wrote a verdict into
an `external-verification.md` file a parser read, and Mode B ran typed
verification/remediation sessions with their own bounded loop and close
gate.

That second story cost more than it looked. Every claim the project made
about cross-provider verification carried a silent asterisk; every close
gate had a Lightweight branch; the Getting Started form opened by asking
a question most adopters could not answer; and `DABBLER_NO_ROUTER=1`
alone was enough to make two Full-tier gates go inert.

The tier's reason to exist expired. The Copilot-seat profile (Sets
078/079/084/086/104) gives a keyless seat real provider access, and the
operator's probe on 2026-08-05 measured **three provider families**
(`anthropic`, `google`, `openai`) on an enterprise seat — so excluding
the orchestrator's own family still leaves two independent verifier
families. Every known user is covered by one tier.

So the tier went. The set's whole job was to remove it **without
falsifying the record** of when it existed.

## What shipped

### Session 1 — the router has one tier, and it fails loud

Five production modules deleted whole (2,581 lines): the Mode B
`dedicated_verification`, the Mode A `external_verification` and
`pending_verification`, the A→B writer `change_verification_mode`, and
the `migrate_lightweight_to_canonical_v4` state migrator — with eight
test modules and the `test-fixtures/cold-start/lightweight/` tree.
Net `ai_router/` reduction: **4,404 lines**.

`runtime_mode`'s precedence lost step 3 (`tier:` from `spec.md`); the CLI
flag and `DABBLER_NO_ROUTER` survive as test affordances. A spec that
still declares `tier: lightweight` now raises with a one-line migration
message naming both remedies.

Two things this session found rather than inherited:

- **The fail-loud loader was true but unreachable.** Round-1 verification
  caught that nothing on the `start_session` happy path parsed the config
  block, and the one live `gate_checks` caller swallowed the error in a
  broad `except Exception`. A stranded consumer — the exact population
  this set targets — would have been registered under one-tier semantics
  and met an unrelated error several steps later. The refusal now fires
  at the boundary, before any state or event write.
- **`--no-router` was an undocumented gate escape.** `_set_is_lightweight`
  returned `True` on the env var alone, disarming `check_verification_integrity`
  and the expensive-suite freshness check. Removing the tier without
  removing those skips would have turned a documented tier into a back
  door. They went with it.

### Session 2 — the extension and the docs tell one story

The Getting Started form's tier fork is gone; its first and only setup
question is now provider access. Seven extension modules deleted whole,
plus eight test modules and the 26-file `hello-world-lightweight`
fixture. `tierLegibility`'s one tier-independent export — the verdict
vocabulary — moved to `verdictTokens.ts` rather than dying with its host.

The workflow doc lost its 383-line Lightweight verification section and
the typed-session procedure whose writers Session 1 had deleted (S1
flagged that as a live trap). `tier-model.md` became a historical note.
The tier-drift guard retired with the tier it defended, keeping its
doc-walk mechanism for Session 3.

Two defects found on the way:

- **The shipped sample project would have broken for every user** of
  `Dabbler: Try a sample project`: its spec declared `tier: lightweight`,
  and its honest `verification_method: "skipped"` close lost its
  sanctioned home when `--no-router` stopped relieving gates. It now
  ships a zero-budget `budget.yaml` — the operator-declared exception the
  gate actually names.
- **`close_session` died with a raw traceback** instead of a gate
  refusal, because the close backstop caught only `VerifySessionError`
  and `assemble_evidence` raises `EvidenceTooLargeError`. Any session
  whose diff overruns the evidence cap hit it — a property of removal
  sets like this one — at exactly the moment an operator most needs to be
  told what to do.

### Session 3 — the gate, the walk, the release

**The tier cannot come back quietly.**
`ai_router/scripts/lightweight_resurrection_guard.py` fails the build if
any live file *declares* the tier, and separately asserts the deleted
module files and both fixture trees stay absent. It is wired into the
`Drift guards` CI job and runs in pytest.

The design problem was never finding the strings. It was telling
"declares the tier" from "explains why the tier is gone", because the
removal deliberately leaves ~40 mentions behind. The gate classifies by
**position**, not by an allowlist of blessed files: comments, docstrings,
markdown prose and inline backticks are narration and are never scanned;
code outside comments, fenced code blocks and YAML/JSON bodies are
declaration territory and always are. An allowlist would have aged into a
blanket exemption — anything could resurrect inside a listed file.

It found two live instructions that would have failed for a user:
`cross-repo-migration-guard-notice.md`, whose banner says everything else
in it still applies, told consumers to run the deleted migrator as step 2
of a 3-step chain; the superseded Set 048 notice said the same. Three
stale present-tense claims went too — including one in
`session-constitution.md`, a **preload** file, which still named
`verificationMode` as a live gate-policy record.

The walk exposed a second gap: the Getting Started form renders **only**
while a workspace has no session sets, and the fixture workspace ships
four — so the onboarding surface, the one this set changed, was the one
surface the walk stager could not stage. `npm run walk -- --empty` now
stages it, proven by `npm run walk:smoke -- --empty` rather than claimed.

## The numbers

| measure | before | after |
| :--- | ---: | ---: |
| tiers | 2 | **1** |
| verification modes | 2 (+ the routed loop) | **0 (the routed loop only)** |
| pytest tests | 3,811 | **3,603** |
| `ai_router/` production lines | — | **−4,404** |
| tracked files mentioning the tier | 611 | **538** |
| live (non-archive) files mentioning it | 264 | **105** |
| live files *declaring* it | — | **0, and now gated** |

**CI minutes did not move, and the set says so.** The nine deleted test
modules were 6.1% of the test count but 3.64s of a ~16-minute suite —
0.4% of the wall clock. The case for this removal is one verification
story instead of two, not a cheaper CI, and the acceptance gate was
deliberately written against *zero live declarations* (executable and
true) rather than a minutes saving the measurement does not support.

## What is staged and waiting for the operator

- **`dabbler-ai-router` `1.0.0`** — the first major, and a genuinely
  breaking one. Also carries the unpublished router work of Sets 105,
  107, 109, 110 and 111.
- **The extension `0.50.0`** — supersedes `0.49.0` (Set 110's native-tree
  Work Explorer), staged and never published.
- **`docs/cross-repo-lightweight-removal-notice.md`** — ready to send.
  Its one real audience is `dabbler-homehealthcare-accessdb`, which ran
  on the tier.

Publishing, tagging, and sending the notice are the operator's. The
version *number* (`1.0.0` vs. staying pre-1.0 at `0.35.0`) is Decide item
A of the walk.

## What this set deliberately did not do

- **No verification-loop changes** — that was Set 111.
- **No seat-profile changes** — that is the replacement, not part of the
  removal.
- **No consumer-repo edits.** The notice tells consumers what to do;
  doing it for them is their own repos' work.
- **No rewriting of history.** 399 archived session sets and 62 proposals
  ran under the tier and stay readable; the gate excludes them by
  construction, and one superseded notice is preserved verbatim under an
  explicit frozen-history marker rather than being edited into a lie
  about what it once said.
