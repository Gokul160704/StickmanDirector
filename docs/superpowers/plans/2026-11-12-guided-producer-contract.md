# Guided Producer Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Define a deterministic offline state/question/provider-entitlement contract for the Guided Producer before implementing its interactive UX.

**Architecture:** A pure JSON-safe module owns an ordered stage state machine, explicit answers, approvals, navigation, invalidation records, and provider catalog/entitlement separation. Tests exercise every transition without filesystem, network, provider, or billing access.

**Tech Stack:** Node.js 20+, built-in `node:test`, ES modules.

**Spec:** Trello card `[P0][Worker] Define offline Guided Producer state and provider-choice contract`.

## Global Constraints

- No live/network/provider calls, credits, billing, media generation, publication, or automatic dispatch.
- Approved stages remain unchanged until an explicit invalidation operation.
- Provider catalog metadata and account entitlement are separate records.
- Invalid transitions and unavailable providers throw safe actionable errors.

---

### Task 1: Implement the pure contract

**Files:** `scripts/producer-contract.mjs`, `tests/producer-contract.test.mjs`, `docs/producer-contract.md`

- [ ] Write failing tests for creation, answer/save/resume, sequential transitions, back/edit, approval preservation, explicit invalidation, provider separation, unavailable-provider errors, and no-network startup.
- [ ] Run the focused test and observe the expected missing-module failure.
- [ ] Implement the minimal JSON-safe functions: `createProducerSession`, `answerQuestion`, `advanceStage`, `goBack`, `invalidateFrom`, `resumeProducerSession`, and `resolveProviderChoice`.
- [ ] Run focused tests and the full `npm test` suite.
- [ ] Run manifest validation and `git diff --check`.
- [ ] Commit the implementation and documentation.
