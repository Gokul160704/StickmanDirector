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
requires explicit live authorization, `CLOUDFLARE_ACCOUNT_ID`, and
`CLOUDFLARE_API_TOKEN`; credentials are passed only to the injected transport,
are never persisted, and are never included in receipts.

The adapter fails closed for unsupported models, more than four references,
reference images at or above 512x512, non-16:9 dimensions, stale reference
bundles, insufficient budget, missing credentials, and changed provider/model
identity. Mock outputs remain `needs-review`; no generated image is accepted or
published automatically. Flow watermark and provenance rules are unchanged.

## Verification classification

The implementation and tests are **offline/mock verified**. No Cloudflare
account diagnostic, live inference, credit/neuron spending, media generation,
provider switch, or publication was run for this change.
