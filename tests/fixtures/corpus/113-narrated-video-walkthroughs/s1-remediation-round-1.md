# Session 1 remediation — rounds 1 (discovery) and 2 (supplementary)

Five blocking findings across the two discovery passes. **All five
accepted; none disputed.** Two Criticals and three Majors, fixed in one
pass.

Four of the five were one underlying mistake wearing two hats: **a rule
enforced in one place and not the other**, so the shape that should have
been refused sailed through the path nobody was looking at. The fixes go
after that class, not only the five reported instances (G-008).

---

## R1-F1 (Critical) — an indentationless YAML sequence parsed as an empty inventory

**Accepted.** `uatComponents:` followed by `- Work Explorer` *flush with
the key* is valid YAML and is what most YAML emitters write. The parser
terminated its scan on indentation — items had to be indented **deeper**
than the key — so that shape returned `()`, the gate read it as an
explicitly empty inventory, and a disposition with `components: []`
closed cleanly over two declared components.

This is the exact failure the session exists to prevent, arriving through
the parser rather than through the gate. The verifier's probability
judgement is right: this is a normal authoring shape, not an adversarial
one.

**Fix:** `ai_router/spec_config.py` — termination is now by **shape**, not
indentation. Blank and comment-only lines are skipped, any `- ` line is an
item at any indentation, and the first line that is none of those ends the
list. The neighbouring-key guard survives on better grounds: a
`prerequisites:` line is not a list item, so the scan still stops on it —
now for a reason that does not depend on how deeply anything is indented.

## R1-F4 (Critical) — a comment between entries truncated the inventory

**Accepted.** Same root cause, different trigger: the scan `break`s on the
first line that is not an item, and a comment-only line is not an item. A
comment before the first entry emptied the inventory; a comment between
entries silently dropped everything after it. Both directions produce a
**shorter** inventory than the author wrote, and a short inventory fails
**open**.

**Fix:** comment-only lines are skipped rather than terminating (same
rewrite as R1-F1).

**Second half of this finding, also accepted:** a bare `uatComponents:`
with nothing under it must not be read as the explicit empty list. It
reads as an unfinished edit, and the deliberate form is one keystroke
away. `_parse_uat_components` now returns `None` (undeclared → the gate
refuses) rather than `()` (declared empty → passes). The two answers had
opposite consequences and should never have shared a spelling.

## R1-F2 (Major) — trailing comments became part of component names

**Accepted, and it broke this session's own documentation.** The
authoring-guide example I wrote annotates each entry:

```yaml
uatComponents:
  - Work Explorer tree   # in-scope components the close gate accounts against.
```

`_LIST_ITEM_RE` kept the comment in the value, so the inventory declared
`"Work Explorer tree   # in-scope components…"` while the same guide told
the author to record `"Work Explorer tree"` — the gate would then report
the clean name as both missing and extra. The documented shape was a
broken shape.

**Fix:** one `_clean_item` helper, quote-aware first (a name may contain a
`#`), then stripping a trailing ` #…` from unquoted values. YAML requires
whitespace before `#`, so `A#B` stays a literal name. The two
quote-handling helpers collapsed into this one (G-005 — the fix removed a
function rather than adding one). A test now asserts the guide's own block
parses to clean names, which is the assertion that would have caught this.

## R1-F3 (Major) — the validator accepted top-level `uat` keys the schema rejects

**Accepted.** I closed the **component record's** key set to keep a
self-assessed confidence score out, and left the block **around it** open.
So `{"attestation": …, "components": […], "confidence": 0.8}` passed the
Python validator — the score simply moved one level up — and
`disposition.schema.json` rejected it under `additionalProperties: false`.
The likeliest real instance is a `walkArtifact` left behind by a Set 111
migration, during an explicitly breaking release.

**Fix:** `UAT_BLOCK_KEYS = {attestation, components}`, enforced, with
`status` excluded so it keeps its dedicated migration message. The error
names `walkArtifact`'s new home.

## R2-F1 (Major, supplementary) — `reviewers: null` passed the validator and failed the schema

**Accepted.** The abstained-method check was `if entry.get("reviewers")` —
**truthiness**, not presence and type. `null`, `false`, `0` and `{}` all
sailed through, while the schema's `reviewers` is an array
(`maxItems: 0` for an abstention) and rejects every one of them. A
nullable-field serializer emitting `"reviewers": null` is an ordinary
thing for a consumer to produce.

**Fix:** presence-and-type aware. `reviewers` omitted or `[]` is accepted;
anything else present is refused, with a distinct message for the
wrong-type case that names the schema disagreement.

---

## The class, not the instances

R1-F3 and R2-F1 are both *"the Python validator and the JSON schema
disagree about one file"*. Fixing the two reported shapes leaves the class
alive, so the remediation ships a **corpus parity test**: 21 blocks
covering every shape either validator has an opinion about, each run
through **both**, asserting the same verdict. It fails on any future rule
added to one path and not the other.

The corpus carries its own non-vacuity assertion — it must contain both
accepted and rejected shapes — because a corpus that drifted to
all-accepting would make the parity test pass while checking nothing
(L-112-1).

## Evidence

- **New tests:** 45 added (61 → 106 in
  `ai_router/tests/test_set113_uat_accounting.py`), in three classes:
  `TestInventoryParserFailsTowardDeclaringMore`,
  `TestValidatorAndSchemaAgree`, `TestInventoryGateAfterTheParserFix`.
  Each finding has a falsifier that plants the exact reported shape, and
  each has its legitimate look-alike asserted to still pass — the
  neighbouring `prerequisites:` list must still not be swallowed, an
  abstention may still omit `reviewers` or pass `[]`.
- **Targeted suite:** `pytest -n 8 -k "spec_config or disposition or gate
  or close or uat or modules or checklist or lightweight or preflight"` —
  **1434 passed, 0 failed** (up from 1389 pre-fix; the delta is the new
  tests).
- **Manual parity sweep** across 14 shapes: Python validator and
  `disposition.schema.json` agree on every one.

## A note on the acceptance criteria — none of them can execute

`acceptance_harness --round 1` reports all four findings **still-failing**
on the fixed tree. That verdict is correct as far as the harness can see,
and it is **not** evidence about the fix: the three executable criteria
are unrunnable as authored, and they fail identically on the pre-fix and
post-fix trees.

The verifier emitted each one as:

```
python -c "exec(\"import runpy\nm = runpy.run_path('ai_router/spec_config.py')\n...\")"
```

Run exactly as the harness runs it, every one dies at parse time:

```
File "<string>", line 1
    "exec(\"
    ^
SyntaxError: unterminated string literal (detected at line 1)
```

The interpreter never reaches this session's code. One of the three has a
second, independent problem: `runpy.run_path('ai_router/disposition.py')`
cannot work regardless of quoting, because that module uses the repo's
dual-mode import (`from .session_state import …` falling back to a bare
`from session_state import …`) and neither branch resolves under
`run_path` from the repo root. `spec_config.py` is importable that way
because it imports only the standard library.

**So the criteria were executed for their meaning instead**, against the
same interpreter the suite uses, including executable forms of the two
JUDGMENT criteria. All nine assertions pass on the fixed tree:

```
PASS R1-F1  indentationless sequence parses as a two-item inventory
PASS R1-F2  trailing comment is not part of the component name
PASS R1-F3  a top-level confidence key is refused
PASS R1-F4a comments before and between items preserve every item
PASS R1-F4b a bare uatComponents: is NOT the explicit empty list
PASS R1-F4c an explicit [] still declares an empty inventory
PASS R2-F1a reviewers: null on an abstention is refused
PASS R2-F1b an abstention may still omit reviewers
PASS R2-F1c an abstention may still pass an empty list
```

Each of those nine is also a committed test in
`ai_router/tests/test_set113_uat_accounting.py`, so the evidence is
durable rather than a one-off run. **The harness's still-failing rows are
a criterion-authoring defect, not an unfixed finding** — settlement is
left to `--phase remediation-review`, which reads the fix delta itself.
