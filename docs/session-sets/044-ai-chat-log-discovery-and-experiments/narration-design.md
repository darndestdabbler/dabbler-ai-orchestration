## Narration Design — Set 044 / Session 3

> **Session:** 044 / S3. **Method:** design-first (Option 2 per
> 2026-05-22 GPT-assisted sequencing call). **Companion to:**
> [`baseline-comparison.md`](baseline-comparison.md) §5 (which
> constrains the narration scope to two signals: C3 mandatory, A3
> conditional).
> **Status when written:** post-consensus draft, **narrower than
> the pre-consensus draft**. Cross-provider consensus 2026-05-22
> (gemini-pro APPROVED with revisions, gpt-5-4 manual APPROVED with
> revisions) shrank v1: split overloaded effort axes; cut the
> `outcome` field; promoted marker-emission reliability from
> post-lock empirical question to pre-lock smoke gate. See §13 for
> the consensus journal entry.
> **Lock status:** see §10 — locked only after Copilot channel
> TBDs resolve and smoke probe confirms verbatim emission.

> **Discipline rule (from GPT call 2026-05-22):** lock the
> narration *contract* now; lock A3 as a *rule*, not as a guessed
> empirical fact. The contract is fixed regardless of what live
> A3 probing finds; only *which branch of the rule is active* is
> empirically determined.

> **Consensus-driven scope reduction (added 2026-05-22):** v1 is
> deliberately narrower than the pre-consensus draft. Specifically:
> (a) the `effort` field carries ONLY the reasoning axis values
> (`low|medium|high`); the speed axis (`fast|standard`) is
> exclusively native-sourced and never narrated, eliminating
> value-based overload; (b) the `outcome` field on `session-end`
> is removed — session outcome is captured natively via the
> `close_session` (B4) call and the state-file `status` value;
> (c) marker-emission reliability is now a lock gate, not a
> post-lock empirical question.

---

### 1. Goal and scope

Design a narration discipline that, when applied to an
orchestrator's session-start instructions (system prompt on
Copilot, `CLAUDE.md` on Claude), causes the assistant to emit a
small number of self-delimited markers into its own conversation
output. Those markers fill the two harvester signals that S2
identified as native-gap on both backends:

- **C3 — Dabbler set/session boundary.** Always emitted. The
  marker is the single source of truth for "which session of
  which set is the assistant in" — neither backend models this
  natively (`baseline-comparison.md` §1).
- **A3 — Per-turn *reasoning* effort (`low|medium|high`).**
  Conditionally emitted. The marker is the source of truth for
  the reasoning axis *only when* the active backend does not
  surface it natively. The **speed axis** (`fast|standard`) is
  NEVER narrated; it is always read from native fields when
  present (Claude's `usage.service_tier`+`usage.speed`;
  Copilot's OTel `gen_ai.request.reasoning_effort` for that
  axis if applicable).

Out of scope for narration (and explicitly EXCLUDED from v1
after consensus revisions):

- The speed axis. Narrating it would create source-of-truth
  ambiguity against native fields that already exist on at least
  one backend.
- Session outcome (`complete|stopped|cancelled`). Already
  captured natively via the B4 close_session call (which the
  state file's `status` plus `completedSessions[]` settle
  authoritatively) and the writer event in
  `~/.dabbler/orchestrator-writer.log`. Narrating it would (i)
  introduce assistant-self-report drift vs the canonical close-
  out artifacts and (ii) exceed the locked C3+A3 scope.
- Any signal already native on both backends (A1, A2, A4, A5,
  B1–B5, C1, C2, C4, C5). Narration exists to fill the gap, not
  to duplicate native signal.

Narration emits exactly **two marker types** in v1:

- `phase=session-start` (mandatory, 1x per session)
- `phase=turn` (conditional: emitted only when the active
  backend's A3 branch is "narrated" — see §6)

There is no `phase=session-end` marker in v1 (see §3.3 for
rationale and the open-interval handling rule).

---

### 2. Format — the marker token

#### 2.1 Canonical emission shape (strict)

Single token shape, identical on both backends, parseable with a
single regex:

```
[DABBLER-NARRATION v1 key=value key=value ...]
```

**Token specification (what the LLM is instructed to emit):**

- **Outer delimiters:** literal `[` and `]`. No nesting allowed.
- **Sigil:** the literal string `DABBLER-NARRATION` immediately
  after the opening bracket. Reserved name; parser uses it as the
  anchor.
- **Version:** the literal string `v1` after the sigil, separated
  by a single space. Bumped on any breaking change to the field
  set or semantics. The parser MAY skip unknown versions rather
  than mis-parse them.
- **Body:** zero-or-more `key=value` pairs separated by single
  spaces. Order is not significant. Keys are lowercase ASCII;
  values are ASCII without spaces (use kebab-case for multi-word
  values).
- **No quoting** in the canonical emission. Values that would
  contain a space, `[`, `]`, or `=` are reformatted to remove
  them.
- **Verbatim** — the LLM emits the marker line *exactly* as
  instructed, with no extra whitespace inside the brackets, no
  surrounding code fences, no paraphrase.

#### 2.2 Parser tolerance (lenient)

The parser hardens against expected LLM output variation, even
though canonical emission is strict. The parser MUST accept:

- **Optional whitespace around `=`:** the body token regex
  matches `key\s*=\s*value`. (Source: gemini-pro consensus
  2026-05-22.)
- **Optional quote characters around values:** straight quotes
  (`"`, `'`) and curly quotes (`"`, `"`, `'`, `'`) are stripped
  before value extraction.
- **Case-insensitive keys:** `Phase=session-start` is treated
  as `phase=session-start`. Values remain case-sensitive (the
  enums in §4 use lowercase).
- **Trailing punctuation outside brackets:** a period or
  comma after `]` does not affect matching.

#### 2.3 Parser regex (anchored single-line)

```
\[DABBLER-NARRATION\s+v(?P<ver>\d+)(?P<body>(?:\s+[A-Za-z][A-Za-z0-9_-]*\s*=\s*["'""'']?[A-Za-z0-9_./-]+["'""'']?)*)\s*\]
```

The `body` capture is split on whitespace into `key=value`
pairs, each pair is normalized (lowercased key, stripped quotes,
trimmed whitespace), and emitted as a dict. Versions other than 1
cause the event to be passed through with `skipped=true` and an
unparsed body.

#### 2.4 Rationale for this shape over alternatives

| Alternative | Rejected because |
|---|---|
| Free-form English ("Starting Set 044 Session 3") | High parser ambiguity; LLM phrasing drifts (`Beginning`, `Starting up`, `Now in`) |
| JSON line (`{"narrator":"dabbler","set":"044",...}`) | LLMs frequently emit malformed JSON in conversational text (trailing commas, missing braces); also visually noisy for the operator reading the transcript |
| YAML / TOML stanza | Multi-line; doesn't survive being inlined in a paragraph |
| HTML/XML tag (`<dabbler-narration .../>`) | Plausible but visually heavier; bracketed key=value is more shell-like and self-documenting |

The bracketed sigil+kvp token is the simplest shape that is
**unambiguous to a regex** and **survives unchanged when an LLM
copies it verbatim from instructions** — both essential.

---

### 3. Placement — when the assistant emits the marker

#### 3.1 `phase=session-start` — mandatory, exactly once per session

The marker MUST appear as the assistant's first text output in
the first turn of the session, before any tool call, on a line
by itself. This pins the session boundary to the first turn's
timestamp so the parser can establish "session N of set S began
at T". If the assistant prepends conversational scaffolding
before the marker, the parser still finds it via the regex, but
the surrounding text may bias readers — the instruction reads
"first line of your first response."

Emit count: **1 per session**.

#### 3.2 `phase=turn` — conditional, per-turn

Active ONLY when the A3 conditional branch is "narration emits
A3" (see §6). When active, the assistant MUST emit one marker
at the start of each of its assistant-turns *after* the first.
(The first turn already carries `phase=session-start`, which
also includes the effort field — see §4.)

Emit count when active: **N–1 markers across N turns** (the
`session-start` marker covers turn 1).

Emit count when inactive: **0**.

#### 3.3 No `session-end` marker in v1 (open-interval handling)

The pre-consensus draft included a `phase=session-end` marker
to bracket the session end. Removed in v1 per consensus:

- Session end is already captured natively via B4
  (`Bash tool_use` containing `close_session` invocation) and
  via the state-file `status` value plus the
  `~/.dabbler/orchestrator-writer.log` writer event.
- A self-reported `outcome=complete|stopped|cancelled` field
  would introduce assistant-vs-canonical drift risk for a
  signal already authoritatively captured elsewhere.

**Open-interval rule (per GPT consensus 2026-05-22):** if the
parser sees a `session-start` marker but no subsequent same-
session terminator (no `close_session` Bash tool_use, no
state-file transition to `complete|cancelled`, no fresh
`session-start` for the same set), the session is treated as an
**open interval** still-in-progress or crashed. The session is
NOT malformed; the consumer simply has no end timestamp yet.

#### 3.4 Rationale for this placement scheme

- The C3 minimum is one marker per session (start). That is the
  cheapest narration that fills the C3 signal with high
  confidence: every conversation has clear bracketing on at
  least one side, and the closing side is captured natively.
- Per-turn emit is reserved for A3 to avoid bloating the log
  surface unnecessarily. If A3 is native, the parser uses the
  native field and narration stays bracket-only.
- Pre-tool-call vs post-tool-call placement is *not* part of
  the contract: the marker is emitted in the assistant's text
  output, which is itself the parent of subsequent tool calls
  in the native log. The parser does not need pre/post
  distinction because tool-call ordering is already
  reconstructable from native data (C5 native on both backends).

---

### 4. Content discipline — what fields go in the marker

#### 4.1 `phase=session-start` marker

Required keys (parser will warn if any are missing):

| Key | Value shape | Example | Source |
|---|---|---|---|
| `phase` | literal `session-start` | `phase=session-start` | constant |
| `set` | session-set slug (kebab-case) | `set=044-ai-chat-log-discovery-and-experiments` | spec |
| `session` | session number (integer) | `session=3` | spec |
| `total` | total sessions in set (integer) | `total=6` | spec |

Optional key (active only under the A3 conditional branch — §6):

| Key | Value shape | Example |
|---|---|---|
| `effort` | one of: `low`, `medium`, `high` | `effort=high` |

**The `effort` value MUST be drawn ONLY from the reasoning-axis
set `{low, medium, high}`.** Values `fast` and `standard` are
the speed axis and are EXCLUDED from the narrated value space.
The parser rejects `effort=fast` and `effort=standard` as
unknown-enum (see §5.5).

Full example (A3-branch-inactive):

```
[DABBLER-NARRATION v1 phase=session-start set=044-ai-chat-log-discovery-and-experiments session=3 total=6]
```

Full example (A3-branch-active):

```
[DABBLER-NARRATION v1 phase=session-start set=044-ai-chat-log-discovery-and-experiments session=3 total=6 effort=high]
```

#### 4.2 `phase=turn` marker (when A3 narration is active)

Required keys:

| Key | Value shape | Example |
|---|---|---|
| `phase` | literal `turn` | `phase=turn` |
| `set` | session-set slug | `set=044-ai-chat-log-discovery-and-experiments` |
| `session` | session number | `session=3` |
| `effort` | one of: `low`, `medium`, `high` | `effort=high` |

The `set` and `session` keys appear on per-turn markers too —
defensively redundant, so a parser that misses the
`session-start` marker can still establish set+session from any
per-turn marker.

Full example:

```
[DABBLER-NARRATION v1 phase=turn set=044-ai-chat-log-discovery-and-experiments session=3 effort=high]
```

#### 4.3 Fields explicitly NOT in any v1 marker

The marker does NOT carry: engine, provider, model, conversation
id, file paths, tool names, timestamps, **speed-axis effort
values (`fast`/`standard`)**, and **session outcome**. All of
these are native on the surrounding event or are
authoritatively captured by other artifacts. Including them in
the marker would (a) duplicate native signal and (b) introduce
drift risk (assistant's self-report vs. native log's record can
diverge).

#### 4.4 Placeholder-leakage prohibition

The instruction template in §7 uses uppercase placeholders
(`SET-SLUG`, `SESSION-NUMBER`, `TOTAL-SESSIONS`,
`EFFORT-LEVEL`) that the assistant MUST substitute with the
actual concrete values before emission. The parser (§5.5)
**rejects** any marker where these literal placeholder strings
appear in value positions — that pattern signals the assistant
copied the instruction text verbatim without substitution,
which is a semantic failure even though the marker is
syntactically valid.

---

### 5. Parser contract

The harvester parser (S5 design, S6 implementation if scoped in
this set) MUST implement the following contract.

#### 5.1 Input shape

Per backend, the parser sees a stream of (turn_text,
turn_context) tuples, where `turn_context` is the join key set:

- Copilot: `(turn_text, {session_id, turn_index, timestamp,
  cwd, host_type})` from `session-store.db turns` + `sessions`
  join.
- Claude: `(turn_text, {sessionId, message.model, timestamp,
  uuid, cwd_from_session-env})` from `~/.claude/projects/<slug>
  /<conv-uuid>.jsonl` assistant events.

#### 5.2 Output shape (per matched marker)

```python
{
  "marker_version": int,          # from regex ver group
  "phase": str,                   # "session-start" | "turn"
  "set": str,                     # session-set slug
  "session": int,                 # session number
  "total": int | None,            # only on session-start
  "effort_reasoning": str | None, # one of "low"|"medium"|"high" iff A3 branch active
  "turn_context": dict,           # native join keys (above)
  "raw": str,                     # the literal marker text matched
  # Diagnostic flags (mutually exclusive with successful parse):
  "skipped": bool,                # unknown marker_version
  "incomplete": bool,             # missing required field
  "parse_error": bool,            # malformed body
  "semantic_error": str | None,   # placeholder-leakage / domain-check failure; see §5.5
}
```

Note: `effort_reasoning` (not just `effort`) makes it
unambiguous that this field carries the reasoning axis only.
The composed effort signal downstream (combining native speed
+ either native or narrated reasoning) is *not* a parser
output; that composition happens in the harvester after the
parser emits records.

#### 5.3 Behavior

- **Multiple matches per turn:** all are emitted in order of
  appearance in the turn text. Practical case: a `phase=turn`
  marker followed later by an inline retransmission. Parser
  emits both records; downstream dedups by `(set, session,
  phase, turn_context.turn_index)`.
- **Unknown version:** emit with `skipped=true`, do not
  attempt field extraction.
- **Missing required field:** emit with `incomplete=true` and
  whatever fields parsed. Downstream may decide to drop.
- **Malformed body (no `=` in a token):** emit with
  `parse_error=true`.
- **Marker outside expected `phase` placement** (e.g.,
  `session-start` on turn 5): emit as normal; the parser does
  not enforce placement.

#### 5.4 Identical parser, two backends

Because the marker shape is identical, **one parser function
handles both backends**. The only backend-specific code is the
`turn_context` construction (how to join native fields). This
is the design goal of "one parser to two backends" from
baseline-comparison.md §1. The single-parser claim is
honest: the regex, normalization, validation, and output-shape
construction are all backend-agnostic; only the **input adapter
that builds `(turn_text, turn_context)` tuples from native
artifacts** is per-backend.

#### 5.5 Semantic validation (post-syntactic)

After a marker matches the §2.3 regex and the key/value pairs
are normalized, the parser applies these domain checks. Any
failure sets `semantic_error` to a short tag and `incomplete`
remains false (the marker IS validly shaped, but semantically
wrong).

| Tag | Trigger |
|---|---|
| `placeholder-leakage` | Any value literally equals `SET-SLUG`, `SESSION-NUMBER`, `TOTAL-SESSIONS`, or `EFFORT-LEVEL` |
| `unknown-phase` | `phase` value is not `session-start` or `turn` |
| `unknown-effort-enum` | `effort` value is present and is not one of `low`, `medium`, `high` |
| `session-exceeds-total` | `session > total` when both are integers |
| `non-integer-session` | `session` cannot be parsed as a positive integer |
| `non-integer-total` | `total` cannot be parsed as a positive integer |

These checks catch the GPT-consensus class of "syntactically
valid but semantically bogus" markers. A failure does NOT
abort parsing — the record is emitted with `semantic_error`
set, and the harvester downstream decides whether to drop or
quarantine.

#### 5.6 Open-interval session handling

Per §3.3, the absence of a `session-end` marker is NOT an
error. The harvester reconciles session boundaries by
combining `session-start` markers with native session-end
signals (B4 `close_session` call, state-file `status` write,
or absence of further activity for >N minutes — N is a
harvester-config parameter, not a contract parameter).

---

### 6. A3 conditional branch — the rule

GPT's refinement (2026-05-22): "Make A3 a predeclared
conditional branch: if native logs expose reliable per-turn
effort, the parser uses native A3 and narration omits it; if
not, narration emits the locked A3 marker." Consensus revision
(2026-05-22): the **reasoning** axis is what narration
conditionally fills; the **speed** axis is *always* native and
never narrated.

The contract is fixed regardless of empirical outcome; only one
of these two paths is *active* per backend per harvester run:

#### 6.1 Two semantic axes, treated separately

Effort decomposes into two axes:

- **Reasoning axis:** values `low|medium|high`. The signal
  the operator's accordion gauges care about. Currently
  absent natively on both backends (Claude: S2 empirical, 10
  `usage` fields enumerated, no reasoning field; Copilot:
  TBD pending S3 live runs).
- **Speed axis:** values `fast|standard`. Native on Claude
  via `usage.service_tier`+`usage.speed`; possibly native on
  Copilot via OTel `gen_ai.request.reasoning_effort` for that
  axis (TBD). **Never narrated under any circumstance** — if
  the speed axis is not native on a backend, downstream
  records it as `null` and the harvester proceeds without it.

The harvester composes the two axes downstream of the parser
into whatever shape the consumer wants (e.g.,
`effort: {"reasoning": "high", "speed": "standard"}` or a
flattened string). The parser itself only emits
`effort_reasoning` from the marker.

#### 6.2 Branch A — Native reasoning A3 path

**Active when:** the backend natively logs a per-turn reasoning-
effort field that distinguishes high/medium/low. Examples:

- Future Anthropic API addition exposing reasoning_effort in
  `assistant.message.usage` or `stop_details`. Currently
  absent.
- Future Copilot OTel addition exposing reasoning_effort
  separately from the speed axis. Currently TBD.

**Parser behavior:** read reasoning-axis effort from the
native field; ignore the marker's `effort` key if present.

**Narration behavior:** `effort` key is OMITTED from
`session-start` markers; `phase=turn` markers are NOT emitted.

#### 6.3 Branch B — Narrated reasoning A3 path

**Active when:** native reasoning-axis effort is absent or
unreliable on this backend. (Default on both Claude and
Copilot at S3 close — re-evaluate per backend at each S5
proposal revision.)

**Parser behavior:** read reasoning-axis effort from the
marker's `effort` key on `session-start` and `phase=turn`
markers; ignore any native field for high/medium/low purposes.

**Narration behavior:** `effort` key is INCLUDED on
`session-start` markers; `phase=turn` markers ARE emitted once
per turn after the first. Values restricted to
`low|medium|high`.

#### 6.4 Branch selection

Per backend, the harvester maintains a configuration flag (e.g.,
`a3_reasoning_source: native | narrated`). The flag is set
based on:

- S3 live-run findings for Copilot.
- S2 empirical resolution for Claude (current value:
  `narrated` for the reasoning axis).

The flag is configuration, not code-conditional. The marker
contract and parser code do not change between branches; only
which fields are produced and which fields are read.

#### 6.5 Why this is simpler than the pre-consensus draft

The pre-consensus draft overloaded the single `effort` field
with both axes and used value inspection to resolve precedence
(`if effort=fast|standard, native wins; if effort=low|medium|high,
narration wins`). gpt-5-4 consensus 2026-05-22 called this "the
biggest design bug" — it makes the parser's one-function-two-
backends claim *value-dependent* rather than backend-dependent,
and a narration producer that emits `effort=fast` accidentally
crosses an axis it has no authority to speak about. The v1
revision keeps each axis on its own dedicated signal source:

- Reasoning axis: narrated under Branch B, native under
  Branch A. Never both at once.
- Speed axis: always native. Never narrated.

No value-based precedence. The downstream composition step
just joins on whichever axis-source the configuration flag
nominates.

---

### 7. Per-backend application — where the instruction lives

#### 7.1 Copilot CLI 1.0.51

Narration instruction delivery channel: Copilot's system-prompt /
custom-instructions surface in the scratch workspace. The exact
file location and config key is one of the empirical S3 live-run
deliverables; candidates (per Copilot 1.0.51 docs review):

- `~/.copilot/config.json` — currently used for first-launch +
  experiment cache; does NOT appear to be the system-prompt
  surface.
- Workspace-scoped `.copilot/` config or `copilot.md` in the
  workspace root — TBD (verify in S3 against Copilot 1.0.51).
- `COPILOT_SYSTEM_PROMPT` env var if it exists — TBD.

**Channel-length contingency (per gemini-pro consensus
2026-05-22):** the full instruction text below is
approximately 1100 characters when concrete values are
substituted. If the identified Copilot channel imposes a length
constraint shorter than that, the compact form in §7.4
substitutes.

The full instruction text (to be inserted at whichever location
S3 identifies):

```
At the start of every session, your VERY FIRST text output
must be the marker line below, on a line by itself, before any
tool call. Replace SET-SLUG, SESSION-NUMBER, TOTAL-SESSIONS,
and EFFORT-LEVEL with the actual concrete values; omit `effort`
entirely if your backend logs reasoning effort natively.

[DABBLER-NARRATION v1 phase=session-start set=SET-SLUG session=SESSION-NUMBER total=TOTAL-SESSIONS effort=EFFORT-LEVEL]

The key=value pairs MUST NOT be quoted. The marker MUST appear
verbatim on its own line. Do not paraphrase, translate, or
reformat it. Do not wrap it in a code fence. EFFORT-LEVEL is
one of low, medium, or high (the reasoning axis); never fast
or standard.

If A3 reasoning-effort narration is active for this backend
(your harvester operator will tell you), also emit a per-turn
marker as the first line of every subsequent assistant
response:

[DABBLER-NARRATION v1 phase=turn set=SET-SLUG session=SESSION-NUMBER effort=EFFORT-LEVEL]

There is NO session-end marker; the harvester reconciles
session boundaries from native close_session calls and state
files.
```

#### 7.2 Claude Code 2.1.63

Narration instruction delivery channel: a scratch `CLAUDE.md`
in the synthetic-set workspace. Operator's real `CLAUDE.md`
(the canonical project instruction file) is NOT modified; the
scratch workspace under `c:\tmp\dabbler-log-harvest\synthetic-set\`
gets its own.

Same instruction text as §7.1.

Optional second delivery channel: a `SessionStart` hook that
writes the marker into the assistant's incoming context. This
is a *backend-native* delivery mechanism but it does NOT
appear in the assistant's OWN output — it appears as a user-
message in the JSONL. The parser would have to also look at
user-message text, doubling the search surface. **Skipped for
now**: the instruction-driven channel is simpler and parser-
identical across backends.

#### 7.3 Why not a hook on Copilot

Copilot CLI does not document a Dabbler-equivalent hook event
(`baseline-comparison.md` §3.2.4). The instruction-driven
channel is the only available path on Copilot. Designing the
contract to require a hook would break the "identical on both
backends" property.

#### 7.4 Compact instruction contingency

If the Copilot channel identified in S3 live runs imposes a
length constraint, the compact form:

```
First text out (no code fence, verbatim, own line):
[DABBLER-NARRATION v1 phase=session-start set=SET-SLUG session=SESSION-NUMBER total=TOTAL-SESSIONS effort=EFFORT-LEVEL]
EFFORT-LEVEL is low|medium|high or omit. If turn-narration is
on, prepend each later turn with [DABBLER-NARRATION v1
phase=turn set=SET-SLUG session=SESSION-NUMBER effort=EFFORT-LEVEL].
No session-end marker.
```

(~400 characters when concrete.) The smoke probe (§10.1) is
run against whichever form S3 commits to.

#### 7.5 Parameterization (how concrete values get injected)

The instruction templates above are *prose templates*, not
running code. For each backend run, the orchestrator (the
human or the Dabbler extension) must substitute concrete
values for `SET-SLUG`, `SESSION-NUMBER`, `TOTAL-SESSIONS`, and
`EFFORT-LEVEL` before placing the instruction text into the
chosen channel. Substitution mechanism candidates:

1. **Per-run manual editing** of the instruction text in the
   chosen Copilot / Claude config file. Cheapest for the S3
   experiment, least scalable.
2. **Operator-side build step** that reads from the active
   session-set's `session-state.json` and writes the
   substituted instruction text into the channel file.
   Scalable but requires implementation.
3. **Per-session-set wrapper** that the extension generates
   when the operator picks "use this set" — the wrapper is
   pre-substituted and dropped into the workspace's chosen
   Copilot channel. Future work, post-S6.

**v1 commitment:** S3 uses mechanism (1) for the live runs.
Mechanism (2) or (3) is a Set 045 follow-on if the proposal in
S5 calls for it. The contract does not depend on which
mechanism is chosen; the parser's placeholder-leakage check
(§5.5) catches failures of mechanism (1) where the operator
forgot to substitute.

---

### 8. Comparability checklist — "only the narration changes"

The S3 (Copilot) and S4 (Claude) narrated runs must each be
measured against the matching baseline with *only the narration
layer differing*. Per GPT's call (2026-05-22): "Keep the task
battery, workspace, capture settings, and measurement method
otherwise identical."

#### 8.1 Held constant between baseline and narrated runs

- [ ] Same Copilot CLI / Claude Code version
- [ ] Same scratch workspace path (`c:\tmp\dabbler-log-harvest\synthetic-set\`)
- [ ] Same task battery (the exact same set of prompts /
      operations driven against the synthetic set)
- [ ] Same `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`
      setting (Copilot — default off both runs unless
      explicitly flipped for both)
- [ ] Same harvest method (which artifacts are read, in what
      order, with what scrub rules)
- [ ] Same measurement metric ("per-harvest-objective signal
      coverage, baseline vs. narrated; reported as
      objective→{native, narrated, both, neither}")
- [ ] Same **tool-permission / approval mode** (per gpt-5-4
      consensus 2026-05-22 — both Copilot and Claude expose
      auto-approve vs. interactive modes that materially affect
      tool-call patterns)
- [ ] Same **explicit effort setting** (e.g., always
      `--effort medium`; per gpt-5-4 consensus — the experiment
      cannot vary effort across baseline and narrated runs)

#### 8.2 What DOES change between baseline and narrated

- Presence/absence of the narration instruction in the
  delivery channel (system prompt or CLAUDE.md scratch file)

#### 8.3 Acknowledged confounds (cannot be controlled away)

The narration instruction itself has measurement side-effects
that cannot be eliminated:

- **Prompt-token-count delta.** The narration instruction adds
  ~400-1100 chars (depending on full vs compact form) to the
  initial system context. This is a non-trivial input-size
  difference. Per gemini-pro + gpt-5-4 consensus 2026-05-22,
  this is acknowledged as **part of the treatment** (the cost
  of narration), not controlled away.
- **Compliance behavior.** The narration instruction may
  influence the assistant's overall behavior in ways unrelated
  to marker emission (e.g., more formal output style, slightly
  different tool-call discipline). Observable in turn
  segmentation; will be flagged in §11 results if observed.
- **Turn segmentation.** The marker emission itself adds a
  conversational beat at the session boundary that the
  baseline does not have. The first turn in a narrated run is
  technically a different shape than in the baseline run.

The S3 results document
([`copilot-narration-results.md`](copilot-narration-results.md))
must explicitly call out any observed manifestation of these
confounds; the headline "narration delta" finding is reported
as a single number that excludes their influence where
possible, and a separate "confound notes" section reports
where they cannot be excluded.

---

### 9. Lock criteria

The design is **locked** when all of the following are true:

- [x] **Cross-provider consensus** complete (gemini-pro 2026-05-22
      via ai_router; gpt-5-4 2026-05-22 manual). Both
      `APPROVED with REVISIONS`. Convergent revisions applied
      in §1 (scope reduction), §2.2/§2.3 (parser tolerance), §3.3
      (open-interval rule), §4.4 (placeholder-leakage), §5.5
      (semantic validation), §6 (axis-based A3), §7.4 (compact
      contingency), §7.5 (parameterization), §8.3 (confounds
      acknowledged), and §10 (smoke probe).
- [ ] **Copilot channel TBDs resolved** — §7.1 candidates
      enumerated in S3 live runs; one channel selected.
- [ ] **Smoke probe passes** — see §10.1.
- [ ] **Operator review** of this post-consensus draft complete;
      any further changes folded.

Once locked, this document is the contract that S3 (Copilot
narrated runs) and S4 (Claude narrated runs) measure against.
Changes after lock require re-versioning the marker (v1 → v2)
and re-running both baselines, which is a Set 045+ proposition,
not an S3/S4 fix.

---

### 10. Pre-lock smoke probe (consensus addition 2026-05-22)

Per gpt-5-4 consensus: "Make marker-emission reliability a lock
gate, not a post-lock empirical question." The smoke probe
validates that the chosen channel can deliver the instruction,
the LLM emits a verbatim marker in response, and the parser
matches the emission.

#### 10.1 Probe protocol

1. **Pick the Copilot channel** — from §7.1 candidates,
   identify whichever Copilot 1.0.51 actually offers as a
   system-prompt / custom-instructions surface.
2. **Insert the instruction text** — use the full form (§7.1)
   substituted with: `set=044-ai-chat-log-discovery-and-experiments`,
   `session=3`, `total=6`, no `effort` (Branch A simulated).
3. **Drive one Copilot turn** — a single trivial prompt
   against the synthetic set (e.g., "What files exist in this
   directory?"). The first text output should contain the
   marker.
4. **Verify emission:**
   - Open `~/.copilot/session-store.db`. Read
     `turns.assistant_response` for the new turn.
   - Apply the §2.3 parser regex.
   - Check that the matched marker contains the literal
     substituted values (no leakage; no paraphrase; no code
     fence).
5. **Decision:**
   - **Pass:** all four checks pass. Set 9's "smoke probe
     passes" check; lock the design.
   - **Fail (marker absent or paraphrased):** iterate on the
     instruction text — try compact form (§7.4), then try
     other channels from §7.1. If three iterations fail, the
     marker-format assumption is broken; surface to operator
     before locking.
   - **Fail (placeholder leakage):** §5.5 catches it.
     Operator-side mechanism (§7.5) was applied wrong; not a
     contract failure, just a substitution failure. Re-run
     with corrected substitution.

#### 10.2 Probe budget

One Copilot turn against the synthetic set. No router calls.
Cost: zero (operator-side; uses operator's local Copilot
auth). Time: < 5 minutes.

#### 10.3 Probe artifacts

Probe result written to
`copilot-narration-results.md` §1 (Probe summary) as the first
content in that file, before baseline / narrated comparison
sections.

---

### 11. Open empirical questions (carried to S3 live runs)

These do NOT block the lock except where called out as
lock-gate (Q1-Q2).

1. (LOCK GATE) What is the Copilot 1.0.51 system-prompt /
   custom-instructions delivery channel? Sets §7.1 instruction
   location.
2. (LOCK GATE) Does the LLM reliably emit the marker verbatim
   when given the §7 instruction text via the chosen channel?
   Validated via §10 smoke probe.
3. Does Copilot's OTel carry `gen_ai.request.reasoning_effort`
   for the reasoning axis when `--effort high`? Sets §6
   branch for Copilot.
4. Does the parameterization mechanism (§7.5 v1: per-run
   manual editing) prove robust across multiple Copilot
   sessions in the live runs, or does manual substitution
   error rate suggest the §7.5 mechanism (2) build step is
   needed before S3 closes?

---

### 12. Lock status

- [x] §1 goal and scope — drafted (post-consensus, narrower)
- [x] §2 format token — canonical strict + parser tolerant
- [x] §3 placement — start + per-turn-when-A3 only (no end)
- [x] §4 content discipline — fields enumerated, placeholder-
      leakage prohibition added
- [x] §5 parser contract — input, output, behavior, semantic
      validation
- [x] §6 A3 conditional branch — axis-based rule, no value
      overloading
- [x] §7 per-backend application — Copilot full + compact +
      parameterization
- [x] §8 comparability checklist — held-constant + acknowledged
      confounds
- [x] §9 lock criteria — listed (4 items, 1 done)
- [x] §10 pre-lock smoke probe — protocol drafted
- [x] §11 open empirical questions — promoted Q1+Q2 to
      lock-gate
- [ ] Copilot channel TBDs resolved — pending S3 live runs
- [ ] Smoke probe completed — pending S3 live runs
- [ ] Final operator approval — pending

---

### 13. Consensus journal (2026-05-22)

| Provider | Verdict | Must-fix count | Applied? |
|---|---|---|---|
| gemini-pro | APPROVED with REVISIONS | 5 | All 5 applied (parser tolerance §2.2; axis-based A3 §6.4-§6.5; outcome cut §1+§3.3; prompt-token confound §8.3; channel-length contingency §7.4) |
| gpt-5-4 | APPROVED with REVISIONS | 5 | All 5 applied (effort de-overload §6 entire; outcome cut §1+§3.3; smoke probe as lock gate §10; parameterization §7.5; comparability confounds §8 entire) |

**Convergent must-fixes (both providers):** effort field
de-overload (highest priority both verdicts); `outcome` cut;
comparability confound acknowledgement.

**Single-provider must-fixes:** gemini-pro flagged parser
regex hardening for whitespace/quotes/case (applied §2.2);
gpt-5-4 flagged pre-lock smoke probe + parameterization
mechanism (applied §10 + §7.5).

**Nice-to-haves applied:** parser-side domain checks (§5.5);
open-interval session handling (§3.3).

**Net effect:** v1 is narrower than the pre-consensus draft (no
outcome field, no speed-axis narration, no value-based
precedence), more defensive (semantic validation, placeholder-
leakage detection, parser tolerance), and pre-lock-validated
(smoke probe required before lock).
