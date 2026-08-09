# Probe evidence — the gate that cleared Set 112

`probe-evidence-copilot-catalog.lock` is the preserved seat-catalog probe that
satisfied this set's evidence gate: a real Copilot seat confirms **three**
provider families, so excluding any orchestrator's family still leaves two
independent verifier families. That is the whole argument for deleting the
Lightweight tier — the Full tier's cross-provider guarantee holds on a seat
with no provider API keys.

## What the artifact says

| field | value |
| :--- | :--- |
| `meta.probed_at` | `2026-08-05T13:34:12Z` |
| `meta.source` | `empirical-probe` |
| `meta.cli_version` | `GitHub Copilot CLI 1.0.78.` |
| `meta.seat_id` / `seat_label` | `op-personal` / `operator-personal` |
| models | 18 known ids, **11 confirmed** |
| confirmed providers | `anthropic`, `google`, `openai` |

Reproduce the counts without trusting this note:

```powershell
.venv\Scripts\python.exe -c "import tomllib; d=tomllib.load(open('docs/session-sets/112-remove-lightweight-tier/probe-evidence-copilot-catalog.lock','rb')); c=[m for m in d['models'] if m['enablement']=='confirmed']; print(len(c), '/', len(d['models']), sorted({m['provider'] for m in c}))"
```

## Provenance — why this copy and not `D:\copilot-catalog.lock`

The spec and the reservation doc both point at `D:\copilot-catalog.lock`, the
operator's preserved copy of the 2026-08-05 probe. This session ran on a
machine with **no `D:` volume**, so that path could not be read. The copy
archived here is `ai_router/copilot-catalog.lock` from the repo working tree —
gitignored, and therefore not otherwise durable — and it is the **same probe
run**: identical `probed_at` timestamp, identical CLI version, and the exact
`11/18 confirmed, providers=['anthropic', 'google', 'openai']` result the
reservation doc quotes.

The one field that reads differently from the reservation doc's narrative is
`seat_label = "operator-personal"`, where the doc describes the run as being on
an enterprise seat. The probe writes whatever `--seat-id` / `--seat-label` the
operator passed; the label is an operator-assigned string, not a measured
property of the seat. The measured content — three provider families on a
keyless Copilot seat — is what the gate turns on, and it is unambiguous here.
The label discrepancy is recorded rather than resolved, because re-running the
probe is explicitly not a blocker for this set (spec, *Decisions already made*,
item 1).

Decision journal: `decisions.jsonl`, `probe-evidence-source`.
