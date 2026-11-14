# Offline batch image workflow

`scripts/image-batch-runner.mjs` is the provider-neutral execution layer for
schema-v1 still-image batches. It consumes an existing `createBatchPlan()` and a
frozen continuity bundle; it does not create references, call a provider by
default, or approve media.

Each item retains its stable scene/variant identity, request and idempotency
hashes, attempt IDs, provider receipt, cost, output SHA-256, provenance, and
human review state. Checkpoints are written after every state transition. A
confirmed provider failure is retryable only when explicitly selected. A timeout
or other ambiguous result is `unknown` and requires provider read-back through
`reconcile()` before a retry can be queued.

`maxCost` is a hard batch cap. The runner prepares the selected provider once,
rejects an over-budget quote before dispatch, and never falls back to another
provider. `concurrency` is bounded and deterministic. Existing output paths and
symlinks are rejected; approved items cannot be overwritten. Generated items
remain `needs-review` until a human approval record is supplied with
`approve()`.

The runner is intentionally offline-friendly: tests use a synthetic adapter and
no Flow, Cloudflare, Gemini, Boords, credentials, credits, neurons, publication,
or network calls. Provider adapters must separately enforce their own current
capabilities, licensing, quote, and live-consent rules before any real request.
