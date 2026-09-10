# Is the model we asked for the model that answered?

> **Purpose.** One question, measured from the record this repository already
> keeps, so that a surface offering an operator a list of models is offering
> something it has evidence for. Session 144 wrote this. Re-measure it rather
> than trusting the numbers below once a vendor or a CLI version has moved.

## Why it is asked at all

A configuration surface that lets a person choose a model, and a transport
underneath that quietly answers with a different one, is worse than no
surface: the operator chooses, is shown their choice, and pays for something
else. This repository has paid that bill once already — a verifier picked a
model at fourteen times the cost and one session spent 364 premium requests.

## What was already recorded

Nothing here was measured by making calls. All of it was on disk:

- **`RouteResult.served_model_id`** — what answered, per call.
- **`verify/rounds.ts`** writes `requested_model` beside `served_model` on
  every verification round, and has since the 364-request session.
- **The Copilot seat catalog** (`copilot-catalog.lock`) carries
  `echoed_model` beside each model's `id`, written by the probe
  `dabbler copilot` runs.
- **The API transport** already compares the two per call and writes a NOTE
  to stderr when they differ.

Four provider calls were planned for this measurement. They were not made:
they would have repeated, more expensively, a comparison the record already
supports, and seat calls are priced.

## The measurement

**API transport — 98 verification rounds, every one exact.**

| what | count |
| --- | --- |
| rounds carrying a requested model | 98 |
| of those, carrying a served id | 98 |
| served id absent ("the provider did not say") | 0 |
| **served id differing from the one asked for** | **0** |

Two models account for all of it: `gpt-5.4` (44 rounds) and `gpt-5.6-terra`
(54 rounds), both OpenAI.

**Copilot seat — 15 models, every one echoed back exactly.**

`claude-sonnet-4.6`, `claude-sonnet-4.5`, `claude-haiku-4.5`,
`claude-fable-5`, `claude-opus-4.8`, `claude-opus-4.7`, `claude-opus-4.6`,
`claude-opus-4.5`, `gpt-5.5`, `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.4-mini`,
`gpt-5-mini`, `gemini-3.5-flash`, `gemini-3.8-flash`.

Three of the catalog's 18 models carry no echo, because they were never
probed successfully. **They are not evidence of anything**, in either
direction.

## What this does NOT establish, and the two are not the same evidence

**The API's served id is the provider's own statement, read out of the
response body.** A provider that served a different model said so itself. It
is the stronger of the two.

**The seat's echo is the seat's own account of itself.** This framework
already holds that a seat label is not trusted — it is why a Copilot seat's
identity resolves through the model registry rather than through what the
seat calls itself — and an echo is a label. Fifteen models echoing what they
were asked is consistent with the flag being honoured, and it is not proof
of it: a CLI that ignored `--model` and echoed the request back would
produce this table exactly.

The two must not be written down as one number. They are recorded here as
two.

**Coverage is narrow.** The API evidence covers one provider and two models,
because a verification round is the only call this repository routes through
that record. Nothing here says anything about Anthropic or Google over the
API transport. A model with no evidence reads as **not known** — which is a
different fact from "honoured", and `modelFidelity` in `selection.ts` keeps
them apart for exactly that reason.

## What would strengthen it

A response that names the model in its own content — asked of a model whose
answer would differ from another's — would turn the seat's echo into
evidence rather than a claim. That costs calls, and it is worth making when
a surface starts depending on the answer for a model this table does not
cover.
