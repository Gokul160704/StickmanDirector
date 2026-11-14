# Stage and Batch Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add additive, offline-safe contracts for swappable production stages, provider capabilities, resumable image batches, and hash-pinned continuity references without changing the schema-v1 manifest or invoking providers.

**Architecture:** Pure JSON-safe constructors and validators define versioned stage, artifact, capability, batch, and continuity records. A registry selects explicitly registered providers without fallback; a runner separates prepare/estimate from consent-bound execute. Batch planning freezes one approved reference bundle into every ordered item and supports resumable per-item state.

**Tech Stack:** Node.js 20+ ESM, built-in `node:test`, SHA-256 via `node:crypto`, existing schema-v1/production-state conventions.

**Spec:** Trello card #22, “Decouple production stages and define batch/continuity contracts,” and its Chief handoff at https://trello.com/c/9iKod1pd.

## Global Constraints

- No provider calls, media generation, credits/billing, Boords mutation, publication, or automatic agent dispatch.
- Preserve existing schema-v1 episode manifests and still-image-only Flow behavior.
- No automatic provider fallback; provider changes invalidate downstream image/QA/render approvals.
- Support 1, 3, 8, 36, 100+ ordered images and N variants without a hardcoded scene count.
- Seed is a reproducibility hint, never proof of visual identity.
- Preserve original outputs and watermark/provenance; no crop, mask, concealment, or destructive overwrite.

## Review Focus

- Malformed or path-traversing reference assets must fail before planning; test in the continuity task.
- Duplicate scene/variant identities and non-positive counts must fail deterministically; test in the batch task.
- Known succeeded items must never be re-queued on resume; test in the batch task.
- Missing consent or changed provider capabilities must block execution with zero adapter calls; test in the runner task.
- Legacy schema-v1 behavior must remain unchanged; test through the existing suite and manifest validation.

### Task 1: Versioned stage contracts and registry

**Files:**
- Create: `scripts/stage-contracts.mjs`
- Create: `scripts/stage-registry.mjs`
- Test: `tests/stage-contracts.test.mjs`

- [ ] Write RED tests for versioned stage/request/result/artifact/capability records, deterministic hashes, registry duplicate rejection, and explicit provider lookup.
- [ ] Run `node --test tests/stage-contracts.test.mjs` and observe missing-module failure.
- [ ] Implement JSON-safe constructors and a registry with no implicit fallback.
- [ ] Re-run the focused tests and then the full suite.

### Task 2: Approval-bound stage runner

**Files:**
- Create: `scripts/stage-runner.mjs`
- Test: `tests/stage-runner.test.mjs`

- [ ] Write RED tests for side-effect-free prepare/estimate, explicit consent for execute, capability rejection, and provider-independent verify/reconcile.
- [ ] Run the focused tests and observe the intended missing-module failure.
- [ ] Implement the minimal runner over the registry and adapter contract.
- [ ] Re-run focused and full tests.

### Task 3: Batch and continuity contracts

**Files:**
- Create: `scripts/image-batch-contract.mjs`
- Create: `scripts/continuity-refs.mjs`
- Test: `tests/image-batch-contract.test.mjs`
- Test: `tests/continuity-refs.test.mjs`

- [ ] Write RED tests for 1/3/8/36/100+ planning, variants, immutable reference hashes, safe reference paths, stale references, resume after item 19, retry selection, and output preservation.
- [ ] Run focused tests and observe intended missing-module failures.
- [ ] Implement deterministic batch IDs/idempotency keys, per-item state, frozen continuity bundles, and fail-closed resume/retry helpers.
- [ ] Re-run focused and full tests.

### Task 4: Documentation and verification handoff

**Files:**
- Create: `docs/stage-architecture.md`
- Modify: none unless required by tests.

- [ ] Document contracts, provider boundaries, resume semantics, approval invalidation, and no-spend behavior.
- [ ] Run `npm ci`, `npm test`, `npm run validate:episode -- templates/series-project/episode.json`, and `git diff --check`.
- [ ] Verify no provider/network imports or generated media were added, commit, push, open PR to `master`, and hand exact head to independent Chief.

