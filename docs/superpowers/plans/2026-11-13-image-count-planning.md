# Recommended/Custom Image-Count Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic recommended/custom still-image shot planning to the Guided Producer while preserving schema-v1 episodes, existing timing, approval safety, and offline-only execution.

**Architecture:** A pure `image-count-planner.mjs` computes beat allocations and 30fps shot timelines without I/O. Guided Producer stores validated count/pacing preferences and an optional plan; manifest and Boords adapters consume the plan additively. Production-state dependency reconciliation remains the authority for invalidating downstream approvals when planning inputs change.

**Tech Stack:** Node.js ESM, built-in `node:test`, schema-v1 JSON manifests, existing `producer-contract`, `producer-session`, `production-state`, `episode-manifest`, and Boords handoff modules.

**Spec:** Trello card https://trello.com/c/RCHdaXfn/15-p1worker-implement-recommended-custom-still-image-count-and-shot-planning

## Global Constraints

- No Flow, Gemini, Boords, network, provider, media, credit, publication, or automatic-agent calls.
- Keep `episode.json` as the only canonical episode manifest and keep `schemaVersion=1`.
- Preserve existing 5-scene, 8-scene, and 36-scene behavior and accepted Type II assets.
- Custom counts must be exact when feasible; never silently merge essential beats or change an impractical request.
- Use integer 30fps frames and clause/phrase boundaries; no mid-word cuts.
- New manifest planning metadata remains optional and additive.

## Review Focus

- Custom count below essential beats must fail closed rather than merge beats; test in the planner suite.
- Floating-point durations must produce a timeline whose frame totals differ from narration by at most one frame; test in the planner suite.
- Legacy sessions/manifests without planning fields must resume and validate unchanged; test in contract and manifest suites.
- A changed plan must invalidate downstream approvals without removing originals or receipts; test in production-state/session suites.
- Boords output must be a manual proposed handoff with one stable frame per planned shot and no live mutation; test in the handoff suite.

### Task 1: Deterministic planner

**Files:**
- Create: `scripts/image-count-planner.mjs`
- Create: `tests/image-count-planner.test.mjs`

**Interfaces:**
- Consumes beats with `id`, `startSeconds`, `endSeconds`, optional `essential`, `complexity`, `emotionalHold`, and `phraseBoundaries`; pace; optional `durationSeconds`; optional custom count.
- Produces `{ mode, pace, recommendedCount, requestedCount, shots, rationale, timingSource, version }`, where each shot has stable `sceneId`, `storyBeatId`, integer `startFrame`, `endFrame`, `durationFrames`, and a unique `imageSlot`.

- [ ] Write failing tests for each pace’s recommendation, deterministic allocation, exact custom counts, stable IDs, rationale, 30fps frame tolerance, phrase-boundary snapping, invalid counts, and essential-beat underflow.
- [ ] Run `node --test tests/image-count-planner.test.mjs` and verify the failures are caused by the missing module/behavior.
- [ ] Implement validation, hold-length heuristics (4.5/3.0/2.2 seconds), largest-remainder allocation, deterministic tie-breaking, exact custom allocation, and fail-closed errors.
- [ ] Run the focused planner suite and then the full suite.

### Task 2: Guided Producer preferences and persistence

**Files:**
- Modify: `scripts/producer-session.mjs`
- Modify: `scripts/producer-contract.mjs`
- Test: `tests/producer-session.test.mjs`, `tests/producer-contract.test.mjs`

**Interfaces:**
- Add guided questions `imageCountMode`, `pace`, and `customImageCount` with validation; keep old sessions valid.
- Add a side-effect-free planning entry point that stores the planner result and invalidates storyboard and later approvals when planning inputs change.

- [ ] Add failing tests for recommended/custom choices, reflective/cinematic/energetic choices, positive integer validation, save/resume, and explicit invalidation.
- [ ] Run focused tests and verify red.
- [ ] Implement additive session fields and planner integration without provider calls.
- [ ] Run focused and full suites.

### Task 3: Manifest and Boords additive adapters

**Files:**
- Modify: `scripts/episode-manifest.mjs`
- Modify: `scripts/boords-handoff.mjs`
- Test: `tests/episode-manifest.test.mjs`, `tests/boords-handoff.test.mjs`

- [ ] Add failing tests for optional `planning.imageCount` metadata, optional `scene.storyBeatId`, legacy fixture compatibility, and one proposed frame per shot.
- [ ] Implement strict additive validation and deterministic manual handoff mapping.
- [ ] Run focused and full suites.

### Task 4: Dependency binding and documentation

**Files:**
- Modify: `scripts/production-state.mjs` only if the existing reconciliation API cannot express plan changes.
- Modify: `docs/producer-guide.md`
- Test: `tests/production-state.test.mjs`, `tests/producer-e2e.test.mjs`

- [ ] Add a failing regression for plan dependency changes invalidating storyboard/images/audio/captions/rendering approvals with a reason.
- [ ] Implement the narrowest additive dependency binding and preserve artifacts/receipts.
- [ ] Document recommended/custom planning, replan-after-TTS, exact-count limitations, and offline/no-generation behavior.
- [ ] Run all mandatory checks, including focused tests, producer E2E, `git diff --check`, and supported synthetic FFmpeg/FFprobe verification.
- [ ] Commit the scoped implementation, push the branch, create a PR targeting `master`, and record exact SHA, CI, tests, limitations, and unrun checks on the Trello card before moving it to `In Review`.
