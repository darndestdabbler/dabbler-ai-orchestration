# What a session costs, and what is sent to a reviewer

A session calls models from two companies: the one whose AI writes the
code, and a different one whose AI reviews it. What that costs depends on
how you pay each of them and which models you choose, and it can range
from nothing beyond the subscriptions you already have to more than a
hundred dollars for one session. This page says where a session calls a
model, what decides the cost, where to see what was spent, and exactly what
a reviewer is sent.

## Where a session calls a model

| Call | Who starts it | Whose model |
| --- | --- | --- |
| The authoring engine, which does the work | A person, with **Start Session** | The Authoring Model |
| Each review round | The framework, after the work and after each fix | The Primary Model |
| The unattended Mechanic | The framework, on a stop, when the Mechanic's delegation is `unattended` (the default) | The Mechanic Model, on the authoring engine |
| A Mechanic opened from the menu | A person | The Mechanic Model, on the authoring engine |
| **Check this stop** (`dabbler triage`) | A person | A reviewer outside the author's provider |
| An adjudication (`dabbler verify adjudicate`) | A person, once per session at most | The Auxiliary Model |
| **Consult with AI** | A person | The model the person picks, on the authoring engine |

The framework starts only two of these by itself: the review rounds, and
the unattended Mechanic. The unattended Mechanic is limited to one attempt
per stop, two per session and twenty minutes each (see
[Consult with AI, and the Mechanic](consult-and-mechanic.md)).

**A release session calls no model in the ordinary case.** No engine, no
model and no reviewer is asked for when it starts, and it has no step and
no review round: the framework runs the whole suites, the publish and the
close. The one exception is a refused publish: with the Mechanic's
delegation at `unattended`, the framework calls the Mechanic in once to
diagnose it, and undoes anything it changes.

## What a session costs

**A subscription on both sides**: the authoring tool on its own plan, such
as Claude Code on a Claude subscription, and a GitHub Copilot subscription
for the review. The cost is contained while the work stays inside the
plans' monthly limits.

**Copilot billed by use, or API keys on either side.** The cost follows
the models chosen. With a top-tier frontier model on both sides, expect
dozens of dollars a session, and now and then a session past a hundred.

**A release session** costs nothing in model calls, unless its publish is
refused and the Mechanic is called in to diagnose it, as above.

## Prices move, so watch them

Models differ in price many times over, and the prices change as new
models arrive. Keep an eye on what your sessions cost: the authoring
tool's own usage page or command, your Copilot billing page, and each API
company's usage console are where the spend is, and *Where to see it*,
below, says what the framework itself can show.

## Where the prices are

Each company publishes its own prices:

- Google: [Gemini Developer API pricing](https://aistudio.google.com/docs/pricing)
- OpenAI: [API pricing](https://developers.openai.com/api/docs/pricing)
- Anthropic: [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- GitHub Copilot: [Models and pricing for GitHub Copilot](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing)

## One person's experience

This is the experience of the person who maintains Dabbler, as of
November 2026. It is one person's experience, not a price list.

- The top Anthropic models, `claude-opus-5-5` and `claude-fable-5-2`, cost
  much less through a Claude Max subscription than through GitHub Copilot
  billed by use.
- `claude-sonnet-5-5` writing the code, with `gpt-5.6-terra` or
  `gemini-4-argon` reviewing it, is capable enough for most work at a
  reasonable price, with a session often under $10.

## What moves the cost

- **The model for each role.** The Authoring Model, the Primary Model, the
  Auxiliary Model and the Mechanic Model are each chosen in
  [the Configuration](configuration.md), or with `dabbler configure
  --reviewer-model <id>` and `--auxiliary-model <id>` for the reviewers.
- **The round cap.** A session is reviewed for at most seven rounds unless
  the repository's configuration sets `verification.settings.max_rounds`.
  Every round is one more call to the Primary Model.
- **The Mechanic's delegation.** At `unattended` the framework may call the
  Mechanic in by itself, up to twice a session; `attended` leaves it to
  you, and `off` takes it away. It is the **Mechanic** row of the
  Configuration.
- **The size of the change.** The first round is sent the whole diff, and
  each later round only the fix, so a large change costs more to review.

## What the record shows of the cost

Each review round's row in `.dabbler/runs/s<N>/rounds.jsonl` records the
reviewer's model, its vehicle, and, through an API key, the input and
output tokens the provider counted. It records no dollars: the framework
computes no price, and the company's own console is where the bill is. A
round reached through a Copilot seat records no token count, because the
seat reports none.

On the maintainer's machine, sessions 280 to 325 of Dabbler's own
repository were reviewed by `gpt-5.6-sol` through an API key: 50 rounds,
one to eight a session. One round took between 5,232 and 61,066 input
tokens and between 303 and 10,982 output tokens. Those records hold no
other reviewer model with token counts, so this page gives no range for
any other. Multiply by the reviewer's current price to get dollars.

Nothing of the authoring engine's own spend reaches the record. The
authoring engine usually does most of a session's work, so its spend is
usually most of the cost; see it in the authoring tool's own usage page or
command.

## What is sent to a reviewer

Every round, the reviewer is sent:

- the session's section of the plan, word for word;
- the work plan's task and non-goals;
- the decisions recorded during the session;
- the diff: on round 1, the whole change and the content of every new
  file; on each later round, only the fix, with the previous findings;
- the list of changed source files that have no test named after them;
- a prompt that tells it to assume the work is flawed and try to prove it.

The prompt is `packages/router/prompt-templates/verification.md`. What it
may read beyond that depends on the reviewing vehicle:

- **Through a Copilot seat** it can list files, search them and read them,
  up to 40 operations a round unless `verification.settings.read_budget`
  sets another number. It is told the round's scope and budget, and each
  operation is recorded on the round afterwards. Going outside the scope
  or past the budget is recorded, not refused.
- **Through an API key** it has no tools and sees only what it is sent.
  With `verification.settings.api_file_requests` on, which it is not by
  default, it may name files in its answer; the framework opens those that
  are in the round's scope and within the budget, and sends them in one
  further turn.

No review round can write to the repository.

## Which companies receive code

Always two: the author's provider, which the authoring engine sends the
code to as it works, and the reviewer's, which is never the author's.
Through a Copilot seat, that is GitHub, which runs the model you chose. A
third receives the code only when a person asks for it: an adjudication,
whose Auxiliary Model is from neither of the first two, or **Check this
stop**, which asks the reviewer's provider and goes to another outside the
author's only when that one cannot be reached. What each company does
with what it receives is that company's own policy.

## Where to see it

- `dabbler configuration explain` names the model and vehicle for each
  role, and the layer that chose it.
- `.dabbler/runs/s<N>/rounds.jsonl` has a row per review round, with its
  model, vehicle and tokens; `.dabbler/runs/s<N>/round-<n>-verifier-output.md`
  is the reviewer's own answer.
- `dabbler seat-cost <id>` reads what a Copilot CLI conversation spent,
  from the Copilot CLI's own usage store on this machine, in AI credits.
