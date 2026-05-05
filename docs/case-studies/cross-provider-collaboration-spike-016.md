# Cross-provider collaboration in practice — a worked example

> **One-line summary:** Three independent AI takes on the same git-workflow problem — Anthropic Claude (Opus 4.7), Google Gemini 2.5 Pro, and OpenAI GPT-5.4 Medium — produced strong agreement on the high-level direction and meaningful, useful disagreement on specifics. The disagreements were where the real value emerged.
>
> **Audience:** practitioners considering whether multi-provider AI consultation is worth the additional cost and orchestration complexity. The TL;DR is yes, but for a non-obvious reason.
>
> **Source spike:** all the source artifacts referenced below live at
> [`docs/session-sets/016-harvester-cleanup-and-worktree-policy-spike/`](../session-sets/016-harvester-cleanup-and-worktree-policy-spike/).

## What we were trying to decide

A repository (`dabbler-access-harvester`) had accumulated structural drift — a worktree at a non-canonical path, two empty leftover directories at the container root — and the question of how to clean it up surfaced a bigger question: was the canonical bare-repo + flat-worktree layout (recently adopted) the right pattern at all, or had it been over-engineered for actual usage?

The operator named four candidate layouts (Repo-Level Sibling, Nephew-and-Niece, Son-and-Daughter, Subrepo-Level Sibling) and asked for a comparative recommendation, plus a cleanup recipe, migration recipe, regression guardrails, and a "safe way out" for cancelling parallel work.

The full prompt is preserved verbatim in [questions.md](../session-sets/016-harvester-cleanup-and-worktree-policy-spike/questions.md). Five questions, ~14KB of context including filesystem state and operator's stated frustration. Same prompt sent to each provider independently — no cross-pollination.

## Who we consulted, and why

| Provider | Model | Role |
|---|---|---|
| Anthropic | Claude Opus 4.7 | Orchestrator. Has the full conversation context, including operator's reasoning while the spike was being scoped. Not a blind take. |
| Google | Gemini 2.5 Pro | First independent provider. Blind to orchestrator's reasoning. |
| OpenAI | GPT-5.4 Medium (via Codex) | Second independent provider. Blind to orchestrator's reasoning AND blind to Gemini's response. |

**Why three?** The orchestrator has bias from being in the conversation — it knows what the operator already thinks. Two truly independent providers are needed for a meaningful comparison. With only one, you can't tell whether agreement reflects truth or shared blind spots.

## What each provider explored

### Gemini 2.5 Pro

- **Strongest contribution:** comprehensive, well-organized responses with specific git command syntax for each step. Detailed decision-tree wording for cancel-flow prompts (the actual user-facing prompt text). Clearest articulation of *why* each layout option ranks where it does.
- **Approach signature:** thorough, methodical, polished. Treats the question as a documentation/teaching exercise as much as an architectural one.
- **Cost & latency:** $0.0592, 113 seconds. 4371 input tokens, 5377 output tokens.

### GPT-5.4 Medium (via Codex)

- **Strongest contribution:** empirical verification. Codex actually ran git commands against a test repo and against the real harvester. Caught two things neither orchestrator nor Gemini had:
  1. **`git clean -fdx` doesn't nuke registered worktrees on Git 2.51** — Git protects them, even with `-x`. This contradicted an assumption baked into our prompt.
  2. **The harvester's main worktree is currently dirty AND the PoC branch is 36 commits behind base** — which made the orchestrator's and Gemini's "auto-merge by default" recommendation too aggressive. Auto-merging on a dirty main with a 36-commit gap is risky in ways that aren't visible from spec alone.
- **Approach signature:** cautious, empirical, infrastructure-aware. Treats the question as a risk-management exercise. Proposes belt-and-suspenders preservation (backup branch AND bundle file) before any destructive operation.
- **Cost & latency:** Run via Codex separately by the operator after API timeouts. (The earlier API attempts at `reasoning_effort: high` timed out at 20+ minutes per attempt — likely API instability or pathological reasoning on this prompt shape. `reasoning_effort: medium` via Codex completed normally.)
- **The routing surface mattered.** GPT was routed via Codex — an IDE-integrated agent with file-system access — rather than via the raw OpenAI API. Codex inspected the actual harvester repo as part of its reasoning. That's where the empirical advantages above came from. **It's plausible (and worth flagging) that Gemini routed via Gemini Code Assist would have produced an equivalent empirical depth.** The provider identity wasn't doing the work; the routing surface was. See [Surface choice (API vs IDE agent) was load-bearing](#surface-choice-api-vs-ide-agent-was-load-bearing) below.

### Claude Opus 4.7 (orchestrator)

- **Strongest contribution:** identifying tensions in the operator's framing. Noticed early that the operator's "main never moves" constraint was load-bearing in a way that immediately downgraded Option D, and that the operator's hypothesis about Option C's `.gitignore` approach had hidden footguns. Surfaced these tensions before either provider responded so the providers' answers could be compared against an articulated baseline.
- **Approach signature:** synthesis-oriented. Reasons across what the operator has said in this conversation AND what they've said in past conversations (via the auto-memory system). Brings full context awareness that blind providers don't have.
- **Worth noting for honesty:** the orchestrator runs inside Claude Code, which has IDE-integrated file-system access — the same kind of empirical grounding GPT-via-Codex had. So the orchestrator was more analogous to GPT-via-Codex than to Gemini-via-API on the surface-sensitive questions. This partly explains why orchestrator + GPT aligned more closely than either aligned with Gemini on those questions. Three providers; two routing surfaces (with file access) vs one (without). The provider/surface confound is real and should temper any "Anthropic + OpenAI agreed against Google" reading of this case.

## Where they agreed (the strong consensus)

All three independently landed on:

1. **Option B (Nephew-and-Niece) is the right new canonical layout.** Same ranking from all three: B > A, with D and C below.
2. **Option D should be retired** as the canonical layout — it pays structural tax even on sequential-work days, and the harvester's mess after one week of adoption was a strong empirical signal it was over-engineered for the actual usage profile.
3. **Cancel-and-cleanup default = preserve, not auto-merge.** Polluting `main` with cancelled work is higher-regret than archiving the work as a recoverable artifact.
4. **Never auto-delete remote branches.** Always require explicit confirmation.
5. **Use `git merge --no-ff` when explicit-merge is chosen** — preserves the fact that a cancelled branch was intentionally absorbed; easy to audit and revert.

The strength of this consensus matters because the three takes were truly independent. Three frontier-class models from three different providers, with three different training regimes and reasoning styles, agreeing on the same answer with the same rationale is much stronger evidence than any single model's confidence.

## Where they meaningfully differed (the actual value)

The disagreements turned out to be where the cross-provider approach earned its keep. Five places:

### 1. How careful to be on the immediate cleanup

**Gemini:** Auto-merge the PoC branch into main with `--no-ff`. Move forward.

**GPT-5.4:** Don't auto-merge. Main is dirty and the PoC is 36 commits behind. Preserve first (backup branch + bundle), relocate the worktree, then decide merge-vs-retire after the topology is stable.

**Result:** GPT's caution wins. Gemini didn't notice main was dirty (it gave a textbook answer based on the abstract problem shape). GPT looked at the actual repo and noticed the state that made the textbook answer dangerous. **Empirical inspection beat reasoning from the prompt.**

### 2. Whether `git clean -fdx` is a footgun in Option C

**Orchestrator and Gemini (reasoning from spec):** `-x` includes ignored files, so `git clean -fdx` from the main worktree would nuke the nested worktrees. This is a footgun that disqualifies Option C.

**GPT-5.4 (empirical test):** Ran `git clean -fdx -n` on Git 2.51 in a test repo with a registered nested worktree. Output: "Would skip repository worktrees/feature." Git **protects registered worktrees** even with `-x`. The footgun isn't where we thought it was.

**Result:** Option C still gets rejected, but for a different reason — the actual blocker is IDE indexer pollution (VS Code search, language servers double-indexing nested worktrees), not data loss from `-fdx`. Loose untracked files inside `worktrees/` are still vulnerable, but registered worktrees aren't. **The empirical correction sharpened the reasoning rather than changed the conclusion.**

### 3. How to migrate from Option D to Option B

**Gemini:** Collapse-in-place. Rename `.bare/` to `.git/`, unset `core.bare`, move main worktree contents to root, relocate the in-flight worktree. 10 steps modifying the existing container.

**GPT-5.4:** Clone-and-swap. Build a fresh sibling repo, populate it, smoke-test, atomically rename old container to `<repo>-old`, rename new container into position, repair worktree metadata. Old container preserved for ~1 week as rollback safety net.

**Result:** GPT wins, for two reasons. First, it matches the existing canonical migration recipe in `docs/planning/repo-worktree-layout.md` ("Keep `<repo>-old/` for ~1 week"). Second, smoke-testing the new state before any irreversible operation is just safer than collapsing the old state in place. **This was a clear case where one provider's answer was strictly better.**

### 4. Whether to build a canonical worktree CLI

**Gemini:** Layout-checker script. Documentation. Reconfigure tools that auto-create worktrees to use canonical paths.

**GPT-5.4:** Build `python -m ai_router.worktree open|close <slug>` as the primary regression guardrail. This makes the canonical path the *easy* path — operators and agents stop inventing paths ad hoc because they don't have to think about paths at all.

**Result:** GPT's tooling proposal is adopted. Documentation alone doesn't prevent regression; tooling that enforces the canonical path on every worktree creation does. **GPT identified the structural fix where Gemini reached for documentation.**

### 5. Where to archive cancelled work

**Gemini and orchestrator:** `<repo>/docs/cancelled-sessions/<timestamp>-<slug>.{bundle,json}`. Discoverable via `ls`. Tracked in git. A future operator can find what was cancelled without knowing where to look.

**GPT-5.4:** `<git-common-dir>/ai-router/cancelled-sessions/<timestamp>-<slug>.{bundle,json}`. Doesn't dirty the working tree. Works identically across normal repos and worktree-based repos. Git-native.

**Result:** Genuine tradeoff with no clear winner. The proposal defaults to Gemini/orchestrator's location for discoverability, but flags it as an open question for the operator to confirm. **Sometimes the providers don't converge on a single answer, and that's also useful — it surfaces the choice as worth deliberate operator input rather than letting one provider's default become invisible policy.**

## The pattern that emerged

Looking across the five disagreements, a recurring shape:

| Provider | Tends to |
|---|---|
| **Gemini 2.5 Pro** | Reason from the prompt; produce textbook-correct answers; lean on documentation as the solution to operational problems |
| **GPT-5.4 Medium** | Inspect the actual state when it can; produce risk-aware answers; lean on tooling as the solution to operational problems |
| **Orchestrator (Claude Opus 4.7)** | Carry conversational context; identify tensions in framing; surface tradeoffs that are invisible from a single provider's response |

These are tendencies, not absolutes. But the pattern repeated cleanly enough across five distinct disagreements that it's worth naming. **Different providers bring different defaults, and the value of cross-provider consultation is partly that it forces those defaults to compete.**

## Surface choice (API vs IDE agent) was load-bearing

Looking back at the five disagreements, one observation reframes the whole exercise: GPT's biggest advantages — noticing main was dirty, empirically testing `git clean -fdx -n` — came from **routing surface**, not from anything intrinsic to GPT-5.4 as a model. GPT was routed via Codex, an IDE-integrated agent with file-system access. Gemini was routed via raw API, with only the prompt to reason from. Had Gemini been routed via Gemini Code Assist (its IDE-integrated agent equivalent), it likely would have caught the same things.

**The routing decision is two-dimensional, not one-dimensional.** The current `ai_router.route()` function chooses *which provider* to call. It doesn't choose *which surface*. For the consultation here, surface mattered as much as provider — possibly more.

### When surface matters

| Task shape | Surface that fits |
|---|---|
| **Empirical verification** ("does this command actually do X on the operator's system?") | IDE agent — needs file/shell access |
| **State-aware recommendation** ("is it safe to merge given current branch state?") | IDE agent — needs to see the state |
| **Code-grounded analysis** (PR review, refactor proposals on specific files) | IDE agent — needs to see the files |
| **Pure architecture comparison** (e.g., "compare these four layout patterns abstractly") | API is fine — answer doesn't depend on current state |
| **Pure synthesis / writing** ("summarize these documents") | API is fine — content is in the prompt |
| **Reproducibility-critical / scripted routing** (end-of-session verification gate) | API — scriptable, deterministic |

### Cost and ceremony tradeoffs

| Dimension | API routing | IDE-agent routing |
|---|---|---|
| Cost (this consultation) | $0.06 metered | $0 incremental on existing subscription plans |
| Wall-clock | ~2 minutes, no operator involvement | ~5–10 minutes including operator paste-and-wait |
| Reproducibility | Scriptable, deterministic | Operator-mediated, harder to automate |
| Empirical depth | Reasoning from prompt only | Reasoning from prompt + actual repo state |

For most cross-provider consultations on policy or design questions, API is the right choice — cheap, fast, scriptable. For consultations where the answer should be *grounded in the actual state of the world*, the manual-paste ceremony of an IDE agent is worth it. The lesson from this spike is that **we should be picking surface explicitly**, not defaulting to whichever is most automated.

### What we'd do differently next time

If we re-ran this consultation knowing what we know now, we'd route both providers via their IDE agents (Codex for OpenAI, Gemini Code Assist for Google), even though that means more operator paste-and-wait time. The questions had a strong empirical component — actual state of the harvester repo was load-bearing in two of the five questions — and we underused that.

That said: the API-routed Gemini answer was still genuinely valuable. The textbook-correct answer surfaced the *abstract* tradeoffs cleanly in a way that complemented GPT's empirical refinements. Both perspectives mattered. The lesson isn't "always use IDE agents"; it's "the surface choice is real and should be deliberate."

## What we landed on

The full technical proposal is in [proposal.md](../session-sets/016-harvester-cleanup-and-worktree-policy-spike/proposal.md). Highlights:

1. **Adopt Option B as the canonical layout.** Replaces Option D. Update `docs/planning/repo-worktree-layout.md` accordingly.
2. **Clean up the harvester via GPT's preserve-first sequence.** Backup branch + bundle before any destructive operation; relocate the stranded worktree; defer the merge-vs-retire decision until after topology is stable.
3. **Migrate Option D → Option B via clone-and-swap** (GPT's recipe), not collapse-in-place. Preserves rollback safety net.
4. **Build `python -m ai_router.worktree` as the primary regression guardrail.** Canonical path is enforced by tooling, not by hope.
5. **Build `python -m ai_router.cancel_session`** with the synthesized decision tree. Default = preserve as bundle + manifest under `docs/cancelled-sessions/`. Operator can override to merge or discard.
6. **Layout checker** runs as part of session close-out gate to catch drift early.

## What this cost

| Item | Value |
|---|---|
| Total spend | **~$0.06** (Gemini-2.5 Pro only via API; GPT was run via Codex separately) |
| Total wall-clock for routing | ~2 minutes (Gemini); manual run for GPT |
| Total wall-clock for synthesis (orchestrator) | ~30 minutes |
| Spike duration end-to-end | ~3 hours (mostly authoring findings, questions, proposal — not routing) |
| Open-source provider pricing applies; live cost in the Cost Dashboard | ✓ |

The total cost of three independent expert takes on a multi-faceted infrastructure question came in at less than a dollar. That's the headline economics.

## When cross-provider consultation is worth it

This pattern earns its keep when:

- **The decision is reversible-but-painful.** Picking a wrong canonical layout doesn't break anything; it just costs migration work later. Cross-provider input helps you not pick wrong in the first place.
- **The cost of the consultation is a small fraction of the cost of being wrong.** ~$0.06 compared to the cost of a second migration is trivially worth it.
- **Multiple credible answers exist.** When the question has one clear right answer, cross-provider mostly produces redundancy. When the question has tradeoffs (here: glance-readability vs git-purity vs IDE-friendliness vs migration cost), independent perspectives surface tradeoffs you'd otherwise miss.
- **You can structure the prompt for independence.** No cross-pollination is essential. Each provider should answer blind to the others.

This pattern earns its keep less when:

- The question is purely empirical and one provider can verify the answer (here, GPT did this for `git clean -fdx`).
- The question is so well-trodden that all frontier models give the same answer trivially.
- The cost of routing is high relative to the cost of being wrong.

## What this isn't

This isn't an argument that AI replaces senior engineering judgment. The orchestrator framed the question, the providers consulted, but **the operator made every decision** — what to ask, how to ask it, when to override the consensus, where to archive cancelled work, what timing makes sense for the migration. The AI did synthesis and rapid-comparison work; the human did judgment work.

This also isn't an argument that more providers is always better. Three was enough to surface the disagreements and triangulate on a recommendation. Adding a fourth or fifth would have produced diminishing returns. Two would have been enough for a simpler question.

## Reproducing this pattern

The full toolkit lives in this repo:

- The orchestrator setup (Claude Code with the auto-memory system) provides session-spanning context.
- The `ai_router` Python package handles cross-provider routing with cost tracking ([ai_router/](../../ai_router/)).
- The session-set workflow (`docs/session-sets/<NNN-slug>/`) provides the structure: spec → findings → questions → provider responses → proposal → executive summary → close-out.
- The "spike" pattern — small, single-session, advisory rather than implementation — is the right shape for decisions like this.

## Source artifacts

| File | Purpose |
|---|---|
| [`spec.md`](../session-sets/016-harvester-cleanup-and-worktree-policy-spike/spec.md) | The session-set's overall plan |
| [`findings.md`](../session-sets/016-harvester-cleanup-and-worktree-policy-spike/findings.md) | Empirical audit of the harvester's current state |
| [`questions.md`](../session-sets/016-harvester-cleanup-and-worktree-policy-spike/questions.md) | The verbatim prompt sent to both providers |
| [`provider-responses/gemini-2.5-pro.md`](../session-sets/016-harvester-cleanup-and-worktree-policy-spike/provider-responses/gemini-2.5-pro.md) | Gemini's response |
| [`provider-responses/codex.md`](../session-sets/016-harvester-cleanup-and-worktree-policy-spike/provider-responses/codex.md) | GPT-5.4 Medium's response (via Codex) |
| [`proposal.md`](../session-sets/016-harvester-cleanup-and-worktree-policy-spike/proposal.md) | The full technical synthesis (long; this case study is the short version) |
