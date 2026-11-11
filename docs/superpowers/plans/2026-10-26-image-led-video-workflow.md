# Image-Led Video Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make StickmanDirector the primary Flow image-to-video workflow and retire the code-drawn character renderer from active use.

**Architecture:** Boords remains the story/review workspace. GTAI-1 `flow-mcp` creates reviewed 16:9 image references and image-to-video clips in Flow; Gemini TTS creates narration; Flow MCP assembly or the still-image renderer produces review media. Keep the legacy still-image renderer as an optional fallback, not the character-animation engine.

**Tech Stack:** Node.js ES modules, GTAI-1 Flow MCP, Google Flow, Boords MCP, Gemini TTS helper, FFmpeg/FFprobe, local Whisper captions.

**Spec:** `docs/superpowers/specs/2026-10-26-image-led-video-workflow-design.md`

## Global Constraints

- Default frame is 16:9 landscape, matching the supplied reference.
- Use original scripts, character designs, art, and branding; do not reproduce the reference account's watermark.
- Generate each video scene from an approved still/reference through Google Flow image-to-video.
- Preserve the user's Flow approval and credit gates for every new paid batch.
- Keep projects and generated media local and ignored by default.
- Keep the existing Gemini TTS helper and the older still-image renderer.
- Do not delete or modify the separate `Stickman video director` checkout while it has uncommitted work.

## Review Focus

- A prompt pack omits or corrupts the 16:9 aspect ratio: verify generated markdown states the required aspect ratio per scene.
- A scene has an image prompt but no motion direction: verify the pack keeps still-art and image-to-video prompts distinct.
- A recurring character changes between scenes: verify each scene can point to the approved character reference and continuity notes.
- A video prompt includes captions or headings in generated art: keep captions and presentation text out of generated images unless the story explicitly needs in-world text.
- Renderer retirement breaks the still-image fallback: retain its script/test and move its npm command to a stills-specific name.

---

### Task 1: Retire the code-drawn character renderer

**Files:**
- Delete: `scripts/engine/character.mjs`, `scripts/engine/keyframes.mjs`, `scripts/engine/manifest.mjs`, `scripts/engine/render-episode.mjs`
- Delete: `templates/engine-project/episode.example.json`, `docs/engine-setup.md`
- Delete: engine-only `docs/superpowers/plans/2026-10-25-stickman-engine.md` and `docs/superpowers/specs/2026-10-25-stickman-engine-integration-design.md`
- Modify: `package.json`, `package-lock.json`
- Keep: `scripts/render-episode.mjs`, `tests/render-episode.test.mjs`; rename the npm command to `render:stills`.

- [x] Remove the Canvas dependency and code-animation command; preserve Node and the still-image renderer.
- [x] Update package metadata to describe the Flow image-led workflow.
- [x] Verify structurally that the package lock has no Canvas package and the still-image command remains available.

### Task 2: Make Flow image-to-video the documented workflow

**Files:**
- Modify: `AGENTS.md`, `README.md`, `docs/workflow.md`
- Create: `docs/image-to-video-workflow.md`

- [x] Replace code-animation and 9:16-first guidance with the approved 16:9 image-to-video flow.
- [x] Document storyboard → approved still/reference → Flow image-to-video clip → Gemini narration → captions/assembly → review.
- [x] Document continuity, quote/approval gates, and the reference's illustrative characteristics without copying its branding.
- [x] Link the new workflow from the README and workflow docs.

### Task 3: Update prompt-pack examples for still and motion prompts

**Files:**
- Modify: `templates/series-project/flow-prompts.example.json`, `scripts/build-flow-prompt-pack.mjs`

- [x] Add an explicit 16:9 series default and separate `imagePrompt` and `videoPrompt` fields per scene.
- [x] Emit approved-image instructions and image-to-video motion prompts as distinct blocks in the markdown pack.
- [x] Keep the tool as a local text-pack builder; it must not submit to Flow or spend credits.
- [x] Verify structurally that the example JSON parses and the pack builder includes both prompts and 16:9 instructions.

### Task 4: Review repository retirement boundary

- [x] Confirm the main repo contains no active instructions for code-drawn character animation; historical notes only describe the retired renderer.
- [x] Preserve the separate old checkout and its uncommitted changes until the user explicitly resolves whether to archive/delete the local checkout and/or delete its distinct GitHub repository.
