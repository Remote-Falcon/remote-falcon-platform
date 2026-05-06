# Captured FPP Plugin Request Fixtures

This directory holds JSON request/response payloads captured from real FPP plugin
versions, used by `tests/contract/PluginsApiContractTest.java` to verify
plugins-api accepts requests from existing customer plugin versions.

## Layout (Sprint 3 will populate)

```
plugin-requests/
  addSequenceToQueue/
    plugin-v3.2-request.json
    plugin-v3.5-request.json
    response-success.json
    response-already-requested.json
  voteForSequence/
    plugin-v3.2-request.json
    response-success.json
    ...
```

## Capture procedure (Sprint 3)

1. Identify the plugin versions in active use via PostHog `$plugin_version` property
   on `$ai_generation` or `request` events, OR via control-panel access logs.
2. For each version, capture a representative request payload from production
   logs (stripping any PII).
3. Save as `<endpoint>/<version>-request.json` and `<endpoint>/<version>-response.json`
   pairs.
4. Reference from `PluginsApiContractTest.java` — load each pair, post to the running
   testcontainers plugins-api, assert response matches.

See [PHASE-C-KICKOFF.md § 9](../../docs/PHASE-C-KICKOFF.md) Sprint 3 plan for
full details.
