## [Unreleased] — one authored scenario, four documents that cannot drift

### Added

- **(Set 113 S2) A portable walkthrough scenario model, and renderers for
  the manual walkthrough, the training document, the captions and the
  chapter metadata.** New modules `ai_router/scenario.py`,
  `ai_router/scenario_render.py` and `ai_router/scenario_lint.py`; the
  format is documented in `docs/walkthroughs/README.md` and pointed to
  from the session-set authoring guide.

  ```bash
  python -m ai_router.scenario_render docs/walkthroughs/<scenario-id>
  python -m ai_router.scenario_render --check     # whole tree
  python -m ai_router.scenario_lint
  ```

  A scenario is one micro-workflow of a product, authored once in
  `scenario.yaml` for a reader with no prior context, and rendered into
  `walkthrough.md`, `training.md`, `captions.vtt` and `chapters.json`.
  Source and renderings are all committed; `--check` re-renders in memory
  and refuses any generated file that differs by a byte, so a hand-edit
  to a document and a source edit that was never re-rendered fail the
  same way. The pytest suite runs that check over the whole committed
  tree, which is the drift gate.

  **The written documents stand alone.** Neither prose file links a media
  file and both state, verbatim, that no video is needed — a video is an
  enhancement, and the portability rule means a consumer repo inherits
  the format without inheriting a recorder.

  **Driver detail is quarantined structurally, not by convention.**
  Playwright selectors and other target-specific mechanics live under
  `drivers:`; no renderer receives that block, and the `portable-digest`
  stamped into all four documents is taken over the portable half only.
  Changing a selector therefore leaves every generated document
  byte-identical, which is asserted rather than asserted-about.
  `scenario_lint` is the advisory second line, flagging selector-shaped
  text that leaked into the portable half; it warns and never refuses,
  and the committed corpus is asserted clean by the suite.

  **There is no seek bar and the documents never imply one.** Reaching an
  arbitrary step means replaying a documented prefix from the known
  baseline or from the nearest named `checkpoint`; `walkthrough.md`
  renders a *Where to start* table saying exactly that. This is the
  honest reading of the operator's 2026-08-10 condition on cutting the
  synced window, and it is stated in what the documents say rather than
  in a design note nobody reads.

  Unknown top-level and step keys are **refused**, not ignored — the same
  closed-vocabulary discipline Session 1 applied to the UAT record, and
  for the same reason: a field nobody validates is how a self-assessed
  confidence score or a stray selector arrives without anyone deciding to
  add it. Authored length above 60 seconds warns and never blocks.

  One exemplar ships: `docs/walkthroughs/work-explorer-first-look/` reads
  where every session set stands off the AI Work Explorer tree, on the
  disposable fixture project `npm run walk` stages. Five steps, under a
  minute. Nothing here records, encodes, uploads or drives anything.
