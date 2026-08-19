# S3 live-seat refresh evidence

Operator's seat, CLI **1.0.80**, 2026-08-19. Every command below was run
against the real seat; nothing here is a fixture. The point of the record
is that no human opened the lockfile in an editor at any stage — the
absence of that possibility is what the whole set exists to restore.

Transport resolution for these runs: `DABBLER_TRANSPORT` was **unset** in
the process environment and no `--transport` flag was passed. The seat
was reached because `local-overrides.yaml` says `transport.profile:
copilot-cli`, while the packaged `ai_router/router-config.yaml` still
reads `profile: api`.

---

## 1. `refresh --quorum --dry-run` — the projection

```
refresh plan: scope=quorum, 3 model(s) to probe
  claude-sonnet-4.6  (sample: 1)
  gemini-3.1-pro-preview  (sample: 1)
  gpt-5.5  (sample: 0)
projected cost: 2 premium request(s) from recorded samples
dry run: nothing probed, lockfile untouched.
```

**2 premium requests**, which is the set's acceptance criterion. The
lockfile was byte-identical afterwards. For comparison, `--all` on the
same file projects 39 known plus 5 of unknown cost — the shape that made
v1's writer unrunnable, still available, still only by name.

## 2. `refresh --quorum` — the real run

```
projected cost: 2 premium request(s) from recorded samples
changed:
  cli version re-dated: 'GitHub Copilot CLI 1.0.68.' -> 'GitHub Copilot CLI 1.0.80.'
  re-confirmed: claude-sonnet-4.6 on 'GitHub Copilot CLI 1.0.80.'
  re-confirmed: gemini-3.1-pro-preview on 'GitHub Copilot CLI 1.0.80.'
```

Spent what it projected: all three probes returned the samples already
recorded (1, 1, 0 → total 2), so no `sample moved` line was emitted.
`gpt-5.5` produced no `re-confirmed` line because set 137 had already
confirmed it on 1.0.80 — only its `confirmed_at` was re-dated. The
report is a diff, not a success message, and it is silent about the 15
entries the run did not touch.

## 3. `refresh --models claude-haiku-4.5,claude-opus-4.7`

The two entries set 137 could not confirm. Both recorded no sample, so
the plan priced them honestly as unknown and asked before spending;
`--yes` authorized it (stdin is not a TTY here, and an unattended run
without `--yes` fails closed rather than prompting into the void).

```
refresh plan: scope=models, 2 model(s) to probe
  claude-haiku-4.5  (sample: unknown)
  claude-opus-4.7  (sample: unknown)
projected cost: 0 premium request(s) from recorded samples
  plus 2 of unknown cost (claude-haiku-4.5, claude-opus-4.7) -- unknown is not zero, so this projection is a floor
changed:
  re-confirmed: claude-haiku-4.5 on 'GitHub Copilot CLI 1.0.80.'
  probe failed: claude-opus-4.7 (invalid-model); the prior confirmation stands, visibly stale
```

`claude-opus-4.7` is the merge rule demonstrated live rather than in a
fake: the probe failed, and the entry kept its 1.0.68 confirmation with
`last_probe_error = "invalid-model"` recorded beside it. Nothing was
demoted on one bad probe. Note what the error class does **not** say —
a withdrawn model and a policy-blocked one return the identical CLI
error, so the record states the failure and infers nothing from it.

## 4. The resulting diff

Cumulative over every run in this session. Five entries touched; the
other thirteen are byte-identical, provenance included.

```diff
@@ [meta] @@
-cli_version = "GitHub Copilot CLI 1.0.68."
+cli_version = "GitHub Copilot CLI 1.0.80."
-probed_at = "2026-07-04T16:17:00Z"
+probed_at = "2026-08-19T12:13:37Z"
+written_by = "ai_router.transports.copilot 1.1.0"
+written_at = "2026-08-19T12:13:37Z"
+content_digest = "sha256:7816e62faafe67cd75464f4bd188f620479847f83fbdf4645553ab77dcbd9599"

@@ claude-sonnet-4.6 @@
-confirmed_at = "2026-07-04T16:17:00Z"
-confirmed_on_cli_version = "GitHub Copilot CLI 1.0.68."
+confirmed_at = "2026-08-19T12:13:37Z"
+confirmed_on_cli_version = "GitHub Copilot CLI 1.0.80."

@@ claude-haiku-4.5 @@
-confirmed_at = "2026-07-04T16:17:00Z"
-confirmed_on_cli_version = "GitHub Copilot CLI 1.0.68."
+confirmed_at = "2026-08-19T12:12:59Z"
+confirmed_on_cli_version = "GitHub Copilot CLI 1.0.80."
+probe_premium_requests = 0.33

@@ claude-opus-4.7 @@
+last_probe_error = "invalid-model"
+last_probe_at = "2026-08-19T11:59:01Z"

@@ gpt-5.5 @@
-confirmed_at = "2026-08-18T19:40:00Z"
+confirmed_at = "2026-08-19T12:13:37Z"

@@ gemini-3.1-pro-preview @@
-confirmed_at = "2026-07-04T16:17:00Z"
-confirmed_on_cli_version = "GitHub Copilot CLI 1.0.68."
+confirmed_at = "2026-08-19T12:13:37Z"
+confirmed_on_cli_version = "GitHub Copilot CLI 1.0.80."
```

`claude-opus-4.7` keeps its 1.0.68 confirmation and its 11:59 failure
timestamp through three later writes: a run that does not probe an entry
does not touch it.

## 5. After: provenance and validation

```
written_by      ai_router.transports.copilot 1.1.0
written_at      2026-08-19T12:13:37Z
content_digest  sha256:7816e62f…
provenance      machine-written
validate_catalog(live_cli_version="GitHub Copilot CLI 1.0.80.")
                ok=True, warnings=()
```

The drift warning that fired on every verification since set 137 is
gone, because the file was re-dated by a command instead of by hand. The
file now carries a stamp, so the next load can tell whether anyone
edited it.

---

## 6. Round-1 finding, remediated: the sample can be fractional

Verification round 1 returned one Major, and it was right. `claude-haiku-4.5`
came back from step 3 re-confirmed but with its sample still **unknown**,
which meant the step's own purpose — "so the unknown-cost entries stop
being unknown" — was unmet. The reason was on the wire:

```json
{"type":"result","usage":{"premiumRequests":0.33,...}}   // claude-haiku-4.5
{"type":"result","usage":{"premiumRequests":0,...}}      // gpt-5-mini
```

`premiumRequests` is a **float** for sub-premium models. Session 1 read
any float as malformed and coerced it to `None`; its round-4 finding had
named "a float, a list" as values that must not reach the writer, on the
assumption that a float was noise. The seat says otherwise — 0.33 is the
measurement, correctly reported.

The consequence was an inversion. An unknown sample sorts after every
known one (`_cost_order`), so the seat's *cheapest* models were filed as
its most uncertain: `--quorum` picked `claude-sonnet-4.6` at 1.0 over
`claude-haiku-4.5` at 0.33, and `needs_confirmation` fired on entries
costing a third of a request.

**The fix.** `_coerce_probe_premium_requests` now accepts any finite,
non-negative `int` or `float`; a bool, a string, a list, a negative or a
non-finite value is still not a count and still reads as unknown. The
writer renders a float through `repr`, the shortest text that reads back
as the same float, so a sample survives a rewrite unchanged and the
content digest holds. The boundary rule session 1 established is intact —
what changed is which values are *at* the boundary, which only the live
seat could tell us. What did not change: the sample is a one-call
observation, never a price, and it never feeds model selection.

```
refresh --models claude-haiku-4.5
changed:
  sample moved: claude-haiku-4.5 unknown -> 0.33
```

The three entries the pre-fix quorum had probed were then re-measured, to
rule out a float that the old coercion had silently replaced with stale
v1 data:

```
refresh --models claude-sonnet-4.6,gemini-3.1-pro-preview,gpt-5.5
projected cost: 2 premium request(s) from recorded samples
no change: all 3 probed entries answered exactly as the lockfile already records; provenance re-dated.
```

They were genuine integers all along. Every sample the quorum depends on
is now measured on CLI 1.0.80 under the corrected coercion.

## 7. The quorum after the fix

```
refresh plan: scope=quorum, 3 model(s) to probe
  claude-haiku-4.5  (sample: 0.33)
  gemini-3.1-pro-preview  (sample: 1)
  gpt-5.5  (sample: 0)
projected cost: 1.33 premium request(s) from recorded samples
```

The set's acceptance criterion is written as "a plan costing **2** premium
requests", which is what it cost while the cheapest Anthropic model read
as unknown. With the fraction recorded, the quorum finds the genuinely
cheapest model of each provider and the common case costs **1.33**. The
criterion's number was derived from the samples in the file when the spec
was written; the claim it stands for — 2 rather than 39, the cheap path
cheap enough that nobody edits the file instead — is met more strongly,
not less.

