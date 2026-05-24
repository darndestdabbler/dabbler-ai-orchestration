# Cross-repo CLAUDE.md notice — orchestrator check-out / check-in

**Authored:** 2026-05-21 (Set 033 Session 6 — base composite)
**Updated:** 2026-05-23 (Set 036 Session 5 — chatSessionId refinement
+ `new_chat_id` CLI + takeover UX)
**Audience:** consumer-repo CLAUDE.md authors (dabbler-platform,
dabbler-access-harvester, dabbler-homehealthcare-accessdb).

## Purpose

This is a one-time copy source. Paste the body below into each
consumer repo's top-level `CLAUDE.md` so its in-repo orchestrators
discover the check-out / check-in model the next time they read
their instruction file. The dabbler-ai-orchestration extension and
`dabbler-ai-router` PyPI package are already wired; this notice is
purely an instructions-side update.

No PRs are filed from this repo — the operator pulls the snippet
into each consumer manually per the established pattern.

If a consumer repo already pasted the Set 033 snippet, replace it
with the Set 036 snippet below; the structural shape is unchanged
(same H3 heading, same paragraph order) so the swap is straight
copy-over-replace.

## What changed (one-paragraph summary)

`session-state.json`'s `orchestrator` block is the authoritative
**check-out record** for the session set. Holder identity is the
`engine + provider + chatSessionId` composite (the chatSessionId
segment is a Set 036 refinement to the Set 033 `engine + provider`
base — two distinct chats on the same engine + provider are now
treated as different holders). `start_session` REFUSES when the
set is held by a different composite; the refusal names the
holder, both chatSessionIds, and the two release paths. When the
mismatch is specifically a chatSessionId one (same engine +
provider, different chat) and the operator is on an interactive
TTY, `start_session` also surfaces an inline Take Over / Read-Only
/ Cancel prompt before falling through to refusal — the extension
surfaces the same three options as a modal when the mismatch
fires from VS Code. `close_session` clears the block on every
successful close (the "check-in"). Within-set work is sequential;
across-set work can run in parallel. Force-override is the one
explicit deviation, logged to `~/.dabbler/orchestrator-writer.log`
with both holders' full composites.

Ships in `dabbler-ai-router` `0.7.0` (PyPI) and the
`DarndestDabbler.dabbler-ai-orchestration` VS Code Marketplace
extension `0.20.0` (Set 036).

---

## Snippet to paste into each consumer's CLAUDE.md

> Copy from the next horizontal-rule line through the trailing
> horizontal-rule line. The snippet is self-contained: it uses
> external links rather than referencing the consumer repo's own
> file layout, so it works unchanged in all three target repos.

---

### Orchestrator check-out / check-in (dabbler-ai-router 0.7.0 +
### dabbler-ai-orchestration 0.20.0)

The orchestration framework treats `session-state.json`'s
`orchestrator` block as a check-out record. Two invariants apply:

- **Within-set sequential.** At most one in-progress session per
  session set. `start_session` refuses a second simultaneous claim.
- **Across-set parallel.** Different session sets can each have
  their own in-progress session at the same time — possibly with
  different holders.

**Holder identity** is the `engine + provider + chatSessionId`
composite. Same triple across `model` changes (e.g.,
`claude-opus` ↔ `claude-sonnet` both on `claude + anthropic` in
the same chat) counts as the same holder. Two distinct chats with
different `chatSessionId` on the same `engine + provider` count as
**different holders** — that's the discriminator the takeover UX
keys on.

**`chatSessionId` source** depends on which orchestrator the chat
is running under:

- **Claude Code chats** — automatic. The dabbler-ai-orchestration
  extension's SessionStart hook extracts `session_id` from the
  hook payload and forwards it as `--chat-session-id` to
  `start_session`. No operator action required.
- **All other orchestrators** (Codex CLI, Gemini Code Assist,
  GitHub Copilot, manual Lightweight) — operator-driven. Run
  `python -m ai_router.new_chat_id --export --shell <bash|powershell|fish>`
  once per chat and `eval`/`Invoke-Expression`/`source` the output;
  `start_session` defaults to the resulting `$CHAT_SESSION_ID`
  env value. The "Configure Orchestrator" wizard toast for
  Gemini / Copilot includes one-click clipboard-copy actions for
  all three shells. The CLI is idempotent against an existing
  non-empty `$CHAT_SESSION_ID`, so repeated invocations in the
  same shell re-emit the same identifier (you can re-run it
  mid-session without losing your slot).

**Refusal.** If `python -m ai_router.start_session` exits non-zero
with a message like:

> start_session: refused — session set is checked out by a
> different orchestrator (claude + anthropic +
> chatSessionId=5d3e9c2b-…); caller is claude + anthropic +
> chatSessionId=7a4b21e0-…. Release the check-out before
> starting: re-run with --force to override, or invoke the
> "Release Check-Out" Command Palette action.

…the set is held by a different chat (or a different
engine + provider). Three ways forward:

1. **Wait and retry.** If the holder is actively working, just wait
   until their next `close_session` clears the block. The extension
   offers a "Poll for release" affordance on the conflict toast.
2. **Take Over via the modal / CLI prompt.** When the mismatch is
   specifically a chatSessionId one (same engine + provider,
   different chat), the extension surfaces a three-option modal
   (Take Over / Open in Read-Only Mode / Cancel) and
   `start_session` surfaces the same three options as an inline
   TTY prompt. "Take Over" is the audit-logged equivalent of
   `--force`. "Open in Read-Only Mode" sets a transient flag on
   the in-memory marker that prevents writes through the
   extension's surfaces (no claim made; agent should treat
   subsequent state mutations as refused).
3. **`start_session --force`** from the would-be holder. Used when
   the prior holder is stranded (crashed, network gone,
   abandoned). Logs the handoff to
   `~/.dabbler/orchestrator-writer.log` with both holders' full
   composites including both chatSessionIds.
4. **"Release Check-Out"** in the VS Code Command Palette
   (`Dabbler:` prefix). Wraps `--force` with a confirmation
   prompt.

**Tolerant-on-read.** A prior `orchestrator` block missing the
`chatSessionId` key (pre-Set-036 writer) or with the key present
and `null` (Set 036 writer that had no ID at write time) is
treated as a match against any caller-supplied chatSessionId for
`engine + provider` equality. The first new write populates the
field strictly. In-flight sets that cross the Set 036 boundary
migrate without forcing the holder through an explicit re-attach.

**Close-out clears the check-out.** `close_session` writes
`orchestrator: null` to `session-state.json` on every successful
close (the chatSessionId clears with the rest of the block — no
separate wipe needed). The `closeout_succeeded` event payload
carries the released holder's `chatSessionId + engine + provider
+ model` (Set 036 Q4 audit trail) so a forensic walk can
correlate close events to chats. Idempotent — re-running on an
already-cleared block is a no-op. The check-in applies on Full
tier (via the writer) and on Lightweight tier (the human writes
`null` by hand at the same boundary, alongside the manual
`completedSessions[]` update). Lightweight operators also paste
their `new_chat_id`-generated UUID into the `chatSessionId` field
when authoring a new check-out.

**Per-set lifecycle lock.** Both `start_session` and
`close_session` acquire `<session-set-dir>/.lifecycle.lock` for
their read/check/write window so a hybrid migration (one
orchestrator opening a new session while another is mid-close-out
on the same set) never interleaves writes. `start_session` polls
for up to 30s on contention (`EXIT_LOCK_CONTENTION=5`);
`close_session` keeps its immediate-failure contract (exit 3).

**Documentation aliases.** In operator-facing prose,
`work_checked_out` ↔ `work_started` and `work_checked_in` ↔
`closeout_succeeded`. The events ledger event names are unchanged
(no schema break).

**Tier reminder.**

- **Full tier** — every session runs `start_session` and
  `close_session`; the writer maintains the block automatically.
  Claude Code chats get chatSessionId via the hook; other
  orchestrators run `new_chat_id` once per chat.
- **Lightweight tier** — the human edits `session-state.json` by
  hand; same invariants, same `orchestrator: null` on close, same
  `chatSessionId` requirement (run `new_chat_id` once per chat,
  paste the UUID under the `chatSessionId` key alongside the rest
  of the block).

See the canonical references in `dabbler-ai-orchestration`:

- [`docs/session-state-schema.md`](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/session-state-schema.md)
  "Check-out / check-in (Set 033)" — full schema + holder identity
  + chatSessionId source-of-truth + per-set lifecycle lock
- [`ai_router/docs/close-out.md`](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/ai_router/docs/close-out.md)
  Section 4 — stranded-check-out recovery (including stale-
  chatSessionId handoff)
- [`docs/ai-led-session-workflow.md`](https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/ai-led-session-workflow.md)
  "Orchestrator check-out / check-in (Set 033)" — workflow-level
  invariants + Set 036 chatSessionId + new_chat_id workflow

---

## Notes for the paster

- The snippet has its own H3 heading, so it can drop into any
  existing CLAUDE.md without colliding with the surrounding
  structure. Pick an insertion point near other framework-version
  notes (e.g., next to existing references to `dabbler-ai-router`
  or the extension version).
- The links above are absolute GitHub URLs against `master` so they
  resolve regardless of which consumer repo the snippet lives in.
  If a consumer has its own mirror or fork that lags master, the
  paster should point those links at their own mirror — but that's
  a per-consumer adjustment, not part of the canonical snippet.
- **If the consumer already has the Set 033 snippet,** swap the
  whole H3 block (heading through closing references list) for
  the Set 036 version above. The structural shape is unchanged
  (same heading style, same paragraph order); the deltas are the
  chatSessionId additions, the `new_chat_id` workflow, the
  takeover UX paragraph, the lifecycle-lock paragraph, and the
  bumped version numbers in the heading. Diff-based swap is
  fine; full-replace is cleaner.
- If a consumer is on the **Lightweight tier**
  (`dabbler-homehealthcare-accessdb` per
  [[project_consumer_repos]]), the snippet is still accurate but
  the "Wait and retry" / "Poll for release" / extension-modal
  lines refer to Full-tier orchestrator affordances the
  Lightweight project won't exercise directly. The
  `new_chat_id` workflow and the manual chatSessionId paste ARE
  load-bearing for Lightweight; leave them in.
- After paste, no further code changes are needed. The next time
  the consumer's orchestrator starts a session via
  `python -m ai_router.start_session`, the writer enforces
  H3 + H4 + chatSessionId automatically.
