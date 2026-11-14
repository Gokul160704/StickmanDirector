# Cross-provider batch and watermark audit

`scripts/cross-provider-audit.mjs` is a local, offline audit tool for comparing
Flow and Cloudflare batch metadata without calling either provider. It creates
deterministic 8- and 36-shot fixtures, pins the same reference bundle and
prompt hashes, records both provider identities without automatic substitution,
and leaves every shot in `needs-review`. Checksums and synthetic timing are
reproducibility aids, not visual identity scores; character, wardrobe, prop,
palette, composition, text, and continuity decisions require human labels.

The report preserves per-shot original hashes, reference hashes, provider/model
identity, license labels, cost/usage observations, review state, and explicit
`NOT RUN` live-verification status. `invalidateDownstreamApproval` marks only
dependent downstream work `needs-review` when provider, model, reference, or
dependency identity changes; earlier originals and unrelated research/bible
records remain untouched.

## Watermark and framing policy

`auditWatermarkProvenance` compares the original, FFprobe visual input, and
rendered output hashes and dimensions. A Flow source with a visible watermark is
reported as preserved; the tool rejects an applied crop in this audit and never
claims watermark removal. Existing `safe-framing.mjs` remains a geometry-only
preview (`cropPreview.applied=false`).

`prepareNonDestructiveLetterbox` is restricted to a separately approved,
unwatermarked source with rights approval. It writes a new file, refuses to
overwrite, preserves the original hash, and validates a 1920x1080 result with
FFprobe. The FFmpeg transform uses `scale=1920:1080:force_original_aspect_ratio=decrease`
followed by centered `pad=1920:1080`; this preserves aspect ratio and adds
letterbox space rather than cropping narrative content. No watermark-removal or
concealment operation exists.

## Evidence classification

The benchmark and quality report are **offline-synthetic**. Real Flow/Cloudflare
latency, quota, credits, provider quality, and live usage remain **NOT RUN** and
require separate owner approval per batch. FFmpeg/FFprobe synthetic E2E is run
locally; generated fixtures and audit artifacts are not production media.
