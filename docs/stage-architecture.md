# Offline stage and image-batch architecture

The `stage-contracts.mjs` module defines a versioned, JSON-safe boundary for production stages. It does not replace the existing schema-v1 episode manifest or `production-state.mjs`; it provides additive request/result/artifact/capability records that can be bridged by later adapters.

`stage-registry.mjs` stores explicitly registered `(stage, provider)` adapters. `stage-runner.mjs` separates capability checks and offline preparation/estimation from `execute`. Execution requires consent bound to the exact request hash. Missing capabilities and providers fail closed, and there is no automatic Flow/Cloudflare/manual fallback.

`continuity-refs.mjs` accepts only approved, project-relative references with SHA-256 content hashes. A frozen bundle includes the series and bible revision plus character, prop, environment, and style references. Every image batch item stores the same bundle hash and reference IDs. Replacing a reference makes an existing bundle stale.

`image-batch-contract.mjs` plans any positive number of ordered scenes and variants. Each item has stable IDs, an idempotency key, request/dependency/reference hashes, provider/model metadata, and an independent status. Resume queues only explicitly selected failed or needs-review items; succeeded and approved outputs are immutable. This is the durable contract later providers must honor, whether they use native batch APIs or a bounded single-image queue.

All current tests are synthetic and offline. No provider call, media generation, credit spend, Boords mutation, or publication is part of this implementation.
