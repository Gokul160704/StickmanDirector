# Cloudflare Workers AI image provider

This repository contains an offline-safe, opt-in adapter at
`scripts/providers/cloudflare-workers-ai.mjs`. It is additive: Google Flow and
manual imports remain separate provider choices, and no provider is selected as
an automatic fallback.

## Current official capability evidence

The 2026-11-14 readiness audit used the current Cloudflare documentation through
Context7. The selected consistency candidate is
`@cf/black-forest-labs/flux-2-klein-4b`:

- `prompt` is required; `width`, `height`, `seed`, and `guidance` are optional.
- Width and height are supported from 256 through 1920 pixels.
- Inference steps are fixed at four.
- Up to four binary reference inputs are accepted as `input_image_0` through
  `input_image_3`; each must be smaller than 512x512.
- The adapter treats a seed as a reproducibility hint, never as proof of
  character identity.

Cloudflare's Async Batch API documents a payload limit below 10 MB and a model
catalog for batch-capable models, but the current evidence does not establish
that this image model is batch-capable. The adapter therefore uses the merged
provider-neutral `image-batch-runner.mjs` with bounded client-side fanout. It
must not switch to native Async Batch without a model-specific capability check.

The current pricing evidence records 10,000 free neurons per day, daily reset at
00:00 UTC, and `$0.011 / 1,000 neurons` above the free allocation on Workers
Paid. The adapter estimates FLUX.2 klein 4B at 5.37 neurons per input 512x512
tile and 26.05 neurons per output 512x512 tile. Estimates are hard budget
guards, not a promise of account entitlement.

## Safety and authorization

Import, capability inspection, planning, quoting, and tests make no network
calls and require no credentials. Execution requires a fresh provider-specific
authorization bound to the exact quote and request hash. Live mode additionally
requires explicit live authorization, verified remaining-neuron evidence,
`CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN`; credentials are passed
only to the injected transport, are never persisted, and are redacted from
ambiguous transport errors.

The live transport receives the approved prompt text and a multipart `FormData`
payload containing `input_image_0` through `input_image_3`, read from the
hash-verified local reference files. Responses are normalized through
`scripts/provider-response-normalization.mjs` using an explicit model route:
FLUX JSON/base64, SDXL and Leonardo binary streams, and supported MCP image
content blocks. The normalizer preserves original bytes, derives PNG/JPEG/WebP
format from magic bytes, verifies raster dimensions and SHA-256, and rejects
empty, truncated, unknown, or ambiguous payloads. The batch runner writes the
verified bytes through a temporary file and rename, refuses collisions, and
writes a sidecar receipt without embedding image base64.

Usage is recorded as `reported` only when the provider returns per-request
neurons. Missing usage is `unreported`/provisional, while an aggregate
dashboard total is `unknown` for per-image attribution; neither is silently
converted to zero. A transport failure after dispatch, failed persistence, or
missing receipt is an unknown outcome requiring reconciliation before retry.

The adapter fails closed for unsupported models, more than four references,
missing reference dimensions or current-byte verification, reference images at
or above 512x512, non-16:9 dimensions, stale reference bundles, insufficient
budget or verified remaining quota, missing credentials, and changed
provider/model identity. The runner materializes returned bytes exclusively at
the declared path and verifies the written hash. Mock outputs remain
`needs-review`; no generated image is accepted or published automatically.
Flow watermark and provenance rules are unchanged.

Live approval must also explicitly set `paidOverageAllowed: false` and bind a
valid quote hash, approval ID, and verified remaining quota. A `$0.00 per-step`
catalog value does not override the account's daily neuron limit.

## Verification classification

The implementation and tests are **offline/mock verified**. No Cloudflare
account diagnostic, live inference, credit/neuron spending, media generation,
provider switch, or publication was run for this change.
