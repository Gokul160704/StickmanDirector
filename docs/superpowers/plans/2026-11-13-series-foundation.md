# Series Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an offline, versioned series bible and safe opt-in multi-episode scaffold without changing existing single-episode or provider integrations.

**Architecture:** `scripts/series-bible.mjs` owns canonical JSON, validation, SHA-256 revision integrity, append-only snapshots, and scaffold creation. `scripts/new-series.mjs` preserves its positional legacy path and delegates only the new `--multi-episode` mode. Episode manifests remain the existing schema-v1 `episode.json` contract.

**Tech Stack:** Node.js ESM, Node built-ins (`fs/promises`, `crypto`, `path`), `node:test`.

**Spec:** Trello card #17 handoff and `docs/GITHUB_AGENT_GOVERNANCE.md`.

## Global Constraints

- No provider calls, media generation, Boords/Flow/Gemini changes, or Producer integration changes.
- Existing positional `new-series.mjs` output remains supported.
- New episode count is a positive integer; default is 3.
- Approved revisions and existing files are immutable; all writes use exclusive creation and safe-root checks.
- No credentials or generated media are stored.

## Review Focus

- Symlink and traversal paths must fail closed before writes.
- Hashes must cover canonical content and reject stale or malformed revisions.
- Duplicate IDs and predecessor cycles must be rejected deterministically.
- Partial scaffold failure must not delete pre-existing data.
- Legacy manifests with 8 or 36 scenes must remain untouched and valid.

### Task 1: Bible contract and revision engine

**Files:**
- Create: `scripts/series-bible.mjs`
- Test: `tests/series-bible.test.mjs`

- [ ] Add failing tests for deterministic creation, IDs, duplicate/cycle/path/hash rejection, immutable snapshots, and approved revision preservation.
- [ ] Implement pure creation/validation/hash/update/scaffold APIs with append-only snapshots and safe references.
- [ ] Run focused and full tests.

### Task 2: Additive CLI scaffold

**Files:**
- Modify: `scripts/new-series.mjs`
- Test: `tests/new-series.test.mjs`

- [ ] Add failing subprocess tests for 3, 1, 5, legacy mode, and no-overwrite behavior.
- [ ] Implement `--multi-episode` parsing and delegation while preserving legacy output.
- [ ] Validate generated manifests and run focused/full tests.

### Task 3: Documentation and final verification

**Files:**
- Modify: `docs/creating-a-video-series.md`
- Create: `docs/series-foundation.md`

- [ ] Document the schema, revisions, safe paths, CLI, and offline guarantees.
- [ ] Run `npm ci`, all required tests, manifest validation, and `git diff --check`.
- [ ] Confirm reserved integration files are unchanged and prepare PR evidence.
