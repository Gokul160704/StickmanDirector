# Stage and Batch Contract Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Correct all six Chief findings in the merged #22 contracts without rewriting PR #18 or broadening provider scope.

**Architecture:** Keep the existing additive modules and harden their owning boundaries. Continuity references will use one canonical versioned hash, strict SHA-256 and optional project-root byte/symlink verification with atomic replacement. Stage execution will recompute a digest from immutable request fields and require capability identity plus explicit authorization/budget evidence. Batch records will verify frozen bundles, bind idempotency to provider/model/seed, enforce legal status transitions, and make completed records immutable.

**Tech Stack:** Node.js 20+ ESM, built-in `node:test`, `node:crypto`, synchronous local filesystem verification for the existing synchronous registry API.

**Spec:** Trello #22 Chief remediation handoff and seven unchecked remediation gates.

## Constraints

- Preserve merged PR #18; create a new corrective PR targeting `master`.
- No provider calls, media generation, credits, Boords changes, credentials, or publication.
- Preserve schema-v1 and existing still-only behavior.
- Keep 1/3/8/36/100+ batch sizes and existing public module entry points compatible where possible.

### Task 1: Continuity integrity and atomic replacement

- [ ] Add RED tests for unchanged bundle success, changed bundle failure, strict lowercase SHA-256, actual bytes, containment/symlink rejection, deep immutability, forged bundle rejection, and invalid replacement preserving the prior reference.
- [ ] Implement one canonical hash payload including `version`, exact strict hash validation, project-root file verification, deep freeze, and validate-before-swap replacement.

### Task 2: Stage consent and capability hardening

- [ ] Add RED tests for post-consent request mutation, provider/stage mismatch, unsupported execute capability, and missing independent authorization/budget evidence.
- [ ] Implement recomputed request digest checks and fail-closed capability/consent validation.

### Task 3: Batch immutability and identity binding

- [ ] Add RED tests for same-status completed-output mutation, unauthorized approval transitions, provider/model/seed idempotency differences, and forged reference bundles.
- [ ] Implement immutable completed records, legal transitions, approval provenance, verified bundle hashes, and complete idempotency identity.

### Task 4: Verification and handoff

- [ ] Run focused tests, `npm ci`, full `npm test`, manifest validation, `git diff --check`, and exact-head hosted CI.
- [ ] Open a new PR, hand exact head to independent Chief, and leave #23–#25 untouched until #22 is independently accepted and merged.

