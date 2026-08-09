# Set 112 — guided-look UAT walk

**Ten minutes.** Two sections. No test script, no assertions — your eyes
are the verdict.

**What this set did, in one sentence:** the Lightweight tier is gone —
the `tier:` switch, both of its verification modes, and everything that
existed only to serve them — so there is now one tier whose
cross-provider verification story is true without asterisks.

The walk uses **three windows**, and each item says which one. Two are
staged for you; the third you already have.

**A — the empty-project window** (items 1 and 3). A brand-new project
with no session sets, which is the only state that shows the Getting
Started form:

```bash
cd tools/dabbler-ai-orchestration
npm run walk -- --empty --walk-doc ../../docs/session-sets/112-remove-lightweight-tier/s3-uat-walk.md
```

**B — the project-with-history window** (item 2). The same command
without `--empty`: a fixture project carrying four session sets, so the
Work Explorer has rows to look at:

```bash
npm run walk -- --walk-doc ../../docs/session-sets/112-remove-lightweight-tier/s3-uat-walk.md
```

**C — your repo window** (items 4 and 5). The normal VS Code you already
have open on `dabbler-ai-orchestration`.

Both staged windows open the Dabbler view by themselves and delete their
project when you close them. Run A first; close it before starting B.

---

## Look (5 items)

### 1. The first question is no longer "which tier?"

**Window A.** Look at the **Getting Started** panel that opened by
itself.

It used to open with a Full / Lightweight radio, and choosing Lightweight
unfolded a second question about verification mode. Both are gone: the
form's first and only setup question is now how you reach a provider —
API keys, or a GitHub Copilot seat.

**Does the form read like it was designed this way, or like something was
cut out of it?**

### 2. The Explorer stopped keeping the tier's secrets

**Window B.** Look at the session-set rows in the Dabbler view (expand a
module, then a bucket).

The `lw` badge, the tier-mismatch advisory, the `N/M+` fraction and the
`v?` / `v+` posture markers are gone — every one existed only to make the
tier legible. What remains is the verdict vocabulary, which was always
tier-independent.

**Does a row still tell you what you need at a glance, or does it feel
thinner than it should?**

### 3. A stranded consumer gets a message they can act on

**Read it here.** This is the whole text a consumer sees when a `spec.md`
still declares the removed tier. It is printed and the run stops before
anything is written to disk — automated tests pin both the reachability
and the no-write, so your job is only the wording:

> tier: lightweight was removed in Set 112 -- there is one tier now.
> Fix: set 'tier: full' in the Session Set Configuration block (or drop
> the tier: line entirely), then give the router a provider to call --
> either DABBLER_ANTHROPIC_API_KEY / DABBLER_GEMINI_API_KEY /
> DABBLER_OPENAI_API_KEY for the Direct APIs transport, or an
> authenticated GitHub Copilot CLI seat with
> 'transport: {profile: copilot-cli}' in ai_router/local-overrides.yaml.
> See docs/cross-repo-lightweight-removal-notice.md.

**If that were the only thing you had, would you know what to do next?
Is it too long, or exactly as long as it needs to be?**

*(To watch it come out of the real code, run this in window C's terminal:
`.venv\Scripts\python.exe -c "from ai_router.spec_config import
LIGHTWEIGHT_REMOVED_MESSAGE as m; print(m)"`)*

### 4. The Marketplace page tells one story

**Window C.** Open `tools/dabbler-ai-orchestration/README.md` and read
the first screenful.

This is what renders on the Marketplace listing — the highest-traffic
user-facing surface in the change, and the last one caught. Until late in
this set it was still selling two tiers and naming four commands that no
longer exist.

**Reading it as a stranger: does anything still imply there is a choice
of tier?**

### 5. The removal is documented without being reversible

**Window C.** Open `docs/concepts/tier-model.md` — the doc that used to
teach the two-tier model, now a historical note.

The tier can still be *explained* anywhere: this note, the migration
message, the changelogs, the cross-repo notice. What a new CI gate now
refuses is any live file that *declares* it.

**Does this read as honest history, or as an apology?**

---

## Decide (3 items)

### A. The router's version number: `1.0.0`, or `0.35.0`?

The spec pre-decided this is "a major-version breaking release" but not
the number. I staged **`1.0.0`** — the strongest signal semver has, for a
package that now has exactly one tier and no mode in which cross-provider
verification is substituted rather than performed.

The alternative is `0.35.0`: honest about maturity, keeps breaking
changes cheap under `0.x`, but a consumer pinning `>=0.33,<1` upgrades
straight into a loader refusal with no version-shaped warning.

Nothing is published, so this is still a four-file edit.

- [ ] **`1.0.0`** — ship the signal
- [ ] **`0.35.0`** — stay pre-1.0

### B. Publish now, or hold?

Two artifacts are staged and green, neither is published:

- `dabbler-ai-router` **`1.0.0`** (PyPI) — also carries the unpublished
  router work of Sets 105, 107, 109, 110 and 111.
- The extension **`0.50.0`** (Marketplace) — also carries Set 110's
  native-tree Work Explorer, staged as `0.49.0` and never published.

They are a matched pair: this extension offers no way to create a spec
this router would refuse.

- [ ] **Publish both** (tag + both workflows)
- [ ] **Router only** — leaves a window where the live extension still
      teaches the tier
- [ ] **Hold both**

### C. Send the consumer notice?

`docs/cross-repo-lightweight-removal-notice.md` is written and ready. Its
one real audience is **`dabbler-homehealthcare-accessdb`**, which ran on
the Lightweight tier. Sending it is yours — this repo does not edit
consumer repos.

- [ ] **Send it before publishing** — they are warned first
- [ ] **Send it after publishing**
- [ ] **Hold** — that repo is dormant

---

## If something looks wrong

Say so plainly and stop. A "looks off" on any Look item is worth more
than a completed checklist — ten minutes of your attention exists to
catch what automation cannot see.
