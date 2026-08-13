### Added

- **(Set 122 S2) `Copy Module Decomposition Prompt` is on the module
  context menu.** It worked and was palette-only; it was one manifest entry
  away from the operator's *"copy-prompt context menu items for modules"*.

- **(Set 122 S2) `DABBLER_ROUTER_INSTALL_SPEC` — a harness-only override
  for which router the install path resolves.** Unset in production, where
  the value is simply `dabbler-ai-router` from PyPI. The Layer 3 cold-start
  walkthrough sets it to this repo, and the reason is worth recording: that
  walk does a real `pip install` from a genuinely empty folder, but it was
  resolving the package from the live registry — so it could only ever
  validate the LAST PUBLISHED wheel against the CURRENT extension. The
  moment the extension depended on router code that was not yet released
  (`ai_router.modules`, shipped by this set), the walk went red and no
  amount of code could have fixed it before a publish it is itself meant to
  gate. Splitting the two questions fixes it: *"does provisioning work from
  nothing?"* stays a pre-release test and still runs end to end, while
  *"is the published wheel compatible?"* is a release gate, answered by the
  spec's own ordering (publish the router, confirm the wheel is live, then
  publish the extension). A local source tree is installed **editable** —
  without `-e`, PEP 517 copies the entire checkout, `node_modules` and all,
  into a build sandbox, which turned a nine-second install into one that had
  not finished twenty minutes later.

