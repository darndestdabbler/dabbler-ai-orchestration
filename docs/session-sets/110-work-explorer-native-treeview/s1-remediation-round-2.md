# S1 remediation — round 2 (close-backstop findings)

Against the three Major findings the close backstop raised in round 4
([`s1-issues-round-4.json`](s1-issues-round-4.json)) after round 3's
remediation-review had returned VERIFIED.

**All three accepted. None disputed.** The backstop reviewed the whole session
diff rather than the fix delta, which is exactly why it caught what the
narrower review could not.

---

## F5 — three of the four required startup buckets were never measured

> *"Step 3 requires separate measurement of extension activation, host-side
> scan / model assembly, `resolveWebviewView`, and webview cold start to first
> paint. The session explicitly reports activation, `resolveWebviewView`, and
> first paint as unmeasured and defers them to S4. … the session already used a
> real Extension Development Host for the API spikes, so requiring
> extension-host measurement is not out of reach."*

**Accepted.** The objection is correct on both counts: the missing buckets were
precisely the ones a webview→TreeView migration can *change*, and the claim
that they were unreachable was overstated by a session that had a real host
running minutes earlier.

**Fix** — new harness
[`scripts/activation-harness.ts`](../../../tools/dabbler-ai-orchestration/scripts/activation-harness.ts),
raw output [`s1-activation-measurements.json`](s1-activation-measurements.json):

| bucket | result |
| --- | --- |
| `activate()` | **338.8 ms** median (307–402, n=5) |
| `resolveWebviewView()` | **0.1 ms** median |
| renderer payload | **110,376 B** JS/CSS + 643 B HTML |
| renderer first paint | still unmeasured — needs a renderer; Layer 3, S4 |

Three findings follow, two of which cut against the earlier draft:

1. **The host half of the webview is already free** (0.1 ms). The migration
   saves nothing there, so any startup win must come from the renderer.
2. **The renderer payload is the real prize** — ~110 KB of script and CSS the
   migration deletes outright. Credible first-paint win; **not** claimed as a
   measured one.
3. **`activate()` at ~339 ms dwarfs the ~124 ms pipeline**, leaving ~215 ms this
   session did not decompose. Named rather than attributed.

Measured under the vscode stub, in-process — real for the extension's own
synchronous work, excluding host startup and all renderer cost. The exclusion
is stated in the harness header, in the JSON, and in the document.

**Bucket count: 3 of 4 measured, 4th quantified in bytes.** Was 1 of 4.

---

## F6 — the withdrawn over-claim survived in multiple authoritative echoes

> *"S4 follows the explicit plan-adjustment directive and reports startup as
> unchanged regardless of its measurements. … The mandatory §5 instruction
> directly contradicts that correction."*

**Accepted, and this one is embarrassing in a useful way.** Round 1's
remediation fixed §2 and left four contradicting echoes elsewhere — including a
**mandatory** §5 instruction ordering S4 to report a specific result. A
document that says "unknown, go measure" in one section and "report unchanged"
in another has not withdrawn anything; it has just buried the claim deeper.

This is **L-065-1** (*propagate a consistency fix to every echo before
re-verifying*) — a lesson **this session cited in its own close-out commit**
while the echoes were still live. Citing a lesson is not applying it.

**Fix** — all four rewritten:

| location | was | now |
| --- | --- | --- |
| opening verdict block | "the migration does **not** fix the symptom" | "the pitch does not hold *as stated*"; effect on perceived startup "unknown and unmeasured" |
| §1 agreement list | "the performance case is not real" | "does not hold as pitched", noting the panel reasoned about the floor, not activation |
| §2 heading | "The performance case is false" | "The startup floor is real and immovable" |
| §5 S4 directive | "**must report empty-startup as unchanged**" | "**must report what it measures**", in both directions, quantifying an improvement if there is one |

Also rewritten: the §1 counter-argument paragraph, which had claimed "the scan
**is** essentially the whole cost" — true of an empty tree, false of
`activate()`. It now says so precisely and explicitly warns against
re-smuggling the performance claim as a payload-size insinuation.

Verified by grep: no categorical total-startup claim remains.

---

## F7 — the before/after was never produced, and the operator confirmed a mapping that later changed

> *"Step 5 requires putting the trade to the operator with a rendered
> before/after of a real row carrying several markers … The operator decision
> predates material changes to what the row displays and how actions are
> exposed."*

**Accepted on both halves.**

**Fix, part 1 — the before now exists.** The shipping extension was compiled
and run in an Extension Development Host against this repo, and its Work
Explorer captured:
[`00-BEFORE-current-webview-renderer.png`](s1-spike-evidence/00-BEFORE-current-webview-renderer.png).

**Producing it surfaced a platform consequence no earlier spike had found, and
it is bigger than the fraction:** the current webview **wraps** long set names
across up to three lines, so a set name is never hidden. A `TreeView` row
cannot wrap — it truncates. That applies to **every** set name, not to one
optional field, and the session had been reasoning about density without it.

| | today (webview) | native |
| --- | --- | --- |
| long set name | wraps to 3 lines, always readable | truncates, full name in tooltip |
| date / UAT status | inline after the name | tooltip |
| vertical cost | ~3 lines per in-progress set | 1 line per set |

**Fix, part 2 — a second operator confirmation, covering the final mapping.**
Put to the operator with the before/after and the three options (accept
truncation / shorten the rendered label / stop the migration). **Decision:
accept truncation**, for roughly three times the sets per screen, keeping the
numeric prefix so the left edge stays scannable.

This confirmation postdates the icon precedence table and the two-action inline
cap, so the operator-confirmed mapping is now the **final** one — which is what
the spec's *Ends with* actually required and what the first confirmation could
not have covered.

---

## Files changed in this remediation

| file | change |
| --- | --- |
| `tools/dabbler-ai-orchestration/scripts/activation-harness.ts` | new — activation / view-resolution / payload harness |
| `s1-activation-measurements.json` | new — raw output |
| `s1-migration-decision.md` | §2 new measured-buckets section + reconciled measured/unknown table; four over-claim echoes rewritten; §4 before/after, wrap-vs-truncate consequence, second operator confirmation; verdict block; residuals; round-4 record |
| `s1-spike-evidence/00-BEFORE-current-webview-renderer.png` | new — the shipping renderer |

No product code changed. The extension was compiled to run it, but nothing
under `src/` was modified.

---

## A note on why this round happened at all

Round 3's remediation-review returned VERIFIED because it reviews the **fix
delta**, and the fixes were locally correct. The close backstop reviews the
**whole session** against the spec, and that is what caught an unmeasured
deliverable, a set of surviving echoes, and a missing before/after.

Both reviews were behaving correctly. The lesson worth carrying is that a green
fix-delta review is not evidence the session satisfied its spec — and that
citing L-065-1 in a commit message is not the same as running the grep it tells
you to run.
