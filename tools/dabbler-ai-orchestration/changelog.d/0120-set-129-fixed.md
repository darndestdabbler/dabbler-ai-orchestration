### Fixed

- **(Set 129) The duplicate close row is gone — structurally, not
  lexically.** A session's obligations no longer sit in a row beside the
  step that closes; they hang off that step.

  Set 115 S4 gave the close-out obligations their own row under the
  in-flight session. Set 128 S1 then made a step literally named
  **Close-out** part of the skeleton every session declares. The two
  landed independently and collided: every session rendered a `Close out`
  step immediately followed by a close-out row, and the operator read the
  pair as one thing duplicated. Set 128 S1 renamed the second row to
  `Close-out readiness`, which made them *distinguishable* without making
  them *singular* — the duplication was structural, and it survived the
  rename. It kept being reported.

  `childrenOf` for a session returned `[...stepNodes, ...closeOutNodes]`,
  so the obligations row was always a sibling of the step rows. Now the
  close-out **step** carries the readiness summary in its description,
  the obligations in its tooltip, and the obligation rows as its
  children (`StepNode.closeOut`). One row per session, and "what still
  stands between here and close" is attached to the step that closes,
  which is where an operator looks for it. The step keeps its own glyph:
  whether close-out has been executed and what stands in its way are
  different questions, and the icon has always answered the first.

  The step is found by intent rather than by exact label — the four
  phrasings mirrored from `spec_admission.CLOSE_OUT`, matched against the
  last row that satisfies them, since the skeleton puts close-out at
  position −1. The deliberately narrow bare `close` is carried across
  too, so an arbitrary final work step such as *"Close the tracking
  issue"* does not absorb the obligations; the Python admission parser
  learned that boundary in its own round 2.

  The standalone `Close-out readiness` row still exists as the fallback
  for what the fold cannot reach: a session with no step ledger, or a
  spec predating the Set 128 skeleton that names no close-out step. 46
  sets are in that position, and losing their obligations entirely would
  trade one reported bug for a quieter one.
