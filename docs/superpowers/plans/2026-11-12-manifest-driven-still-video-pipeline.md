# Manifest-Driven Still Video Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the five-image fallback with a validated, resumable, manifest-driven still-image production pipeline while preserving the legacy CLI.

**Architecture:** `scripts/episode-manifest.mjs` owns the versioned manifest contract, path safety, and actionable validation. `new-series.mjs` creates the canonical scaffold and starter manifest. `render-episode.mjs` consumes canonical manifests for arbitrary ordered scenes, explicit timing, captions, and optional audio, while retaining the existing five-image discovery mode as a compatibility path. Flow prompt generation accepts either canonical episode metadata or the existing prompt-pack JSON.

**Tech Stack:** Node.js ESM (>=20), built-in `node:test`, FFmpeg/FFprobe, JSON and SRT.

**Spec:** User-pasted StickmanDirector Master Worker Implementation Mission.

## Global Constraints

- Assemble video exclusively from still images; do not implement image-to-video generation.
- Do not call paid Flow or Gemini services during tests.
- Preserve safe slug generation, no-overwrite behavior, existing TTS safety gates, and legacy renderer invocation.
- Keep episode/project media local and ignored by default.
- Use relative manifest asset paths and reject paths that escape the project root.

## Review Focus

- A manifest with an escaping image/audio path must fail before FFmpeg runs.
- One scene and arbitrary scene counts must render without five-scene assumptions.
- Explicit scene durations and audio duration must not silently desynchronize.
- Caption ranges must be ordered, bounded, and readable when explicit timings are supplied.
- Failed FFmpeg execution must surface the command failure without claiming an export.

### Task 1: Manifest contract and scaffold

**Files:**
- Create: `scripts/episode-manifest.mjs`
- Modify: `scripts/new-series.mjs`
- Create: `templates/series-project/episode.json`
- Modify: `templates/series-project/README.md`
- Test: `tests/episode-manifest.test.mjs`

**Interfaces:**
- `validateEpisodeManifest(manifest, { root }) -> normalizedManifest`
- `loadEpisodeManifest(file, { root }) -> normalizedManifest`
- `assertSafeRelativeAssetPath(value, field) -> value`

- [ ] Add failing tests for required fields, relative-path safety, ordered scenes, and valid normalization.
- [ ] Implement the versioned manifest schema and actionable errors.
- [ ] Update the scaffold to create `script/`, `continuity/`, `references/environments/`, `images/`, and `exports/`, plus compatibility files/directories.
- [ ] Add a starter `episode.json` that is valid but contains no scene assets.
- [ ] Run manifest tests and scaffold smoke checks.

### Task 2: Canonical Flow prompt handoff

**Files:**
- Modify: `scripts/build-flow-prompt-pack.mjs`
- Modify: `templates/series-project/flow-prompts.example.json`
- Test: `tests/flow-prompt-pack.test.mjs`

- [ ] Add failing tests proving canonical metadata produces still-only prompts with character/prop references and no paid calls.
- [ ] Implement canonical manifest input alongside the legacy input shape.
- [ ] Generate separate reference and scene sections; retain legacy image-to-video text only for legacy prompt packs and document that it is not part of local rendering.
- [ ] Run prompt-pack tests.

### Task 3: Manifest renderer and captions

**Files:**
- Modify: `scripts/render-episode.mjs`
- Modify: `package.json`
- Test: `tests/render-episode.test.mjs`

- [ ] Add failing tests for arbitrary scene counts, explicit durations, caption timing validation, output defaults, and legacy compatibility.
- [ ] Implement canonical plan creation with optional audio, safe subprocess execution, temporary concat cleanup, scale/pad to 1920x1080, 30fps H.264/AAC, and FFprobe verification.
- [ ] Support per-scene captions and explicit SRT timings; retain proportional timing only as an explicitly reported fallback.
- [ ] Keep `renderEpisode(root, part)` and the old five-image discovery contract working.
- [ ] Add `npm test` and focused render commands.
- [ ] Run unit tests and a local FFmpeg smoke test with synthetic media.

### Task 4: Contracts and workflow documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/workflow.md`
- Modify: `templates/series-project/README.md`
- Modify: `AGENTS.md`
- Modify: `docs/image-to-video-workflow.md`
- Test: `tests/fixtures/episode.json`

- [ ] Document manifest fields, migration from older five-image projects, render commands, and verification output.
- [ ] Align documentation with still-image-only local assembly while preserving Flow/Boords handoff boundaries.
- [ ] Add a small reproducible manifest fixture without media or credentials.
- [ ] Run the complete suite and inspect git diff/status.

## Verification

Run `npm test`, then execute a synthetic FFmpeg render using generated stills and silent WAV audio. Verify output existence, 1920x1080 resolution, 30fps video, H.264/AAC streams, duration, and valid SRT ranges. Report external Flow/Boords/Gemini integrations as unverified unless independently exercised.
