# Is the model we asked for the model that answered?

> **Purpose.** One question, measured from the record this repository already
> keeps, so that a surface offering an operator a list of models is offering
> something it has evidence for. Session 144 wrote this. Re-measure it rather
> than trusting the numbers below once a vendor or a CLI version has moved.

> **Which models exist, and what they cost, is a different question with a
> different answer**: see `docs/model-and-pricing-sources.md`. This page is
> only about whether the model asked for is the model that answered.

## Why it is asked at all

A configuration surface that lets a person choose a model, and a transport
underneath that quietly answers with a different one, is worse than no
surface: the operator chooses, is shown their choice, and pays for something
else. This repository has paid that bill once already — a verifier picked a
model at fourteen times the cost and one session spent 364 premium requests.

## What was already recorded

Most of what follows was on disk before a single call was made:

- **`RouteResult.served_model_id`** — what answered, per call.
- **`verify/rounds.ts`** writes `requested_model` beside `served_model` on
  every verification round, and has since the 364-request session.
- **The Copilot seat catalog** (`copilot-catalog.lock`) carries
  `echoed_model` beside each model's `id`, written by the probe
  `dabbler copilot` runs.
- **The API transport** already compares the two per call and writes a NOTE
  to stderr when they differ.

## The four calls, and what only they could show

Four provider calls were planned, argued to be unnecessary, and then made
anyway after verification blocked twice on their absence. **The verifier was
right and the argument was wrong**, for a reason neither side predicted: the
live probe found a spelling the archive did not contain.

| transport | asked for | answered | |
| --- | --- | --- | --- |
| api | `claude-haiku-4-5-20251001` | the same | exact |
| api | `gpt-5.4-mini` | `gpt-5.4-mini-2026-03-17` | **dated pin** |
| copilot-cli | `gpt-5-mini` | the same | echo |
| copilot-cli | `claude-haiku-4.5` | the same | echo |

The second row is the point. `modelFidelity` treated a dated snapshot as the
model that was asked for — a provider pinning a date is routine, and warning
about it would drown the warning that matters — but it recognised only
`-20260317`, and OpenAI writes `-2026-03-17`. **Every dashed pin would have
been reported to an operator as a substituted model.** No amount of reading
the 98 archived rounds would have found that: they cover two models, neither
of which is pinned that way. `packages/router/scripts/probe-model-fidelity.ts` is the probe, covering both
transports -- the seat half runs when `DABBLER_COPILOT_BINARY` names a CLI,
because it spends premium requests and most machines have no seat. The two
seat rows above were taken with `dabbler copilot refresh --models
gpt-5-mini,claude-haiku-4.5`, which is the same probe wired into the catalog
and is the right way to run it when the answer should be KEPT. The
credential-gated version lives in `live.test.ts` behind `DABBLER_E2E=1`, like
every other live test. Run one of them again when a vendor's spelling might
have moved.

The two seat calls found what the fifteen archived echoes found, and are
worth exactly what those are worth — see below.

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
two, **and `modelFidelity` weighs them asymmetrically for the same reason**:

- **An echo can never establish fidelity.** A matching echo reads as
  `not-known`, whatever its count. Fifteen of them are fifteen instances of
  an observation that cannot distinguish the two cases, not fifteen points
  of evidence.
- **An echo CAN establish a substitution.** A seat naming a different model
  than the one it was asked for is testifying against its own interest, and
  is believed.
- **Only a served id makes a model read `honoured`**, because only a
  provider's own statement of what answered can.

A round's own served id is NOT one kind of fact either: on the direct-API
path it is the provider's statement, and on a Copilot seat the very same
field carries the CLI's echo. `roundObservations` reads the round's
`transport` and weighs it accordingly, and a round that names no transport is
read as the weaker kind -- unlabelled is old rather than trustworthy.

Round 1 of session 144 found the code and this document disagreeing on
exactly this point — the reading called an exact catalog echo `honoured`
while the paragraph above said an echo was not evidence — and the reading
was the half that was wrong.

**So the seat's fifteen models read as `not-known` today.** That is the
honest answer and it is what session 145's pane must render: not an absence
of a problem, and not approval.

**Coverage is narrow.** The archived API evidence covers one provider and two
models, because a verification round is the only call this repository routes
through that record; the probe adds one Anthropic model and one more OpenAI
model. Nothing here says anything about Google over the API transport. A model with no evidence reads as **not known** — which is a
different fact from "honoured", and `modelFidelity` in `selection.ts` keeps
them apart for exactly that reason. On the evidence above, **every model
reads as not-known except the two the API rounds cover**.

## What would strengthen it

A response that names the model in its own content — asked of a model whose
answer would differ from another's — would turn the seat's echo into
evidence rather than a claim. That costs calls, and it is worth making when
a surface starts depending on the answer for a model this table does not
cover.
