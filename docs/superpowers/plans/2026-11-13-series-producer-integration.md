# Multi-episode Guided Producer Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline-safe, opt-in multi-episode Guided Producer that pins series continuity and approvals per episode while preserving the existing still-image pipeline.

**Architecture:** Build a small series orchestration module around the existing series-bible, producer-session, durable production-state, episode-manifest, safe-framing, image-count, and manual Boords handoff APIs. The module owns episode-local session/manifest metadata, dependency hashes, predecessor validation, resume/recovery, and explicit approval invalidation; it never calls providers or writes remote Boords content.

**Tech Stack:** Node.js ESM, `node:test`, existing schema-v1 manifest/state modules, local FFmpeg/FFprobe.

**Spec:** Trello card `[P1][Chief→Worker] Multi-episode Producer and Boords continuity integration` at `https://trello.com/c/y3iM5QTY`.

## Global Constraints

- Series mode is opt-in; default proposal is 3 episodes and custom counts are positive integers.
- Each episode remains independently renderable at `episodes/<episodeId>/episode.json`; legacy root `episode.json` remains compatible.
- Approved revisions and episode approvals are immutable and revision-bound; changed dependencies invalidate only affected future work.
- Missing/mismatched references, predecessor cycles/order errors, unsafe paths, unavailable Boords, or changed narrator/style/model fail closed.
- Flow remains still-image-only 16:9; no provider calls, spending, publication, or media generation occur in tests.
- Manual agent invocation, claim/readback, independent review, hosted CI, merge authorization, and human creative approval remain separate gates.

## Review Focus

- Resuming episode 2 must not overwrite episode 1 or carry its approval — test separate files and bindings.
- A changed bible/reference/narrator/safe-framing/image-count dependency must invalidate downstream approvals — test exact hash changes.
- Missing or unsafe references and wrong predecessor order must fail closed — test negative validation.
- Offline Boords handoff must be deterministic and non-remote — test its payload and provider-call absence.
- Legacy manifests and 8/36-scene render paths must remain valid — run existing suite and offline FFprobe regression.

### Task 1: Series session and continuity orchestration

**Files:**
- Create: `scripts/series-producer.mjs`
- Test: `tests/series-producer.test.mjs`

**Interfaces:**
- Consumes: `series-bible.mjs`, `producer-session.mjs`, `production-state.mjs`, `episode-manifest.mjs`, `safe-framing.mjs`, `image-count-planner.mjs`.
- Produces: `createSeriesProducer`, `planSeriesEpisodes`, `resumeSeriesProducer`, `approveEpisodePlan`, `reconcileSeriesDependencies`, `createEpisodeManifestMetadata`.

- [ ] Write failing tests for default/custom episode counts, separate episode directories/manifests, predecessor validation, pinned revision/reference hashes, and fail-closed missing/mismatched dependencies.
- [ ] Run the focused tests and observe expected missing-module failures.
- [ ] Implement the smallest JSON-safe orchestration API with deterministic dependency hashes and no provider imports.
- [ ] Run focused tests, then the full npm suite.

### Task 2: Revision-bound approvals, resume, and manual Boords handoff

**Files:**
- Modify: `scripts/series-producer.mjs`, `scripts/boords-handoff.mjs`, `scripts/producer-cli.mjs`
- Test: `tests/series-producer.test.mjs`
- Modify: `docs/producer-guide.md`, `docs/series-foundation.md`

**Interfaces:**
- Consumes: Task 1 series producer API and existing manual `createBoordsHandoff` contract.
- Produces: explicit per-episode approval/reapproval/invalidation, bounded resume/recovery, and deterministic per-episode manual handoff files.

- [ ] Add failing tests for approval binding changes, narrator/style drift, interrupted resume, idempotent retries, inaccessible Boords, safe framing, and no-spend behavior.
- [ ] Run focused tests and observe each intended gate failure.
- [ ] Implement explicit approval records bound to current hashes; preserve previous episodes and never silently rewrite or approve.
- [ ] Add CLI/manual documentation without changing automatic invocation behavior.
- [ ] Run focused and full tests.

### Task 3: Offline FFmpeg regression and handoff evidence

**Files:**
- Test: `tests/series-producer.test.mjs` and existing render tests as needed
- Modify: `docs/producer-guide.md`

- [ ] Add an offline synthetic multi-episode render assertion for 16:9, 1920x1080, 30fps, H.264/AAC, and valid SRT ranges.
- [ ] Run `npm ci`, `npm test`, focused series tests, `npm run validate:episode` against legacy fixtures, `git diff --check`, and the offline FFprobe command.
- [ ] Record exact test counts, unrun provider/creative gates, branch/SHA, and PR handoff evidence.

