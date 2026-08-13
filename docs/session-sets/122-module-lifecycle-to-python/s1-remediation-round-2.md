# Set 122 Session 1 — remediation, round 2 (supplementary)

## Finding (Major, Completeness): `create` did not port the lifecycle-set scaffolding or its numbering

**Accepted.** The finding is correct and it is the more consequential of the
two rounds. `newModule.ts:91` calls `scaffoldModuleLifecycleSets` immediately
after `scaffoldNewModule`, so today's **New Module** action produces three
things: the manifest entry, the plan stub, **and** the numbered
`NNN-<module>-plan` / `NNN-<module>-decomposition` set pair. The Python
`create` produced only the first two, so Session 2 wiring `dabbler.newModule`
to this CLI would have silently regressed a main-path command.

It is also a spec-letter miss, not only a consequence: verdict §4's adopted
surface is *"validation, rollback, **numbering**, running-session refusal,
sanctioned cancellation"*, and numbering was the one item with no port.

### Fix

`ai_router/modules.py`:

- `scaffold_module_lifecycle_sets()` — resolves the next two free set numbers
  (`max(prefix) + 1`, zero-padded to `max(3, widest)`, mirroring
  `resolve_set.next_session_set_number`), reserving the freshly-minted plan
  slug so the decomposition number advances past it; renders both templates;
  cross-links the decomposition set's `prerequisites:` to its sibling plan;
  and is **skip-existing by identity**, so a re-run reuses an existing
  `-<module>-plan` / `-<module>-decomposition` set rather than minting a
  duplicate.
- `render_lifecycle_spec()` fails loud on any unsubstituted `{{TOKEN}}`, and
  `_assert_lifecycle_spec_valid()` re-parses the rendered config block as real
  YAML to confirm the declared `kind` and the `prerequisites:` cross-link
  actually landed — the cross-link *is* the gating mechanism, so a template
  that lost it would gate nothing while still looking scaffolded.
- Only `spec.md` is written. `session-state.json` belongs to the sanctioned
  runtime writers, and the scaffold must not pre-empt them.

### Deliberate divergence from the TypeScript flow

`newModule.ts` scaffolds the lifecycle sets **after** the manifest write and
downgrades a failure to a warning, on the stated grounds that *"a module
without its lifecycle sets beats a half-written manifest entry."* That
trade-off existed because TypeScript had no rollback. This session's own
contract is *"a create that scaffolds a directory and then fails to append the
manifest entry must leave neither behind"*, so the scaffold runs **inside the
same transaction**: a create either fully happened or did not happen at all,
and a failed create can simply be re-run (which the TypeScript behaviour
prevents, since `create` refuses an already-declared slug).

### Packaging

The two templates are canonical at `docs/templates/consumer-bootstrap/` (the
extension's esbuild bundle reads them there) but a pip-installed router has no
repo checkout, so they now also ship as package data under
`ai_router/templates/` (`pyproject.toml` `[tool.setuptools.package-data]`).
The resolver prefers the packaged copy and falls back to the docs copy.
`test_lifecycle_templates_are_byte_identical_in_both_homes` pins the two
byte-for-byte — the drift risk `moduleAuthoring.ts` names in a comment and
never checks. **Session 2 should collapse this to one copy** when it rewires
the extension bundle; the parity test is what makes the interim safe.

### A defect this fix's own falsifier found

Writing `test_create_rolls_back_the_lifecycle_sets_too` (inject a failure
*after* a spec lands) exposed two real gaps in `_Transaction`, both now fixed:

1. The undo entry was recorded **after** `write_text` returned, so a writer
   that failed part-way was never undone. Intent is now recorded **before**
   the write is attempted.
2. Rollback wrote unconditionally, so a permanently-failing path reported
   `rolledBack: false` even when nothing had changed. Each undo is now
   conditional on the effect actually being present, which makes rollback
   idempotent and keeps a genuinely-failed undo distinguishable from a no-op.

Mutation-checked: disabling the rollback body fails all four rollback
falsifiers; restoring it returns the suite to green.

### Acceptance criterion

The round's executable criterion asserts that after
`create_module(root, "greeter", "Greeter")` on a repo whose highest set is
`005-existing`, `006-greeter-plan` and `007-greeter-decomposition` exist and
the decomposition spec references the plan slug.
`test_create_scaffolds_the_numbered_plan_and_decomposition_set_pair` asserts
exactly that (with `payment-api` as the slug), plus the parsed `kind`, the
substituted tokens, and the absence of a scaffolded `session-state.json`.
