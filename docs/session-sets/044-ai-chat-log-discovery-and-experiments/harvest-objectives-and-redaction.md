## Harvest Objectives and Redaction Discipline

> **Purpose:** lock the *what* and the *what stays out* of Sets 044's
> log-harvest experiments before any logs are read deeply.
> **Owner:** Session 1.
> **Frozen by:** Session 1 close-out. Refinements allowed in S2 (Claude-
> specific risks) per spec; new objectives must be added explicitly and
> are out-of-scope for S3-S4 retro-fit.

---

### Part 1: Harvest Objectives

The Sets 037-041 launch-adapter design assumed we'd write logs from
*outside* the assistant. Set 044's hypothesis is that the assistants
already write log files at well-known locations and we can *read* them.
Whether that hypothesis holds depends on which of the following signals
the native logs surface natively, with narration, or not at all.

**A. Identity signals** (who/what is acting)

| # | Signal | Why it matters | Native? (S1 hypothesis) |
|---|---|---|---|
| A1 | Orchestrator engine name (`claude`, `copilot`, `codex`, `gemini`) | check-out identity | likely native |
| A2 | Orchestrator model id (`claude-opus-4-7`, `gpt-4.1`, ...) | matches `session-state.json` writer | likely native, may need narration to per-turn precision |
| A3 | Orchestrator effort/reasoning level (`high`, `medium`, `low`, `fast`) | matches `session-state.json` writer | uncertain — may be implicit per process invocation only |
| A4 | Orchestrator provider (`anthropic`, `openai`, `google`, `github`) | matches `session-state.json` writer | likely native |
| A5 | Conversation / session ID assigned by the assistant | dedupe across log chunks; cross-correlate with `session-state.json` checkOut block | likely native (transcripts are per-conversation) |

**B. Action signals** (what is being done)

| # | Signal | Why it matters | Native? (S1 hypothesis) |
|---|---|---|---|
| B1 | Tool calls (name + arguments) | which files are being read/written | likely native |
| B2 | Tool calls touching `docs/session-sets/**` paths | scoped subset of B1; primary conflict-detection signal | derivable from B1 by path filter |
| B3 | Tool calls touching `session-state.json` specifically | sole-truth boundary | derivable from B1 by path filter |
| B4 | Subprocess invocations of `python -m ai_router.start_session` / `close_session` | the canonical writer path | derivable from B1 (Bash/shell tool call) |
| B5 | File-write events that bypass the writer | rule-violation signal | likely **native gap** — narration required (the assistant must announce its intent) |

**C. Boundary signals** (when one chunk of work ends and another begins)

| # | Signal | Why it matters | Native? (S1 hypothesis) |
|---|---|---|---|
| C1 | Per-turn timestamp | cross-agent conflict correlation foundation | likely native |
| C2 | Conversation start/end timestamp | bracket the whole interaction | likely native |
| C3 | "Starting Set N Session M" boundary marker | makes log -> set/session mapping unambiguous | likely **native gap** — narration required |
| C4 | "Calling start_session" / "calling close_session" boundary marker | makes lifecycle transitions explicit | derivable from B4 if narration is unnecessary |
| C5 | Pre-tool-call intent vs. post-tool-call result distinction | catches the "tried to write directly" case (B5) before the write happens | likely **native gap** — narration required |

**D. Conflict-detection requirements** (what conflict-detection actually needs from above)

The minimum-viable triple a watcher must see to detect "two orchestrators
in the same set at once" is:
- C1 timestamp +
- A1+A4 engine+provider (to compare to the `session-state.json`
  check-out block) +
- C3 set/session id (to scope the check)

If C3 is a native gap and narration is the only way to surface it, the
narration experiment in S3-S4 becomes the deciding factor for whether
the proposal in S5 is viable at all.

**Out of scope for S1-S2 harvest (may be added if S5 needs them):**
- Token counts, latency, cost-per-turn (already covered by router metrics).
- Embedding vectors, model-internal state.
- Prompt content (deliberately redacted per Part 2; we want the
  envelope, not the payload).

---

### Part 2: Redaction Discipline

The harvested logs may contain:
- User prompts (potentially containing operator messages, secrets,
  business context).
- File contents read by the assistant (potentially containing source
  code, credentials, customer data).
- Authentication tokens (the assistants' OAuth tokens, refresh tokens,
  upstream API keys).
- Repository paths and machine-local paths revealing operator's
  environment.

**Rule: nothing harvested is committed to this repo verbatim.** Only
*characterizations* — schemas, field names, field-type/size summaries,
counts, and synthesized examples — appear in `discovery-notes-*.md`.

**Two-tier storage:**

| Tier | Path | Purpose | Committed? |
|---|---|---|---|
| Scratch | `C:\tmp\dabbler-log-harvest\` (per spec suggestion; matches the existing `C:\tmp` additional working directory) | raw harvested log copies, transcripts, sqlite dumps; per-experiment subdirs (`s1-baseline-copilot/`, `s2-baseline-claude/`, `s3-narration-copilot/`, `s4-narration-claude/`) | **no** (machine-local) |
| Repo (synthesis layer) | `docs/session-sets/044-.../discovery-notes-*.md`, `baseline-comparison.md`, `cross-backend-synthesis.md`, `proposal.md` | derived summaries safe for git history | **yes** |

The scratch path is added to `.gitignore` as a belt-and-suspenders even
though it's outside the repo, so that any accidental symlink or
relocation can't leak.

**Synthetic test material:**

The "representative sessions" used in S1/S3 harvest runs operate
against a **synthetic session set**, not real Dabbler work. The
synthetic set lives at `C:\tmp\dabbler-log-harvest\synthetic-set\`
(scratch) and contains:
- a minimal `spec.md` with 2 fake sessions
- a fresh `session-state.json` at `not-started`
- no real code, no real prompts, no operator history

This isolates the harvest experiments from real session-set state
(can't accidentally check out the live orchestrator into a real set
during a test run) and from real operator content (logs harvested from
the synthetic set contain only test scaffolding text).

**Scrub rules before any harvested fragment enters a discovery-note
markdown file:**

1. **Verbatim user prompts** — never copied. Paraphrase as
   `<paraphrased prompt: "asked assistant to summarize spec.md">`.
2. **Verbatim assistant turns** — copied only when they are the
   synthetic-set test prompts (already operator-authored test
   scaffolding, no sensitive content). Mark with `<synthetic-prompt>`
   for clarity. Production assistant turns are paraphrased the same
   way as prompts.
3. **File contents read by the assistant** — never copied. Substitute
   `<file content elided: <repo>/<file> (<N> bytes)>`.
4. **Bearer tokens / API keys / auth-header values** — never copied.
   Substitute `<TOKEN_ELIDED>` and note which field elided it.
5. **Operator-local paths** — the `C:\Users\denmi\` prefix is
   substituted with `~` in any path that appears in commits. The
   `denmi` username should not appear in any committed text.
6. **Repository names that aren't part of the Dabbler public footprint**
   — substitute placeholder like `<consumer-repo>`. Public repo
   names (`dabbler-ai-orchestration`, `dabbler-access-harvester`,
   `dabbler-platform`, `dabbler-homehealthcare-accessdb`) are fine
   verbatim.
7. **Email addresses, real names of third parties** — substitute
   placeholders.

**Reading-side discipline (inside the AI assistant doing the harvest
work):**

When inventorying log files in scratch, the assistant should:
- Prefer `wc -l`, `head -c 200` (truncated), `jq 'keys'`, `sqlite3
  .schema` operations that surface structure without dumping content.
- When dumping a sample line is necessary, dump exactly one line and
  scrub it inline before pasting into a discovery note.
- Never `cat` an entire log file into the conversation context.

**Auditability:** every harvested file referenced in a discovery note
lists its scratch-path origin, byte count at harvest time, and a
one-line schema description — so a reader can reconstruct what was
inspected without the content being committed.

---

### Part 3: Inventory Methodology (for S1 step 3 and S2 step 1)

For each backend (Copilot in S1, Claude Code in S2), produce a table
with one row per artifact in the log surface:

| Column | Definition |
|---|---|
| Artifact | Path (relative to backend's home dir) |
| Format | JSON / JSONL / SQLite / plain text / binary |
| Trigger | When the file gets written (process start, per-turn, per-tool-call, OTel export, etc.) |
| Per-process or shared? | One file per assistant process invocation, or one shared rolling file? |
| Schema (top-level shape) | One-line description; no payloads |
| Surfaces signals... | Cross-reference to A/B/C/D objective IDs above (e.g., "A1, A2, C1") |
| Redaction risk | High / Medium / Low — what kinds of sensitive content the file is known/expected to hold |
| Sample size at probe time | Bytes (or row count for SQLite) — establishes the baseline |

This table is the deliverable artifact at the end of each backend's
discovery session.

---

### Lock status

- [x] Part 1 (objectives) — locked
- [x] Part 2 (redaction discipline) — locked
- [x] Part 3 (inventory methodology) — locked

Refinement window: Session 2 (Claude-specific risks). Past that, new
harvest objectives require an explicit spec addendum.
