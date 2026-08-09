# S3 remediation — round 1 (discovery) + round 2 (supplementary)

> Six blocking findings, merged across both discovery passes and fixed in
> one pass. Every one was accepted; none was disputed. Four of the six are
> the same defect class — **the gate's declaration/narration boundary was
> drawn too narrowly and let real declaration shapes through** — and they
> are answered together by widening the rules, not by widening the
> exemptions.

## Round 1, findings 1 + 5 — the gate missed live declaration shapes

**Accepted.** The verifier planted four shapes in throwaway trees and the
gate exited 0 on all of them. Each is an ordinary way this repo writes
code, so these are probable over the gate's life rather than adversarial:

| shape | why it slipped |
| :--- | :--- |
| `{"tier":"lightweight"}` | `TIER_DECLARATION` was line-anchored |
| `verificationMode?: string` | the field regex required `:` or `=` immediately after the name; TypeScript's optional marker sits between |
| `if (spec.verificationMode)` | a property **read** has neither `:` nor `=` |
| `type VerificationMode = "out-of-band-or-none" \| "dedicated-sessions"` | the PascalCase type name was not a pattern at all, and `MODE_VALUE` required the literal to end the line |
| `const DEFAULT_MODE = "dedicated-sessions";` | same: `;` is not end-of-line |
| `MODES = ["a", "dedicated-sessions"]` | same |

**Fix.** `TIER_DECLARATION_INLINE` was added for the embedded JSON form;
`VERIFICATION_MODE_FIELD` now also matches an optional property, a
property read, and the PascalCase alias; `MODE_VALUE` now keys on an
assigning/aliasing/listing **prefix** (`:` `=` `=>` `[` `,` `|`) and
accepts `;` `)` `}` `]` `|` `,` or a comment as the terminator.

**One boundary was drawn deliberately and is pinned by a test.** A bare
mode literal alone on its own line is *not* flagged, because the
Playwright spec that proves a stale `.dabbler/verification-mode` marker
is now **inert** has to write `"dedicated-sessions\n"` as a positional
argument. A literal in that position configures nothing, and a gate that
failed the test proving the removal works would be eating its own
evidence.

**A second boundary came from a false positive this fix produced.** The
first inline rule required only the *value* to be quoted, and it fired on
`test_spec_config.py:133` — `for raw in ('tier: "lightweight"', ...)`, a
test that plants quoted variants to prove the loader refuses them. The
rule now requires **both** key and value quoted, which is the JSON /
object-literal shape and nothing else. YAML and markdown lose nothing:
a real config entry starts its line and is caught by the line-anchored
rule, quoted or not.

## Round 1, finding 2 — triple-quoted templates were treated as narration

**Accepted, and it was the sharpest finding of the round.** The Python
blanker blanked *every* triple-quoted string on the theory that
docstrings live there. But `SPEC = """\ntier: lightweight\n"""` is an
ordinary way to embed a spec snippet, and it was blanked and passed.

**Fix.** `_docstring_spans()` uses `ast` to find the real docstrings —
the first statement of a module, class, or function, and nothing else.
Comments still blank via `tokenize`. Every other string, single- or
triple-quoted, is now scanned.

**This is why the boundary above matters.** With multi-line strings
scanned, the line-anchored rule catches a real embedded spec (whose YAML
starts its line) while single-line escaped fragments in tests
(`"tier: lightweight\nrequiresUAT: false"` as a Python string) still
pass. Both directions are pinned.

## Round 2 (supplementary), finding 1 — `.template` scaffolds were not scanned

**Accepted, and this was the worst blind spot of the three.**
`docs/templates/consumer-bootstrap/spec.md.template` is the canonical
source of every new consumer repo's `spec.md`. A tier declaration there
would be handed to every future adopter — and CI would stay green,
because `.template` was not in the extension map at all.

**Fix.** `effective_suffix()` resolves `.template` / `.tmpl` / `.in` to
the suffix of the stem, so `spec.md.template` is read as markdown and
`azure-pipelines.yml.template` as YAML. Verified by planting a
declaration in the real scaffold's shape.

## Round 1, finding 3 — the recorded Layer 2 run named a command nobody ran

**Accepted, and the fix is in the product, not in the record.**
`run_of_record.DEFAULT_SUITES` declared the mocha suite's command as
`npm test` — the `@vscode/test-electron` Layer 2 harness, which
`CONTRIBUTING.md` documents as **broken on Windows 11 + VS Code 1.120**
and which CI skips for that reason. Layer 2 is `npm run test:unit`, and
that is what every session has actually run.

So the run of record has been naming an unrunnable command since it
shipped. This session's release-boundary evidence inherited it.

**Fix.** The suite's declared command is now `npm run test:unit`, with a
comment recording why. The Layer 2 run was re-recorded after the fix.
This is a repo-wide correction, not a Set 112 one — every future session
records the command it can actually run.

## Round 1, finding 4 — the release-status row named a stale live version

**Accepted, and it was pre-existing staleness this session perpetuated.**
`docs/repository-reference.md`'s router row said `0.33.0` live.
`ai_router/CHANGELOG.md` says **`0.34.0` was published 2026-07-15** (Set
104, tag `v0.34.0`, operator-authorized), superseding `0.33.0`. The row
was never updated after that publish, and Session 3 wrote `1.0.0 (staged)
/ 0.33.0 (live)` on top of it without checking the claim it was
inheriting — exactly the L-064-8 failure the conventions block warns
about, committed by the session that quoted the lesson.

**Fix.** The row now reads `1.0.0` (staged) / `0.34.0` (live), carries
`0.34.0`'s publish details, demotes `0.33.0` to prior lineage, and names
the correction inline — the same way the extension row records the
`0.46.0` correction Set 107 S1 made for the identical failure mode.

## What was re-run after the fixes

| suite | result |
| :--- | :--- |
| `pytest ai_router/tests/test_lightweight_resurrection_guard.py` | 55 passed (was 41; 14 new falsifiers, one per missed shape) |
| `pytest ai_router/tests/test_run_of_record.py` | 49 passed |
| the gate against the real repo | exit 0 |
| the nine verifier-named shapes, planted in throwaway trees | 9/9 caught |

The full matrix re-run is recorded in `test-runs.jsonl`.

---

## Round 3 (remediation-review) — two live READ forms still slipped

**Accepted.** Four of the five round-1 fixes were accepted; the
declaration-shape fix was **rejected**, and correctly so: it covered the
places the field is *written* and the dotted read, but not the two most
ordinary ways TypeScript *reads* a config field.

| shape | why it slipped |
| :--- | :--- |
| `const { verificationMode } = spec;` | destructuring binds the name with no `:`/`=`/`.` adjacent to it |
| `spec["verificationMode"]` | bracket access quotes the name inside `[...]`, which the field rule read as a list context |

**Fix.** Two alternatives added to `VERIFICATION_MODE_FIELD`: a
destructured binding (`[{,]` … name … `[},:=]`, which also covers
`{ verificationMode: renamed }` and `{ tier, verificationMode }`) and a
quoted bracket read.

**The risk this fix carries is over-reach**, because these rules key on
the bare identifier rather than on punctuation that only appears in
machine syntax. Three lines live in the repo today would break if the
rules degraded into "the word appears": a Layer 2 test *name* containing
`tier / verificationMode`, a `!/verificationMode/.test(spec)` assertion,
and the string `"spec must not mention verificationMode"` — all in
`consumerBootstrap.test.ts` / `sessionSetKind.test.ts`, and all of them
tests that *prove the removal*. A test pins exactly those three lines as
clean.

Probes, planted in throwaway trees: `const { verificationMode } = spec`,
`const { verificationMode: mode } = spec`, `spec["verificationMode"]`,
and `cfg['verification_mode']` — 4/4 caught. The guard's suite is now
**60 tests**.

---

## Round 4 (remediation-review cycle 2) — accepted and fixed AT THE BOUND

All seven prior fixes were accepted (7 accepted / 0 rejected). One new
finding arrived, naming two gaps. **Both were real, and one of them was a
bug I wrote in the round-3 fix.**

1. **`verification[_M]ode` never matched `verification_mode`.** The
   character class reads as "verification" + one of `_`/`M` + "ode", so
   it matches `verificationMode` and the nonsense `verification_ode` —
   but not the snake_case spelling it was written to cover. The dotted
   and destructuring branches were therefore blind to
   `spec.verification_mode` and `const { verification_mode } = spec`.
   Corrected to `verification(?:_m|M)ode`. (The bracket-read branch used
   `[_-]?[Mm]ode` and was always right; the inconsistency is what hid it.)

2. **A bare-key object literal — `const spec = { tier: "lightweight" }`
   — was not an inline declaration.** Round 1 had narrowed the inline
   rule to *both* sides quoted to escape a false positive on Python
   tests. That narrowing was right for Python and too wide for
   everything else. A second rule, `TIER_DECLARATION_INLINE_BARE`,
   applies the bare-key form **everywhere except `.py`**. The exception
   is the point: planting a spec fragment inside a string is the idiom
   of the Python tests that prove the refusal fires, TypeScript has no
   such tests (its tier tests were deleted with the tier), and the only
   non-Python live matches in the whole repo are markdown prose inside
   the frozen historical record. A real Python template is still caught —
   its YAML starts its own line.

Probes: 4/4 caught. Guard suite: **65 tests**.

### Why this round is a STOP, not a fifth round

`verify_session` enforces at most two remediation-review cycles and now
**refuses** another. That refusal is about opening a *round*, not about
fixing — the fixes above are in, tested, and probed. What has not
happened is an independent re-read of them.

Both fixes are narrow (two regex alternatives and one character class),
both are pinned by falsifiers, and the pattern across rounds 1→3→4 is
convergent — each round's findings were a strictly smaller, more
specific set than the last. But convergent is not converged: this same
verifier has now found a missed shape in three consecutive rounds, and
the honest reading is that a fourth look might find a fifth shape.

That is the operator's call, and it is item D of the close-out brief:
accept the close with this residual named, authorize a fifth round, or
take a third-provider opinion. The residual, stated plainly: **the gate
catches every shape anyone has thought to plant, and no one can prove
that is all of them.** Its floor does not depend on the regexes —
`check_deleted_files_stay_deleted` reads the filesystem, and a returned
module is caught no matter how it is spelled.

---

## Round 5 (the close backstop) — two more, and the worse one was not the gate

The close gate runs its own in-process verification, and it refused the
close. Both findings were accepted.

### 1. The engine bootstrap files still taught the tier

`AGENTS.md`, `CLAUDE.md` and `GEMINI.md` all still described
`session-state.json` as "the v4 shape, **on both Full and Lightweight
tiers**". These are the files every Claude / Copilot / Gemini session in
this repo **auto-loads at session start** — the highest-frequency guidance
surface there is, and a preload file besides.

This is the miss that matters most in the whole set, and it is worth being
precise about why nothing caught it earlier:

- Session 2 collapsed the docs and did not reach them.
- The gate cannot see them **by design**: they are markdown prose, which is
  narration territory. The gate proves nothing *declares* the tier; it
  never claimed to prove nothing *describes* it.
- Three rounds of routed verification read the diff, and these files were
  not in the diff.

Fixed in all three, and pinned by a test that reads the three files
directly and asserts the word does not appear. That test is the narrow,
explicit exception to the positional rules, justified by frequency: a
stale claim here steers every future session in the repo.

### 2. The field as a VALUE, and a mode literal returned

Three more shapes, all ordinary config-compatibility code:

| shape | why it slipped |
| :--- | :--- |
| `const LEGACY_KEY = "verificationMode";` | every field rule looked for the name in a *key* position; here it is the value |
| `ALLOWED_SPEC_FIELDS = ("requiresUAT", "verificationMode")` | same — a quoted name in a tuple |
| `return "dedicated-sessions";` | `MODE_VALUE` had no `return` (or `case`) prefix |

**Fix.** A quoted-identifier alternative (`"verificationMode"` /
`"verification_mode"`), plus `return` / `case` prefixes and `:` as a
terminator for mode values.

**The quoted-identifier rule is deliberately spelling-specific.** It
matches the camelCase and snake_case forms the *field* took, not the
hyphenated `"verification-mode"`, which is the on-disk **marker filename**
the Playwright spec must name to prove that marker is inert. Pinned.

**It also surfaced one genuine leftover.** `test_path_aware_critique.py`
asserted the critique entry kind was not `"verification_mode"` — a
collision guard against a record whose writer S1 deleted. The assertion
had become a claim about a kind nothing can emit. Narrowed to
`suggestion_disposition`, the live sibling, with a note.

Probes: 4/4 caught. The guard's suite is **70 tests**, and every shape
found across rounds 1, 3, 4 and 5 is pinned as a falsifier.

---

## Round 6 (the close backstop, again) — the multiline list

**Accepted, and it landed on a boundary I had drawn wrong.**

`MODE_VALUE` required an assigning prefix (`:` `=` `[` `,` `return`
`case`) on the same line. In a multiline list or tuple every element sits
on its own line with no prefix in sight:

```python
MODES = (
    "out-of-band-or-none",
    "dedicated-sessions",
)
```

That is the most natural way a mode enum would come back, and the gate
exited 0 on it.

The prefix requirement existed to spare the Playwright spec that proves a
stale `.dabbler/verification-mode` marker is now inert, which writes
`"dedicated-sessions\n"` as a positional argument. Relaxing the rule
looked like it would trade one hole for a false positive on the test that
proves the removal works.

**It does not, and the reason is a better rule than the one it replaces.**
The quoted form now matches a literal whose **entire content** is a mode
name. `"dedicated-sessions\n"` is a mode name *plus a newline* — file
content, not a configuration value, since no config value carries a
trailing newline inside its literal. So the multiline tuple is caught and
the marker-content line is spared **for a stated reason rather than by an
exemption**, which is what the prefix rule was really standing in for.

The bare, unquoted YAML form (`mode: dedicated-sessions`) keeps its
`:`/`=` prefix, because unquoted prose would otherwise match.

Probes: 6/6 correct (5 caught, 1 correctly spared). Guard suite: **74
tests**.

---

## Round 7 (the close backstop, third time) — and the change of tactic

**Accepted.** An unquoted YAML sequence slipped:

```yaml
modes:
  - out-of-band-or-none
  - dedicated-sessions
```

`- ` was not in the bare-value prefix set. The one-line fix was obvious,
and taking it would have been the wrong move.

**Three consecutive backstop rounds had each found one more syntax**, and
the pattern was no longer about this gate — it is what a regex-based gate
*is*. Syntax can be enumerated indefinitely; a regex can never be provably
complete against it. Adding a seventh prefix would have bought exactly one
more round of the same.

**So the tactic changed.** In a **data file** — YAML, JSON, or a fenced
block in a doc — comments are already blanked, so anything remaining is
content a machine reads. There is no such thing as an incidental mention
there. `MODE_VALUE_IN_DATA` therefore matches the mode names **bare, in
any position**, in `.yaml` / `.yml` / `.json` / `.md`-fence territory, and
the entire class of "some YAML shape the prefix rules did not anticipate"
closes at once.

Code keeps the exact-quoted rule, because code genuinely does hold
incidental mentions (string arguments, test names, assertions about
absence) that the two territories treat differently for stated reasons.

Probes: 5/5 correct — sequence, flow sequence, JSON array, a fenced block
in markdown, and a YAML **comment** naming a mode, which is still
narration. Guard suite: **80 tests**.

### The honest reading of rounds 5–7

The verifier was right three times running, and each fix was real. But the
findings were also strictly decreasing in consequence — from *the preload
files teach the tier* (round 5) to *a YAML sequence syntax* (round 7) —
and the last two were the same defect wearing different syntax. The
data-file rule is the answer to the class rather than to the instance,
which is why it is worth recording as a change of tactic and not just
another row in the table.

---

## Round 8 (the close backstop, fourth time) — the parser form

**Accepted, after being weighed for a dispute.** The finding: a legacy
compatibility *parser* names the removed field and modes in regex form —
`/verificationMode\s*:/`, `re.compile(r"verificationMode\s*:")`,
`/dedicated-sessions|out-of-band-or-none/` — and none of them tripped the
gate. It is a real hole: a regex-only resurrection never has to spell the
field in any position the other rules watch.

**This one was close to a dispute, and the reason it is not is worth
stating.** The obvious fix — flag the identifier inside any regex —
would have flagged `consumerBootstrap.test.ts`'s
`!/verificationMode/.test(spec)`, a live test asserting the field is
**absent** from a scaffolded spec. A gate that fails the test proving the
removal works is worse than the hole.

The distinction that resolves it is mechanical and, once seen, obvious:
**a metacharacter after the name means parsing; a bare name means
testing.** `/verificationMode\s*:/` reads a field. `/verificationMode/`
checks for one. So the rule is anchored on `\s`/`\d`/`\w`/`\b` following
the identifier, and on a mode name adjacent to an alternation pipe.

Probes: 5/5 correct — all four parser forms caught, the absence assertion
spared. Both directions pinned.

### Where this stops

Four consecutive backstop rounds, each finding one more syntax for the
same field. Rounds 6–8 were all answered by generalising rather than by
enumerating — the exactness rule, then the data-file rule, then the
metacharacter rule — and each generalisation closed a class rather than an
instance. That is the right response to an adversary who can always
produce one more syntax, and it is also the reason the residual named at
the loop bound stands unchanged: **the gate catches every shape anyone has
thought to plant, and no one can prove that is all of them.** Its floor
does not depend on any regex — `check_deleted_files_stay_deleted` reads
the filesystem.

---

## Round 9 (the close backstop, fifth time) — my own asymmetry

**Accepted, and this one was my fault rather than the verifier's
persistence.** Round 8's fix gave the *field* a parser rule and left the
*tier* without one, so `/tier\s*:\s*lightweight/` and
`re.compile(r"tier\s*:\s*lightweight")` still passed — and
`spec_config.py` says in as many words that the spec-config parser is
"intentionally simple regex", which makes that the single most plausible
shape a tier restoration would take in this repo. The colon-only field
form (`/verificationMode:/`) slipped for a smaller reason: `/` was not in
the set of characters allowed before the name.

**Fix.** `TIER_IN_REGEX`, anchored the same way round 8's rule was — on an
escape class between the words, or a `/` delimiter opening the literal —
and `/` added to the field rule's leading class.

**The anchoring matters more here than anywhere else in the gate**, because
the migration message *is* the same three words in the same order:
`tier: lightweight was removed in Set 112 ...`. That string is the text a
stranded consumer reads. It is spared because it has no regex syntax in
it, not because it is exempted. Pinned in both directions.

Probes: 5/5 correct. Guard suite: **90 tests**.
