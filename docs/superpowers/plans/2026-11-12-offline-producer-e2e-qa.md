# Offline Producer E2E QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, no-network Producer end-to-end QA harness that proves synthetic guided episode state, render output, captions, recovery, and release gates without invoking external providers.

**Architecture:** Build one small offline orchestration module around the existing producer session, durable state, manifest, caption, and FFmpeg render primitives. Provider integrations are represented by explicit in-memory receipts and never imported as live clients. Tests create temporary synthetic assets, force recovery/invalidation cases, and inspect the resulting MP4/SRT with existing local tooling.

**Tech Stack:** Node.js ESM, `node:test`, existing repository state/manifest/render modules, local FFmpeg/FFprobe.

**Spec:** Trello card `[P1][Chief→Worker] Producer Agent end-to-end QA and release acceptance` and its Chief QA plan on `https://trello.com/c/UeyvcVHN`.

## Global Constraints

- Offline tests must not contact Flow, Gemini, Boords, or any external service.
- Synthetic provider receipts must remain visibly non-live and must not authorize billing, publication, or creative acceptance.
- A fresh production topic/run is out of scope; the accepted 36-shot pilot remains regression evidence only.
- Preserve manual Chief/Worker claim, exact-head PR review, merge, and human creative-approval safeguards.
- Existing `episode.json` semantics and local render behavior remain compatible.

## Review Focus

- A synthetic receipt must never be mistaken for provider entitlement or spend approval — test release rejection when live approval is absent.
- A forced crash after an approved artifact must resume without duplicating a billable command — test stable receipt and artifact hashes.
- A changed model/ratio or stale shot must invalidate release — test explicit invalidation.
- Missing storyboard assets or a missing human decision must fail clearly — test both release gates.
- Output duration, codec, dimensions, frame rate, SRT ordering, and audio presence must be checked from actual local files — test FFprobe-backed assertions.

### Task 1: Offline orchestration contract

**Files:**
- Create: `scripts/producer-e2e.mjs`
- Test: `tests/producer-e2e.test.mjs`

**Interfaces:**
- Consumes: existing `producer-session`, durable state, manifest, and render helpers.
- Produces: `runOfflineProducerE2E(options) -> Promise<{ checkpoint, output, captions, receipts, release }>` and explicit gate errors.

- [ ] **Step 1: Write failing tests** for a fully approved synthetic 16:9 episode, provider receipts marked `offline-synthetic`, and release rejection without human creative acceptance.
- [ ] **Step 2: Run `node --test tests/producer-e2e.test.mjs` and confirm it fails because the orchestration module is absent.**
- [ ] **Step 3: Implement the smallest orchestration path** that creates temporary synthetic assets, records non-live receipts, writes a checkpoint, renders the local MP4/SRT through existing helpers, and keeps release false until all explicit gates are supplied.
- [ ] **Step 4: Run the focused test and confirm it passes.**
- [ ] **Step 5: Commit `feat: add offline producer e2e harness`.**

### Task 2: Recovery and invalidation gates

**Files:**
- Modify: `scripts/producer-e2e.mjs`
- Test: `tests/producer-e2e.test.mjs`

**Interfaces:**
- Consumes: Task 1 `runOfflineProducerE2E` and checkpoint output.
- Produces: deterministic recovery receipts, no-duplicate retry behavior, and fail-closed invalidation.

- [ ] **Step 1: Add failing tests** for forced crash/restart, one failed synthetic shot retry, changed model/ratio invalidation, missing asset, and missing human decision.
- [ ] **Step 2: Run the focused tests and confirm each new assertion fails for the intended missing gate.**
- [ ] **Step 3: Implement recovery/read-back and invalidation with explicit receipt fingerprints; never mark a synthetic provider operation billable or approved.**
- [ ] **Step 4: Run the focused tests and confirm they pass.**
- [ ] **Step 5: Commit `test: cover offline producer recovery and release gates`.**

### Task 3: Full verification and handoff

**Files:**
- Modify: `docs/producer-guide.md` (offline QA command and scope only)

- [ ] **Step 1: Run `npm test`, `node --test tests/producer-e2e.test.mjs`, `npm run validate:episode -- C:\Users\ponna\Project\StickmanDirector\projects\why-do-we-dream\episode.json`, and `git diff --check`.**
- [ ] **Step 2: Confirm all tests pass and no network/provider calls or generated production media occurred.**
- [ ] **Step 3: Commit `docs: document offline producer e2e verification`.**

## Completion Evidence

- Focused offline E2E tests pass with actual MP4/SRT and FFprobe assertions.
- Full repository tests pass.
- Canonical 36-scene manifest remains valid.
- Worktree contains no production-media or secret changes.
- A Trello Worker claim and PR handoff identify the exact branch/SHA and preserve the separate live-run/human-review gate.
