# Watermark-Safe Image Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize safe-framing guidance and non-destructive 16:9 geometry previews for future still-image prompts while preserving originals, provenance, approvals, and legacy manifests.

**Architecture:** A pure `safe-framing.mjs` owns profile normalization, protected-region math, prompt composition, landmark collision warnings, and read-only source ROI previews. Prompt-pack generation consumes the shared composer for canonical and legacy inputs; optional manifest/session/handoff metadata carries the profile and dependency hash. Existing runtime and durable-state hashes are extended only where needed to bind framing changes to consent.

**Tech Stack:** Node.js ESM, built-in `node:test`, SHA-256 dependency hashes, existing Flow contracts, schema-v1 manifests, offline FFmpeg/FFprobe tests.

**Spec:** Trello card https://trello.com/c/KpPY42aM/16-p1chief%E2%86%92worker-add-watermark-safe-image-composition-and-169-crop-planning

## Global Constraints

- Default profile `safe-framing-v1`: left 0.04, top 0.04, right 0.08, bottom 0.10; target `16:9`.
- Prompt guidance is a composition heuristic, not a watermark-position guarantee.
- No watermark removal, masking, generative inpainting, logo erasure, provenance stripping, destructive crop, provider call, media generation, or accepted Type II asset mutation.
- Existing schema-v1 manifests, 0.03 legacy asset-ratio tolerance, still-only Flow contracts, receipts, originals, and approval gates remain compatible.
- All profile and geometry APIs are pure/no-write/no-network and fail closed on invalid bounds or geometry.

## Review Focus

- Unequal right/bottom trims on an exact 16:9 source must report an aspect mismatch; test geometry preview.
- Margins summing to 1 or containing NaN/negative/out-of-range values must fail with the profile context; test profile validation.
- Landmarks outside the protected rectangle produce warnings, not false semantic detection or silent movement; test collision reporting.
- Legacy prompt JSON and reference prompts receive guidance without emitting video instructions; test prompt-pack compatibility.
- Profile/prompt/model/reference changes alter the effective hash and invalidate consent; test runtime/session/state binding.

### Task 1: Pure safe-framing module

**Files:**
- Create: `scripts/safe-framing.mjs`
- Create: `tests/safe-framing.test.mjs`

**Interfaces:**
- `normalizeSafeFramingProfile(profile?) -> profile` validates margins, target ratio, protected rectangle, version, and returns a deterministic hash.
- `composeImagePrompt(scene, profile?, references?, kind?) -> { prompt, profile, profileHash, protectedRegion, kind }` preserves scene/style/reference text and appends centralized safe guidance.
- `previewImageGeometry({ width, height, profile?, landmarks?, cropMargins? }) -> preview` returns source/target aspect, centered legal 16:9 ROI, pixel protected bounds, collision warnings, and preview-only flags.

- [x] Write tests for defaults, valid overrides, invalid margins, prompt composition, landmark collisions, arbitrary source dimensions, exact 16:9 geometry, and unequal-trim warnings.
- [x] Run the focused suite against the pre-existing local module and observe integration failures before wiring the contracts.
- [x] Complete the pure module with no filesystem/network/media operations and no watermark-specific transformation code.
- [x] Run the focused suite and full suite.

### Task 2: Central prompt-pack integration

**Files:**
- Modify: `scripts/build-flow-prompt-pack.mjs`
- Test: `tests/flow-prompt-pack.test.mjs`

- [x] Add tests proving canonical scenes, legacy scenes, and character/prop/environment reference prompts contain deterministic guidance while retaining continuity text and excluding video/watermark-removal instructions.
- [x] Route all applicable prompt paths through `composeImagePrompt`; preserve legacy structure and still-only wording.
- [x] Run focused prompt-pack tests.

### Task 3: Additive manifest/session/Boords metadata

**Files:**
- Modify: `scripts/episode-manifest.mjs`
- Modify: `scripts/producer-session.mjs`
- Modify: `scripts/producer-contract.mjs` only if validation is required
- Modify: `scripts/boords-handoff.mjs`
- Test: corresponding existing suites

- [x] Add tests for optional safe-framing profile/version, per-scene overrides, session save/resume, explicit invalidation after profile edits, and manual Boords preview metadata.
- [x] Implement optional fields with strict normalized validation and no changes to old manifests or approved frame sources.
- [x] Run focused and full suites.

### Task 4: Approval/provenance dependency binding

**Files:**
- Modify: `scripts/runtime-contracts.mjs`
- Modify: `scripts/production-state.mjs` only if the existing APIs cannot carry the effective framing hash
- Test: `tests/runtime-contracts.test.mjs`, `tests/production-state.test.mjs`

- [x] Add tests proving a changed framing profile hash rejects old Flow approval and a session profile edit invalidates storyboard/downstream approval state.
- [x] Implement the additive Flow approval hash binding and preserve existing quote, retry, read-back, and still-only checks.
- [x] Run focused suites.

### Task 5: Documentation and integrated verification

**Files:**
- Modify: `docs/producer-guide.md`
- Modify: `docs/production-contracts.md`
- Modify: `docs/google-flow-mcp.md`
- Test: `tests/asset-validation.test.mjs`, `tests/producer-e2e.test.mjs`, `tests/e2e-render.test.mjs`

- [x] Document the heuristic/non-guarantee boundary, preview-only crop math, provider-policy restriction, and provenance preservation.
- [x] Run `npm ci`, `npm test`, all mandatory focused suites, `git diff --check`, and synthetic FFmpeg/FFprobe verification through the offline render suites.
- [ ] Commit, push, create a scoped PR to `master`, record exact SHA/CI/tests/limitations in Trello, and hand the card to Chief in `In Review`; do not self-merge or mark Done.
