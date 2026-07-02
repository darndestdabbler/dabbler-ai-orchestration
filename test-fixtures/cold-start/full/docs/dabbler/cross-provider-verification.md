<!--
  GENERATED FILE — do not hand-edit.
  Rendered by the Dabbler shared template writer from
  docs/templates/consumer-bootstrap/cross-provider-verification.md.template
  in the dabbler-ai-orchestration repo. The extension refreshes this file
  idempotently before emitting review prompts; edits here are overwritten.
  Change the template instead.
-->
# Cross-provider verification — instructions for the reviewing engine

You are the **out-of-band verifier** for a Lightweight-tier session set in
`acme-app`. A pasted prompt pointed you here. You are expected to be a
**different model provider** than the engine that did the work — that
independence is the whole point. Follow this file exactly; it ends with you
**writing your verdict to a file yourself**.

## 1. What to read

The prompt that brought you here names the session set. Read, in order:

1. `docs/session-sets/<slug>/spec.md` — the declared scope and per-session
   plans.
2. `docs/session-sets/<slug>/activity-log.json` — what was actually done.
3. `docs/session-sets/<slug>/change-log.md` — if present (set complete).
4. The git history/diff for the reviewed range (the prompt carries the
   commands). Remember `git diff` omits untracked files — check
   `git status --short` too.

## 2. Review stance

Act as a devil's advocate: assume the work is flawed and try to prove it.
A rubber-stamp review is a failure. But apply a materiality bar — every
finding you report as blocking must name the **exact requirement violated**,
the **concrete impact**, and the **evidence**; lacking all three, record it
as a `[Minor]` nit. Semantic equivalence is not a defect (e.g. `pytest`
vs `python -m pytest` — same behavior, not a finding).

## 3. Verdict grammar (exact tokens — a parser reads this)

Your verdict is exactly one of these UPPERCASE tokens:

- `VERIFIED` — the work matches its declared scope; no Critical/Major
  findings.
- `ISSUES_FOUND` — list each finding as a bullet tagged `[Critical]`,
  `[Major]`, or `[Minor]`.
- `WAIVED — <one-line reason>` — only when the operator explicitly asked to
  waive verification; the reason is **required** (a bare `WAIVED` is ignored
  by the parser). Put the reason on the same line after the token, or on a
  `Reason: <text>` line **immediately** following the verdict line — any
  other line in between and the parser drops the waiver.

## 4. Required output — YOU write the artifact

Write (do not just say) your verdict into:

```
docs/session-sets/<slug>/external-verification.md
```

- UTF-8, **append-only**: never delete or rewrite earlier rounds.
- One dated round section per review. Your section looks like:

```markdown
## Round <N> — <YYYY-MM-DD>

Reviewed by: <engine / model / provider>

Verdict: VERIFIED

<short rationale; for ISSUES_FOUND, the tagged findings list>
```

- `<N>` is 1 for the first review, incrementing per round (the latest round
  wins when the file is parsed).
- **Specification reviews are scoped.** If the prompt asked you to review
  the *specification* (a pre-work plan review), add the line
  `Scope: specification` directly under your round header. A spec-only
  verdict reviews the plan, not delivered work — the close-out gate
  deliberately does not count it as work verification. Session/set work
  reviews need no `Scope:` line.
- If the file has a seeded `Verdict: PENDING` header for your round, replace
  that `PENDING` line with your real verdict; otherwise append a new round
  section at the end.

Writing this file is **not optional** — the close-out gate reads it, and a
review that exists only in a chat window does not count.

## 5. Copilot-locked shops (single-IDE recipe)

If your team can only use GitHub Copilot, you can still be cross-provider:

1. Open a **second, fresh** Copilot chat (no shared context with the chat
   that did the work).
2. Switch the **model picker** to a different provider's model than the one
   that did the work (e.g. work was done under a Claude model → review under
   a GPT model, or vice versa).
3. Paste the review prompt there and follow this file.

Same engine + same provider does not satisfy cross-provider review; same
engine + different provider does.
