# Reference seeding

Reference seeding is an explicit, review-gated bootstrap stage for creating candidate continuity assets with Cloudflare Workers AI. It is deliberately separate from the locked scene-batch contract.

## Contract

- `createReferenceSeedPlan` requires a valid 16:9 output from 256 through 1920 pixels, distinct role prompts, deterministic request hashes, and at most four hash-verified input candidates.
- Input candidates are consented, license-labelled, smaller than 512×512, and re-hashed from disk before preparation and live dispatch.
- `createCloudflareWorkersAiReferenceSeedAdapter` supports `mock` by default. Live mode requires the exact model, fresh quote and authorization hashes, verified quota, explicit no-paid-overage approval, and scoped credentials.
- `createReferenceSeedRunner` persists per-item checkpoints, bounds concurrency, refuses output collisions, records receipts and hashes, and preserves ambiguous provider outcomes as `unknown` until reconciled.
- Every generated candidate remains `needs-review`. Only a human approval bound to the output SHA-256 can promote it into the continuity registry. Promotion does not itself freeze a four-kind scene bundle.

The existing scene path continues to require an authentic frozen character/prop/environment/style bundle. Reference seeding must never be implemented by bypassing that assertion or by treating a candidate as approved.

## Live-test reminder

The development test suite uses only the mock adapter. A future live run must re-read the current model capability, quote the exact prompts/dimensions/input hashes, verify current free quota and licensing, obtain owner approval for that exact quote, and reconcile any ambiguous request before retrying. The historical 94.26-neuron estimate is not reusable authorization.
