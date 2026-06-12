```json
{"verdict":"VERIFIED","issues":[]}
```

Fix confirmed. `setupVerification` now fail-loud inspects `activity-log.json` for any existing `entries` and refuses rewrites on unreadable/shapeless logs or any recorded history, while `verificationModeRecordExists` remains the narrower tolerant Python-parity helper. No regression found in the modified scope.